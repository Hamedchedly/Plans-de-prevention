-- S11 : chargés créateurs de commandes, contacts, délégation, modèles de mail et de PDF, indicateurs, dates de fiche.

-- 1) Délégation : le chargé peut réaffecter ses propres commandes ; retirer une commande sans destinataire reste réservé au manager.
create or replace function plans_prevention.reassign_order(p_order text, p_operator text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_old text; v_new text := nullif(trim(coalesce(p_operator, '')), '');
begin
  select operator_code into v_old from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or (v_old is not null and v_old = plans_prevention.current_operator())) then
    raise exception 'Accès refusé';
  end if;
  if v_new is null and not plans_prevention.is_manager() then raise exception 'Indiquez le chargé destinataire'; end if;
  update plans_prevention.orders set operator_code = v_new, updated_at = now() where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDER_REASSIGNED', 'orders', p_order, jsonb_build_object('from', v_old, 'to', v_new));
end $$;

-- 2) Contacts des chargés (personne à alerter) : identité, téléphone, mail, état du compte.
create or replace function plans_prevention.operator_contacts(p_codes text[])
returns table(operator_code text, full_name text, phone text, email text, is_active boolean, complete boolean)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not plans_prevention.is_active_user() then raise exception 'Accès refusé'; end if;
  return query
  select p.operator_code,
         nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
         nullif(trim(coalesce(p.phone, '')), ''),
         nullif(trim(coalesce(p.contact_email, p.email, '')), ''),
         p.is_active,
         (nullif(trim(coalesce(p.first_name, '')), '') is not null and nullif(trim(coalesce(p.last_name, '')), '') is not null
          and nullif(trim(coalesce(p.phone, '')), '') is not null and nullif(trim(coalesce(p.contact_email, p.email, '')), '') is not null)
    from plans_prevention.profiles p
   where p.operator_code = any(p_codes);
end $$;

-- 3) Fonction unique : chargés créateurs de commandes, groupés par état du compte.
create or replace function plans_prevention.list_order_creators()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  return (
    with ops as (
      select o.operator_code as code, count(*) as orders
        from plans_prevention.orders o
       where o.operator_code is not null and o.trashed_at is null
       group by o.operator_code
    ), enriched as (
      select ops.code, ops.orders, p.user_id, p.role::text as role, p.is_active,
             nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '') as full_name,
             nullif(trim(coalesce(p.phone, '')), '') as phone,
             nullif(trim(coalesce(p.contact_email, p.email, '')), '') as email,
             case
               when p.user_id is null then 'NON_INSCRIT'
               when not p.is_active then 'INACTIF'
               when nullif(trim(coalesce(p.first_name, '')), '') is null or nullif(trim(coalesce(p.last_name, '')), '') is null
                 or nullif(trim(coalesce(p.phone, '')), '') is null or nullif(trim(coalesce(p.contact_email, p.email, '')), '') is null
                 then 'ACTIF_INCOMPLET'
               else 'ACTIF_COMPLET'
             end as statut
        from ops left join plans_prevention.profiles p on p.operator_code = ops.code
    )
    select jsonb_build_object(
      'ACTIF_COMPLET',   coalesce((select jsonb_agg(to_jsonb(e) - 'statut' order by e.code) from enriched e where e.statut = 'ACTIF_COMPLET'), '[]'::jsonb),
      'ACTIF_INCOMPLET', coalesce((select jsonb_agg(to_jsonb(e) - 'statut' order by e.code) from enriched e where e.statut = 'ACTIF_INCOMPLET'), '[]'::jsonb),
      'INACTIF',         coalesce((select jsonb_agg(to_jsonb(e) - 'statut' order by e.code) from enriched e where e.statut = 'INACTIF'), '[]'::jsonb),
      'NON_INSCRIT',     coalesce((select jsonb_agg(to_jsonb(e) - 'statut' order by e.code) from enriched e where e.statut = 'NON_INSCRIT'), '[]'::jsonb)
    )
  );
end $$;

-- 4) Dates de la fiche : rédigée, envoyée, retour reçu (issues du journal).
create or replace function plans_prevention.plan_dates(p_orders text[])
returns table(order_number text, drafted_at timestamptz, sent_at timestamptz, returned_at timestamptz)
language plpgsql stable security definer set search_path to '' as $$
#variable_conflict use_column
begin
  if not plans_prevention.is_active_user() then raise exception 'Accès refusé'; end if;
  return query
  select o.order_number,
    (select min(a.created_at) from plans_prevention.audit_logs a where a.action = 'PLAN_SAVED' and a.entity_id = o.order_number),
    (select min(a.created_at) from plans_prevention.audit_logs a where a.action = 'PLAN_STATUS_CHANGED' and a.entity_id = o.order_number and a.payload->>'to' = 'EN_ATTENTE_RETOUR'),
    (select min(a.created_at) from plans_prevention.audit_logs a where a.action = 'PLAN_STATUS_CHANGED' and a.entity_id = o.order_number and a.payload->>'to' = 'ARCHIVEE')
  from plans_prevention.orders o
  where o.order_number = any(p_orders);
end $$;

