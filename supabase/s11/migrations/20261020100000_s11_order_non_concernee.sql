-- Commande non concernée par un plan de prévention (décision du chargé, avec motif tracé).
-- Sort des listes « à traiter » ; réversible. Ne modifie pas le périmètre (scope_status).

alter table plans_prevention.orders drop constraint orders_plan_status_check;
alter table plans_prevention.orders add constraint orders_plan_status_check
  check (plan_status = any (array['NON_QUALIFIEE','A_ENVOYER','EN_ATTENTE_RETOUR','SIGNEE','ARCHIVEE','ENVOYE_MANUELLEMENT','NON_CONCERNEE']));

create or replace function plans_prevention.mark_not_concerned(p_order text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'Motif obligatoire (5 caractères minimum)';
  end if;
  select order_number, plan_status, operator_code into r from plans_prevention.orders
   where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or r.operator_code = plans_prevention.current_operator()) then
    raise exception 'Accès refusé pour la commande %', p_order;
  end if;
  if r.plan_status not in ('NON_QUALIFIEE', 'A_ENVOYER') then
    raise exception 'Commande % : statut % non modifiable', p_order, r.plan_status;
  end if;
  update plans_prevention.orders set plan_status = 'NON_CONCERNEE', updated_at = now() where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PLAN_STATUS_CHANGED', 'orders', p_order,
    jsonb_build_object('from', r.plan_status, 'to', 'NON_CONCERNEE', 'reason', trim(p_reason)));
end $$;

create or replace function plans_prevention.unmark_not_concerned(p_order text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  select order_number, plan_status, operator_code into r from plans_prevention.orders
   where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or r.operator_code = plans_prevention.current_operator()) then
    raise exception 'Accès refusé pour la commande %', p_order;
  end if;
  if r.plan_status <> 'NON_CONCERNEE' then
    raise exception 'Commande % : pas marquée non concernée', p_order;
  end if;
  update plans_prevention.orders set plan_status = 'NON_QUALIFIEE', updated_at = now() where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PLAN_STATUS_CHANGED', 'orders', p_order,
    jsonb_build_object('from', 'NON_CONCERNEE', 'to', 'NON_QUALIFIEE', 'reason', 'retour en qualification'));
end $$;

revoke execute on function plans_prevention.mark_not_concerned(text, text) from public, anon;
revoke execute on function plans_prevention.unmark_not_concerned(text) from public, anon;
grant execute on function plans_prevention.mark_not_concerned(text, text) to authenticated;
grant execute on function plans_prevention.unmark_not_concerned(text) to authenticated;
