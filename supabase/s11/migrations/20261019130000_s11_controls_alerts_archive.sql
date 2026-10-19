-- Contrôles des commandes (audit importé vs commandes), complétion manuelle, alertes modifiables,
-- décisions d'audit : 5114706 hors périmètre ; 5102014, 5104673, 5097762 archivées (obsolètes, travaux faits sans plan).

-- 1. Alertes : une décision « Modifier » enregistre la proposition corrigée (fonction séparée, decide_alert inchangée)
create or replace function plans_prevention.decide_alert_edit(p_code text, p_status text, p_comment text, p_proposal text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  if p_status not in ('VALIDE','MODIFIE','IGNORE','A_VALIDER','APPLIQUE_A_VALIDER') then raise exception 'Statut invalide'; end if;
  update plans_prevention.alerts
     set status = p_status,
         decision_comment = p_comment,
         proposal = coalesce(nullif(p_proposal, ''), proposal),
         decided_by = auth.uid(), decided_at = now()
   where code = p_code;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ALERT_DECIDED', 'alerts', p_code, jsonb_build_object('status', p_status, 'comment', p_comment, 'proposal', p_proposal));
end $$;
revoke execute on function plans_prevention.decide_alert_edit(text, text, text, text) from public, anon;
grant execute on function plans_prevention.decide_alert_edit(text, text, text, text) to authenticated;

-- 2. Contrôles : commandes auditées dont l'état ne correspond pas (absente des commandes, ou statut non appliqué)
create or replace function plans_prevention.order_controls()
returns table(order_number text, reason text, audit_status text, charge_name text, audit_date date, comment text, plan_status text, scope_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  return query
    select a.order_number,
      case when o.order_number is null then 'Commande absente des exports importés'
           else 'Statut « ' || coalesce(o.plan_status, '—') || ' » ne correspond pas à l’audit « ' || a.audit_status || ' »' end,
      a.audit_status, a.charge_name, a.audit_date, a.comment, o.plan_status, o.scope_status
      from plans_prevention.order_audit a
      left join plans_prevention.orders o on o.order_number = a.order_number
     where a.audit_status in ('ENVOYE', 'SIGNE')
       and (o.order_number is null
            or (o.scope_status = 'IN_SCOPE' and not (
                  (a.audit_status = 'ENVOYE' and o.plan_status = 'EN_ATTENTE_RETOUR')
               or (a.audit_status = 'SIGNE' and o.plan_status = 'SIGNEE'))))
     order by a.order_number;
end $$;
revoke execute on function plans_prevention.order_controls() from public, anon;
grant execute on function plans_prevention.order_controls() to authenticated;

-- 3. Détail d'une commande : toutes les données rattachées (commande, audit, suivi budgétaire, lignes d'import, historique)
create or replace function plans_prevention.order_control_detail(p_order text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  return jsonb_build_object(
    'order', (select to_jsonb(o) from plans_prevention.orders o where o.order_number = p_order),
    'audit', (select to_jsonb(a) from plans_prevention.order_audit a where a.order_number = p_order),
    'budget', coalesce((select jsonb_agg(jsonb_build_object('import_id', b.import_id, 'row_no', b.row_no, 'raw', b.raw))
                          from plans_prevention.budget_tracking b where b.order_number = p_order), '[]'::jsonb),
    'imports', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'file', i.file_name, 'row_no', r.row_no, 'raw', r.raw) order by i.created_at)
                           from plans_prevention.import_rows r join plans_prevention.imports i on i.id = r.import_id
                          where r.order_number = p_order), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('action', l.action, 'at', l.created_at, 'payload', l.payload) order by l.created_at)
                           from plans_prevention.audit_logs l where l.entity = 'orders' and l.entity_id = p_order), '[]'::jsonb));
end $$;
revoke execute on function plans_prevention.order_control_detail(text) from public, anon;
grant execute on function plans_prevention.order_control_detail(text) to authenticated;

-- 4. Complétion : crée la commande si elle est absente des exports, ou complète les champs saisis ; puis applique l'audit
create or replace function plans_prevention.complete_order(p_order text, p_fields jsonb, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare f jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  if p_order is null or p_order !~ '^[0-9A-Za-z-]+$' then raise exception 'Numéro de commande invalide'; end if;
  if not exists (select 1 from plans_prevention.orders where order_number = p_order) then
    insert into plans_prevention.orders(order_number, source_updated_at, scope_status, scope_override, plan_status, qualification_status)
    values (p_order, now(), 'IN_SCOPE', false, 'NON_QUALIFIEE', 'A_QUALIFIER');
  end if;
  update plans_prevention.orders set
    sector_code = coalesce(nullif(f->>'sector_code', ''), sector_code),
    tranche_name = coalesce(nullif(f->>'tranche_name', ''), tranche_name),
    address = coalesce(nullif(f->>'address', ''), address),
    city = coalesce(nullif(f->>'city', ''), city),
    nature_text = coalesce(nullif(f->>'nature_text', ''), nature_text),
    description = coalesce(nullif(f->>'description', ''), description),
    isis_code = coalesce(nullif(f->>'isis_code', ''), isis_code),
    operator_code = coalesce(nullif(f->>'operator_code', ''), operator_code),
    order_date = coalesce(nullif(f->>'order_date', '')::date, order_date),
    amount_ttc = coalesce(nullif(f->>'amount_ttc', '')::numeric, amount_ttc),
    updated_at = now()
   where order_number = p_order;
  perform plans_prevention.apply_order_audit();
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDER_COMPLETED', 'orders', p_order, jsonb_build_object('fields', f, 'comment', p_comment));
end $$;
revoke execute on function plans_prevention.complete_order(text, jsonb, text) from public, anon;
grant execute on function plans_prevention.complete_order(text, jsonb, text) to authenticated;

-- 5. Décisions d'audit
-- 5114706 : hors périmètre (décision du responsable)
update plans_prevention.orders
   set scope_status = 'OUT_OF_SCOPE', scope_override = true, updated_at = now()
 where order_number = '5114706';
insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
values (null, 'ORDER_SCOPE_SET', 'orders', '5114706', jsonb_build_object('scope', 'OUT_OF_SCOPE', 'override', true, 'comment', 'Audit : hors périmètre décidé'));

-- 5102014, 5104673, 5097762 : travaux faits sans plan de prévention → obsolète, archivée
update plans_prevention.orders
   set plan_status = 'ARCHIVEE', archive_reason = 'OBSOLETE', updated_at = now()
 where order_number in ('5102014', '5104673', '5097762') and plan_status = 'NON_QUALIFIEE';
insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
select null, 'PLAN_STATUS_CHANGED', 'orders', n, jsonb_build_object('from', 'NON_QUALIFIEE', 'to', 'ARCHIVEE', 'reason', 'OBSOLETE', 'comment', 'Travaux faits sans plan de prévention (audit)')
  from unnest(array['5102014', '5104673', '5097762']) as n;
