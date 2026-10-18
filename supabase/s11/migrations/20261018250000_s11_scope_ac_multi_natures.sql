-- S11 Phase 3 : Scope AC + table order_natures pour multi-natures par commande

-- 1. Modifier la contrainte check sur naac_corps_etat pour ajouter AC
alter table plans_prevention.naac_corps_etat drop constraint naac_corps_etat_naac_check;
alter table plans_prevention.naac_corps_etat add constraint naac_corps_etat_naac_check check (naac in ('GT','GE','CP','AC'));

-- 2. Ajouter AC à naac_corps_etat avec ses mappings corps d'état
insert into plans_prevention.naac_corps_etat(naac, corps_label, lot_code) values
  ('AC','(x) AC Gestion',null),
  ('AC','(x) AC Maçonnerie',3),
  ('AC','(x) AC Toitures',5),
  ('AC','(x) AC Cages',null)
on conflict (naac, corps_label) do nothing;

-- 3. Mettre à jour scope_rules : ajouter AC à INCLUDE
update plans_prevention.scope_rules
set values = array['GT', 'GE', 'CP', 'AC']
where source_field = 'NAAC_CODE' and mode = 'INCLUDE' and active = true;

-- 4. Créer table order_natures pour support multi-natures par commande
create table if not exists plans_prevention.order_natures (
  order_number text not null references plans_prevention.orders(order_number) on delete cascade,
  nature_id bigint not null references plans_prevention.natures(id) on delete cascade,
  source text not null check (source in ('IMPORT', 'USER_PROPOSAL', 'SYSTEM_DETECTED')),
  confidence_score numeric(3,2) not null default 1.0 check (confidence_score between 0 and 1),
  validated boolean not null default false,
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  primary key (order_number, nature_id)
);
create index if not exists idx_order_natures_order on plans_prevention.order_natures(order_number);
create index if not exists idx_order_natures_nature on plans_prevention.order_natures(nature_id);
alter table plans_prevention.order_natures enable row level security;

-- Dropper les anciennes politiques si elles existent
drop policy if exists order_natures_select on plans_prevention.order_natures;
drop policy if exists order_natures_modify on plans_prevention.order_natures;

-- Créer les politiques RLS
create policy order_natures_select on plans_prevention.order_natures for select to authenticated using (true);
create policy order_natures_modify on plans_prevention.order_natures for all to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());
grant select on plans_prevention.order_natures to authenticated;

-- 5. Créer fonction de sauvegarde des natures avec recalc scope
create or replace function plans_prevention.save_plan_natures(p_order_number text, p_nature_ids bigint[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order plans_prevention.orders;
  v_nature_id bigint;
begin
  if not plans_prevention.is_active_user() then raise exception 'Compte inactif'; end if;

  -- Vérifier que la commande existe
  select * into v_order from plans_prevention.orders where order_number = p_order_number;
  if not found then raise exception 'Commande non trouvée'; end if;

  -- Supprimer les natures existantes sauf si scope_override=true
  if not coalesce(v_order.scope_override, false) then
    delete from plans_prevention.order_natures where order_number = p_order_number;
  end if;

  -- Insérer les nouvelles natures
  foreach v_nature_id in array p_nature_ids loop
    insert into plans_prevention.order_natures(order_number, nature_id, source, created_by)
    values (p_order_number, v_nature_id, 'USER_PROPOSAL', auth.uid())
    on conflict (order_number, nature_id) do update
      set source = 'USER_PROPOSAL', created_by = auth.uid();
  end loop;

  -- Recalculer scope_status basé sur scope_rules
  perform plans_prevention.recalculate_order_scope(p_order_number);

  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'NATURES_SAVED', 'orders', p_order_number,
    jsonb_build_object('nature_ids', p_nature_ids));
end $$;

-- 6. Créer fonction de recalc scope basée sur scope_rules
create or replace function plans_prevention.recalculate_order_scope(p_order_number text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order plans_prevention.orders;
  v_rule plans_prevention.scope_rules;
  v_should_be_in_scope boolean;
  v_new_status text;
begin
  select * into v_order from plans_prevention.orders where order_number = p_order_number for update;
  if not found then return; end if;

  -- Si scope_override=true, ne pas recalculer
  if coalesce(v_order.scope_override, false) then return; end if;

  -- Chercher la règle active applicable
  select * into v_rule from plans_prevention.scope_rules where active = true and source_field = 'NAAC_CODE' limit 1;
  if not found then return; end if;

  -- Vérifier si le naac_code de la commande est dans les valeurs de la règle
  if v_rule.mode = 'INCLUDE' then
    v_should_be_in_scope := v_order.naac_code = any(v_rule.values);
  elsif v_rule.mode = 'EXCLUDE' then
    v_should_be_in_scope := not (v_order.naac_code = any(v_rule.values));
  else
    v_should_be_in_scope := false;
  end if;

  v_new_status := case when v_should_be_in_scope then 'IN_SCOPE' else 'OUT_OF_SCOPE' end;

  update plans_prevention.orders
  set scope_status = v_new_status, updated_at = now()
  where order_number = p_order_number;

  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SCOPE_RECALCULATED', 'orders', p_order_number,
    jsonb_build_object('new_status', v_new_status, 'rule_mode', v_rule.mode, 'naac_code', v_order.naac_code));
end $$;

-- 7. Recalculer les scope_status avec requête UPDATE en masse (sans boucle)
update plans_prevention.orders o
set scope_status = case
  when coalesce(o.scope_override, false) = true then o.scope_status
  when o.naac_code = any(array['GT', 'GE', 'CP', 'AC']) then 'IN_SCOPE'
  else 'OUT_OF_SCOPE'
end,
updated_at = now()
where coalesce(o.scope_override, false) = false
  and o.scope_status is not null;

-- 8. Vérifier et corriger les ordres spécifiques du test
update plans_prevention.orders
set scope_override = true
where order_number in ('5132524', '5132234') and scope_override is null;

-- 9. Révokes et grants
revoke execute on function plans_prevention.save_plan_natures(text, bigint[]) from public, anon;
revoke execute on function plans_prevention.recalculate_order_scope(text) from public, anon;
grant execute on function plans_prevention.save_plan_natures(text, bigint[]) to authenticated;
grant execute on function plans_prevention.recalculate_order_scope(text) to authenticated;
