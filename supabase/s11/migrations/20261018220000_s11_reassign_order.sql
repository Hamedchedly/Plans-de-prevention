-- Réaffectation d'une commande à un autre chargé (Responsable / Super Admin), journalisée.
create or replace function plans_prevention.reassign_order(p_order text, p_operator text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old text; v_new text := nullif(trim(coalesce(p_operator, '')), '');
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  select operator_code into v_old from plans_prevention.orders where order_number = p_order;
  if not found then raise exception 'Commande introuvable'; end if;
  update plans_prevention.orders set operator_code = v_new, updated_at = now() where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDER_REASSIGNED', 'orders', p_order, jsonb_build_object('from', v_old, 'to', v_new));
end $$;

revoke execute on function plans_prevention.reassign_order(text, text) from public, anon;
grant execute on function plans_prevention.reassign_order(text, text) to authenticated;
