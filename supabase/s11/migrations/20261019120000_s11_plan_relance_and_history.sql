-- Relances journalisées (date de chaque relance) et historique complet d'une fiche : création, envoi, relances, retour.
create or replace function plans_prevention.plan_relance(p_order text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_op text; v_status text;
begin
  select plan_status, operator_code into v_status, v_op from plans_prevention.orders where order_number = p_order;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or v_op = plans_prevention.current_operator()) then raise exception 'Accès refusé'; end if;
  if v_status <> 'EN_ATTENTE_RETOUR' then raise exception 'Relance possible seulement en attente de retour'; end if;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PLAN_RELANCED', 'orders', p_order, '{}'::jsonb);
end $$;

create or replace function plans_prevention.plan_history(p_orders text[])
returns table(order_number text, created_at timestamptz, sent_at timestamptz, relances timestamptz[], returned_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not plans_prevention.is_active_user() then raise exception 'Accès refusé'; end if;
  return query
  select o.order_number,
    (select min(a.created_at) from plans_prevention.audit_logs a where a.action = 'PLAN_SAVED' and a.entity_id = o.order_number),
    (select min(a.created_at) from plans_prevention.audit_logs a where a.action = 'PLAN_STATUS_CHANGED' and a.entity_id = o.order_number and a.payload->>'to' = 'EN_ATTENTE_RETOUR'),
    (select coalesce(array_agg(a.created_at order by a.created_at), '{}') from plans_prevention.audit_logs a where a.action = 'PLAN_RELANCED' and a.entity_id = o.order_number),
    (select min(a.created_at) from plans_prevention.audit_logs a where a.action = 'PLAN_STATUS_CHANGED' and a.entity_id = o.order_number and a.payload->>'to' in ('SIGNEE', 'ARCHIVEE'))
  from plans_prevention.orders o
  where o.order_number = any(p_orders);
end $$;

revoke execute on function plans_prevention.plan_relance(text) from public, anon;
revoke execute on function plans_prevention.plan_history(text[]) from public, anon;
grant execute on function plans_prevention.plan_relance(text) to authenticated;
grant execute on function plans_prevention.plan_history(text[]) to authenticated;
