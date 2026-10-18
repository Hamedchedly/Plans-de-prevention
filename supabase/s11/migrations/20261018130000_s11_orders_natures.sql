-- Natures : clé stable (ref_key = libellé d'origine) pour renommer sans créer de doublon au rechargement.
alter table plans_prevention.natures add column if not exists ref_key text;
update plans_prevention.natures set ref_key = label where ref_key is null;
create unique index if not exists natures_ref_key_key on plans_prevention.natures (ref_key);

-- Envoi manuel : plan envoyé hors application, sorti des listes à traiter.
alter table plans_prevention.orders drop constraint if exists orders_plan_status_check;
alter table plans_prevention.orders add constraint orders_plan_status_check
  check (plan_status in ('NON_QUALIFIEE', 'A_ENVOYER', 'EN_ATTENTE_RETOUR', 'ARCHIVEE', 'ENVOYE_MANUELLEMENT'));

create or replace function plans_prevention.mark_sent_manually(p_orders text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; r record;
begin
  for r in select order_number, plan_status, operator_code from plans_prevention.orders
           where order_number = any(p_orders) for update loop
    if not (plans_prevention.is_manager() or r.operator_code = plans_prevention.current_operator()) then
      raise exception 'Accès refusé pour la commande %', r.order_number;
    end if;
    if r.plan_status not in ('NON_QUALIFIEE', 'A_ENVOYER') then
      raise exception 'Commande % : statut % non modifiable', r.order_number, r.plan_status;
    end if;
    update plans_prevention.orders set plan_status = 'ENVOYE_MANUELLEMENT', updated_at = now() where order_number = r.order_number;
    insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
    values (auth.uid(), 'PLAN_STATUS_CHANGED', 'orders', r.order_number,
      jsonb_build_object('from', r.plan_status, 'to', 'ENVOYE_MANUELLEMENT', 'manual', true));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function plans_prevention.unmark_sent_manually(p_orders text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; r record;
begin
  for r in select order_number, plan_status, operator_code from plans_prevention.orders
           where order_number = any(p_orders) for update loop
    if not (plans_prevention.is_manager() or r.operator_code = plans_prevention.current_operator()) then
      raise exception 'Accès refusé pour la commande %', r.order_number;
    end if;
    if r.plan_status <> 'ENVOYE_MANUELLEMENT' then
      raise exception 'Commande % : pas en envoi manuel', r.order_number;
    end if;
    update plans_prevention.orders set plan_status = 'NON_QUALIFIEE', updated_at = now() where order_number = r.order_number;
    insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
    values (auth.uid(), 'PLAN_STATUS_CHANGED', 'orders', r.order_number,
      jsonb_build_object('from', 'ENVOYE_MANUELLEMENT', 'to', 'NON_QUALIFIEE', 'manual', true));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function plans_prevention.mark_sent_manually(text[]) from public, anon;
revoke execute on function plans_prevention.unmark_sent_manually(text[]) from public, anon;
grant execute on function plans_prevention.mark_sent_manually(text[]) to authenticated;
grant execute on function plans_prevention.unmark_sent_manually(text[]) to authenticated;