-- 5) Indicateurs : périmètre, statuts, activité sur la période, délais, détail par chargé.
create or replace function plans_prevention.kpi_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  return (
    with ev as (
      select a.entity_id as order_number,
             min(a.created_at) filter (where a.action = 'PLAN_SAVED') as drafted,
             min(a.created_at) filter (where a.action = 'PLAN_STATUS_CHANGED' and a.payload->>'to' = 'EN_ATTENTE_RETOUR') as sent,
             min(a.created_at) filter (where a.action = 'PLAN_STATUS_CHANGED' and a.payload->>'to' = 'ARCHIVEE') as returned
        from plans_prevention.audit_logs a
       where a.entity = 'orders' and a.action in ('PLAN_SAVED', 'PLAN_STATUS_CHANGED')
       group by a.entity_id
    ), base as (
      select o.order_number, o.operator_code, o.scope_status, o.scope_override, o.scope_request_status, o.plan_status,
             ev.drafted, ev.sent, ev.returned
        from plans_prevention.orders o
        left join ev on ev.order_number = o.order_number
       where o.trashed_at is null
    )
    select jsonb_build_object(
      'periode', jsonb_build_object('de', p_from, 'a', p_to),
      'perimetre', jsonb_build_object(
        'dans_perimetre', (select count(*) from base where scope_status = 'IN_SCOPE'),
        'hors_perimetre', (select count(*) from base where scope_status = 'OUT_OF_SCOPE'),
        'forcees', (select count(*) from base where scope_override),
        'exclusions_en_attente', (select count(*) from base where scope_request_status = 'EN_ATTENTE')),
      'statuts', (select coalesce(jsonb_object_agg(s.plan_status, s.n), '{}'::jsonb)
                    from (select plan_status, count(*) as n from base where scope_status = 'IN_SCOPE' group by 1) s),
      'fiches_creees_periode', (select count(*) from base where drafted >= p_from and drafted < p_to),
      'envoyees_periode', (select count(*) from base where sent >= p_from and sent < p_to),
      'retours_periode', (select count(*) from base where returned >= p_from and returned < p_to),
      'delai_moyen_retour_jours', (select round(avg(extract(epoch from (returned - sent)) / 86400)::numeric, 1)
                                     from base where returned is not null and sent is not null),
      'par_charge', (select coalesce(jsonb_agg(jsonb_build_object(
                        'code', c.code, 'dans_perimetre', c.dans, 'a_qualifier', c.a_qual, 'fiches', c.fiches,
                        'envoyees', c.env, 'retournees', c.ret, 'delai_jours', c.delai) order by c.code), '[]'::jsonb)
                       from (select operator_code as code,
                                    count(*) filter (where scope_status = 'IN_SCOPE') as dans,
                                    count(*) filter (where scope_status = 'IN_SCOPE' and plan_status = 'NON_QUALIFIEE') as a_qual,
                                    count(*) filter (where scope_status = 'IN_SCOPE' and plan_status <> 'NON_QUALIFIEE') as fiches,
                                    count(*) filter (where scope_status = 'IN_SCOPE' and plan_status in ('EN_ATTENTE_RETOUR', 'ARCHIVEE')) as env,
                                    count(*) filter (where scope_status = 'IN_SCOPE' and plan_status = 'ARCHIVEE') as ret,
                                    round(avg(extract(epoch from (returned - sent)) / 86400) filter (where returned is not null and sent is not null)::numeric, 1) as delai
                               from base where operator_code is not null group by operator_code) c)
    )
  );
end $$;

-- 6) Modèles de mail et de PDF, modifiables par le Super Admin.
insert into plans_prevention.app_settings(key, value, updated_at) values
  ('mail_objet', 'Plan de prévention – commande {commande} – {entreprise}', now()),
  ('mail_corps', 'Bonjour,' || chr(10) || chr(10) || 'Veuillez trouver ci-joint le plan de prévention relatif à la commande {commande} ({nature}).' || chr(10) || 'Période d’intervention : {periode}.' || chr(10) || chr(10) || 'Merci de nous le retourner signé.' || chr(10) || chr(10) || 'Cordialement,' || chr(10) || '{redacteur}', now()),
  ('pdf_procedure_alerte', '15 SAMU · 18 POMPIERS · 114 URGENCES · 17 POLICE SECOURS', now()),
  ('pdf_pied_de_page', 'Plan de prévention · commande {commande} · S11', now())
on conflict (key) do nothing;

create or replace function plans_prevention.app_setting_set(p_key text, p_value text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if p_key not in ('file_name_template', 'mail_objet', 'mail_corps', 'pdf_procedure_alerte', 'pdf_pied_de_page') then raise exception 'Paramètre inconnu'; end if;
  if nullif(trim(coalesce(p_value, '')), '') is null then raise exception 'Valeur vide'; end if;
  insert into plans_prevention.app_settings(key, value, updated_by, updated_at)
  values (p_key, trim(p_value), auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SETTING_CHANGED', 'app_settings', p_key, jsonb_build_object('value', trim(p_value)));
end $$;

-- Droits : fonctions réservées aux utilisateurs connectés
revoke execute on function plans_prevention.operator_contacts(text[]) from public, anon;
revoke execute on function plans_prevention.list_order_creators() from public, anon;
revoke execute on function plans_prevention.plan_dates(text[]) from public, anon;
revoke execute on function plans_prevention.kpi_summary(timestamptz, timestamptz) from public, anon;
grant execute on function plans_prevention.operator_contacts(text[]) to authenticated;
grant execute on function plans_prevention.list_order_creators() to authenticated;
grant execute on function plans_prevention.plan_dates(text[]) to authenticated;
grant execute on function plans_prevention.kpi_summary(timestamptz, timestamptz) to authenticated;
