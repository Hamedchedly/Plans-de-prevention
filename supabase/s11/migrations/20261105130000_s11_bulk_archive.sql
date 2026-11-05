-- Archivage en lot depuis la page « Archivage et purge ». Réversible : le statut d'origine est mémorisé.
-- Une commande archivée sort des KPIs (kpi_excluded) ; rétablir la remet dans les listes et les KPIs.

alter table plans_prevention.orders add column if not exists archived_from_status text;

create or replace function plans_prevention.bulk_archive_orders(p_orders text[], p_archive boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  if p_orders is null or cardinality(p_orders) = 0 then return 0; end if;

  if p_archive then
    update plans_prevention.orders o
       set archived_from_status = o.plan_status, plan_status = 'ARCHIVEE', archive_reason = 'MANUEL',
           kpi_excluded = true, updated_at = now()
     where o.order_number = any(p_orders) and not o.kpi_excluded;
  else
    update plans_prevention.orders o
       set plan_status = case when o.plan_status = 'ARCHIVEE' and o.archive_reason = 'MANUEL'
                              then coalesce(o.archived_from_status, 'NON_QUALIFIEE') else o.plan_status end,
           archive_reason = case when o.plan_status = 'ARCHIVEE' and o.archive_reason = 'MANUEL'
                                 then null else o.archive_reason end,
           archived_from_status = null, kpi_excluded = false, updated_at = now()
     where o.order_number = any(p_orders) and o.kpi_excluded;
  end if;
  get diagnostics n = row_count;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), case when p_archive then 'ORDERS_ARCHIVED' else 'ORDERS_UNARCHIVED' end, 'orders', null,
          jsonb_build_object('count', n, 'orders', p_orders));
  return n;
end $$;

revoke execute on function plans_prevention.bulk_archive_orders(text[], boolean) from public, anon;
grant execute on function plans_prevention.bulk_archive_orders(text[], boolean) to authenticated;
