-- Périmètre : GT, GE, CP et AC (HO exclu). Recalcul hors commandes fixées à la main.
create or replace function plans_prevention.apply_scope_rules()
returns int language plpgsql security definer set search_path = '' as $$
declare n int; v_include text[]; v_exclude text[]; v_has_include boolean; v_has_exclude boolean;
begin
  select coalesce(array_agg(distinct v), '{}'), count(*) > 0 into v_include, v_has_include
    from plans_prevention.scope_rules r, unnest(r.values) v where r.active and r.mode = 'INCLUDE';
  select coalesce(array_agg(distinct v), '{}'), count(*) > 0 into v_exclude, v_has_exclude
    from plans_prevention.scope_rules r, unnest(r.values) v where r.active and r.mode = 'EXCLUDE';
  update plans_prevention.orders o
     set scope_status = case
       when v_has_include then (case when o.naac_code = any(v_include) then 'IN_SCOPE' else 'OUT_OF_SCOPE' end)
       when v_has_exclude then (case when o.naac_code = any(v_exclude) then 'OUT_OF_SCOPE' else 'IN_SCOPE' end)
       else 'IN_SCOPE' end,
         updated_at = now()
   where not o.scope_override;
  get diagnostics n = row_count;
  return n;
end $$;

update plans_prevention.scope_rules set active = false where active;
insert into plans_prevention.scope_rules(mode, values, created_by)
  values ('INCLUDE', array['GT','GE','CP','AC'], null);
select plans_prevention.apply_scope_rules();
insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (null, 'SCOPE_RULES_SET', 'scope_rules', null, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('mode','INCLUDE','values', jsonb_build_array('GT','GE','CP','AC'))), 'note', 'AC ajouté, HO exclu'));

-- Natures multiples d'une fiche : la nature retenue reste dans orders.nature_id ; les autres sont ici.
create table if not exists plans_prevention.order_natures (
  order_number text not null references plans_prevention.orders(order_number) on delete cascade,
  nature_id bigint not null references plans_prevention.natures(id) on delete cascade,
  chosen_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (order_number, nature_id)
);
alter table plans_prevention.order_natures enable row level security;
create policy order_natures_select on plans_prevention.order_natures for select to authenticated
  using (plans_prevention.is_active_user());
grant select on plans_prevention.order_natures to authenticated;

-- Enregistre l'ensemble des natures retenues (la nature principale reste portée par save_plan).
create or replace function plans_prevention.save_plan_natures(p_order text, p_natures bigint[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_op text;
begin
  select plan_status, operator_code into v_status, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or v_op = plans_prevention.current_operator()) then raise exception 'Accès refusé'; end if;
  if v_status not in ('NON_QUALIFIEE', 'A_ENVOYER') then raise exception 'Plan verrouillé (statut %)', v_status; end if;
  delete from plans_prevention.order_natures where order_number = p_order;
  insert into plans_prevention.order_natures(order_number, nature_id, chosen_by)
    select p_order, n, auth.uid() from unnest(coalesce(p_natures, '{}'::bigint[])) n
    on conflict do nothing;
end $$;
revoke execute on function plans_prevention.save_plan_natures(text, bigint[]) from public, anon;
grant execute on function plans_prevention.save_plan_natures(text, bigint[]) to authenticated;
