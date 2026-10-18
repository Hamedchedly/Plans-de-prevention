-- Corbeille des commandes : aucune suppression physique (règle : les commandes importées ne sont jamais supprimées).
-- Une commande mise à la corbeille sort des listes et peut être restaurée.
alter table plans_prevention.orders
  add column if not exists trashed_at timestamptz,
  add column if not exists trashed_by uuid references auth.users(id);

create index if not exists orders_active_idx on plans_prevention.orders (order_date desc) where trashed_at is null;

create or replace function plans_prevention.set_orders_trashed(p_orders text[], p_trashed boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  if p_orders is null or cardinality(p_orders) = 0 then return 0; end if;
  update plans_prevention.orders
     set trashed_at = case when p_trashed then now() else null end,
         trashed_by = case when p_trashed then auth.uid() else null end,
         updated_at = now()
   where order_number = any(p_orders)
     and (trashed_at is not null) <> p_trashed;
  get diagnostics n = row_count;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), case when p_trashed then 'ORDERS_TRASHED' else 'ORDERS_RESTORED' end, 'orders', null,
          jsonb_build_object('count', n, 'orders', p_orders));
  return n;
end $$;

revoke execute on function plans_prevention.set_orders_trashed(text[], boolean) from public, anon;
grant execute on function plans_prevention.set_orders_trashed(text[], boolean) to authenticated;

-- Mise à la corbeille initiale : commandes antérieures à 2026.
update plans_prevention.orders
   set trashed_at = now()
 where order_date < date '2026-01-01' and trashed_at is null;

insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
select null, 'ORDERS_TRASHED', 'orders', null,
       jsonb_build_object('reason', 'commandes antérieures à 2026', 'count', count(*))
  from plans_prevention.orders
 where trashed_at is not null and order_date < date '2026-01-01'
having count(*) > 0;
