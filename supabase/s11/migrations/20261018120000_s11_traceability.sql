-- Traçabilité (journal d'activité, surbrillance Super Admin), ajustement des propositions, libellés « / dépose ».

-- 1. Surbrillance d'une entrée du journal pour examen ultérieur
create table if not exists plans_prevention.trace_highlights (
  entry_id bigint primary key references plans_prevention.audit_logs(id) on delete cascade,
  highlighted_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
alter table plans_prevention.trace_highlights enable row level security;
create policy trace_highlights_admin on plans_prevention.trace_highlights for all to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());
grant select, insert, update, delete on plans_prevention.trace_highlights to authenticated;

-- 2. Journal des événements observés par l'application (connexion, import, erreur)
create or replace function plans_prevention.log_activity(p_action text, p_entity text, p_entity_id text, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_active_user() then return; end if;
  if p_action not in ('LOGIN', 'IMPORT', 'ERROR') then return; end if;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), p_action, left(coalesce(p_entity, ''), 100), left(coalesce(p_entity_id, ''), 200), coalesce(p_payload, '{}'::jsonb));
end $$;

create or replace function plans_prevention.set_trace_highlight(p_entry bigint, p_on boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if p_on then
    insert into plans_prevention.trace_highlights(entry_id, highlighted_by, note) values (p_entry, auth.uid(), p_note)
    on conflict (entry_id) do update set note = excluded.note, highlighted_by = excluded.highlighted_by, created_at = now();
  else
    delete from plans_prevention.trace_highlights where entry_id = p_entry;
  end if;
end $$;

-- 3. Traçabilité : toutes les entrées, catégorisées, filtrables
create or replace function plans_prevention.traceability(
  p_from timestamptz, p_to timestamptz, p_user uuid default null, p_category text default null, p_only_errors boolean default false)
returns table(entry_id bigint, occurred_at timestamptz, actor_user_id uuid, actor_email text, action text, category text,
              entity text, entity_id text, summary text, payload jsonb, highlighted boolean, highlight_note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  return query
  with base as (
    select a.id as e_id, a.created_at as e_at, a.actor_user_id as e_actor, pr.email::text as e_email, a.action as e_action,
      case
        when a.action = 'PLAN_SAVED' then 'Nature : ' || coalesce(n.group_label, 'sans nature')
        when a.action = 'PLAN_STATUS_CHANGED' then 'Suivi des plans'
        when a.action like 'SCOPE%' or a.action = 'ORDER_SCOPE_SET' then 'Périmètre'
        when a.action like 'REFERENTIAL%' or a.action like 'CORPS_NAAC%' then 'Référentiel'
        when a.action = 'LOGIN' then 'Connexions'
        when a.action = 'IMPORT' then 'Imports'
        when a.action = 'ERROR' then 'Erreurs'
        else 'Autre'
      end as e_cat,
      a.entity as e_entity, a.entity_id as e_entity_id,
      case
        when a.action = 'PLAN_SAVED' then 'Plan enregistré : ' || coalesce(n.label, 'proposition en attente')
        when a.action = 'PLAN_STATUS_CHANGED' then 'Statut ' || coalesce(a.payload->>'from', '') || ' → ' || coalesce(a.payload->>'to', '')
        when a.action = 'ERROR' then coalesce(a.payload->>'message', 'Erreur')
        when a.action = 'LOGIN' then 'Connexion'
        when a.action = 'IMPORT' then 'Import ' || coalesce(a.payload->>'file', '') || ' : ' || coalesce(a.payload->>'summary', '')
        when a.action like 'REFERENTIAL%' or a.action like 'CORPS_NAAC%' then
          coalesce(a.payload->>'label', a.payload->>'kind', a.action) || coalesce(' → ' || (a.payload->>'status'), '') || coalesce(' ' || (a.payload->>'corps_label'), '')
        when a.action like 'SCOPE%' or a.action = 'ORDER_SCOPE_SET' then 'Commande ' || coalesce(a.entity_id, '') || coalesce(' : ' || (a.payload->>'reason'), '')
        else a.action || ' ' || coalesce(a.entity_id, '')
      end as e_summary,
      a.payload as e_payload,
      (h.entry_id is not null) as e_hl, h.note as e_note
    from plans_prevention.audit_logs a
    left join plans_prevention.profiles pr on pr.user_id = a.actor_user_id
    left join plans_prevention.natures n on (a.payload->>'nature_id') ~ '^[0-9]+$' and n.id = (a.payload->>'nature_id')::bigint
    left join plans_prevention.trace_highlights h on h.entry_id = a.id
    where a.created_at >= p_from and a.created_at < p_to
      and (p_user is null or a.actor_user_id = p_user)
      and (not p_only_errors or a.action = 'ERROR')
  )
  select b.e_id, b.e_at, b.e_actor, b.e_email, b.e_action, b.e_cat, b.e_entity, b.e_entity_id, b.e_summary, b.e_payload, b.e_hl, b.e_note
    from base b
   where p_category is null or b.e_cat = p_category
   order by b.e_at desc;
end $$;

-- 4. Ajustement d'une correspondance NAAC avant validation (lot choisi par le Super Admin)
drop function if exists plans_prevention.decide_corps_naac(bigint, boolean, text);
create or replace function plans_prevention.decide_corps_naac(p_id bigint, p_approve boolean, p_comment text, p_lot int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r plans_prevention.referential_proposals; v_lot int; v_status text;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  select * into r from plans_prevention.referential_proposals where id = p_id for update;
  if not found or r.kind <> 'CORPS_NAAC' or r.status <> 'EN_ATTENTE' then raise exception 'Proposition introuvable ou déjà traitée'; end if;
  v_lot := coalesce(p_lot, (r.payload->>'lot_code')::int);
  v_status := case when not p_approve then 'REFUSEE'
                   when v_lot <> (r.payload->>'lot_code')::int then 'AJUSTEE' else 'APPROUVEE' end;
  if p_approve then
    insert into plans_prevention.naac_corps_etat(naac, corps_label, lot_code, validated)
    values (r.payload->>'naac', r.payload->>'corps_label', v_lot, true)
    on conflict (naac, corps_label) do update set lot_code = excluded.lot_code, validated = true;
  end if;
  update plans_prevention.referential_proposals
     set status = v_status, decided_by = auth.uid(), decided_at = now(), decision_comment = p_comment,
         payload = jsonb_set(r.payload, '{lot_code}', to_jsonb(v_lot))
   where id = p_id;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'CORPS_NAAC_DECIDED', 'referential_proposals', p_id::text,
    jsonb_build_object('status', v_status, 'comment', p_comment, 'lot_code', v_lot));
end $$;

-- 5. Libellés : une nature dont la pose est l'opération principale inclut la dépose
update plans_prevention.natures
   set label = label || ' / dépose'
 where lower(translate(label, 'éèêàç', 'eeeac')) ~ '(^|[:(])\s*pos(e|er)\M'
   and lower(translate(label, 'éèêàç', 'eeeac')) !~ 'depos';

-- 6. Droits
revoke execute on function plans_prevention.log_activity(text,text,text,jsonb) from public, anon;
revoke execute on function plans_prevention.set_trace_highlight(bigint,boolean,text) from public, anon;
revoke execute on function plans_prevention.traceability(timestamptz,timestamptz,uuid,text,boolean) from public, anon;
revoke execute on function plans_prevention.decide_corps_naac(bigint,boolean,text,int) from public, anon;
grant execute on function plans_prevention.log_activity(text,text,text,jsonb) to authenticated;
grant execute on function plans_prevention.set_trace_highlight(bigint,boolean,text) to authenticated;
grant execute on function plans_prevention.traceability(timestamptz,timestamptz,uuid,text,boolean) to authenticated;
grant execute on function plans_prevention.decide_corps_naac(bigint,boolean,text,int) to authenticated;
