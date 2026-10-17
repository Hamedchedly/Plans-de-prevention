-- Imports, commandes, périmètre, qualification. Données sources conservées ; décisions séparées.
create table plans_prevention.imports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('COMMANDES','SUIVI_BUDGET','PROGRAMMATION')),
  file_name text not null,
  file_sha256 text not null,
  row_count int not null default 0,
  inserted_count int not null default 0,
  updated_count int not null default 0,
  status text not null default 'EN_COURS' check (status in ('EN_COURS','TERMINE','ERREUR')),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (kind, file_sha256)            -- import idempotent : même fichier = rien de nouveau
);

create table plans_prevention.import_rows (        -- ligne source brute, auditable
  import_id uuid not null references plans_prevention.imports(id) on delete cascade,
  row_no int not null,
  order_number text,
  raw jsonb not null,
  primary key (import_id, row_no)
);

create table plans_prevention.orders (
  order_number text primary key,
  -- données source (mises à jour à chaque import)
  sector_code text,
  wpatrimoine text,
  tranche_name text,
  address text,
  city text,
  nature_text text,
  description text,
  isis_code text,
  operator_code text,                 -- UTIC_CODE du chargé
  order_date date,
  amount_ttc numeric(14,2),
  naac_code text,                     -- GT / GE / CP
  intc_code text,
  source_import_id uuid references plans_prevention.imports(id),
  source_updated_at timestamptz not null default now(),
  -- décisions (jamais écrasées par un import)
  scope_status text not null default 'IN_SCOPE' check (scope_status in ('IN_SCOPE','OUT_OF_SCOPE')),
  scope_override boolean not null default false,   -- périmètre fixé à la main
  qualification_status text not null default 'A_QUALIFIER'
    check (qualification_status in ('AUTO','A_QUALIFIER','QUALIFIED')),
  nature_id bigint references plans_prevention.natures(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_operator_idx on plans_prevention.orders(operator_code);
create index orders_scope_idx on plans_prevention.orders(scope_status, qualification_status);
create trigger orders_touch before update on plans_prevention.orders
  for each row execute function plans_prevention.touch_updated_at();

create table plans_prevention.order_lots (
  order_number text not null references plans_prevention.orders(order_number) on delete cascade,
  lot_code int not null references plans_prevention.lots(code),
  source text not null check (source in ('BUDGET_TRACKING','NATURE','AUTO_ANALYSIS','MANUAL')),
  confidence numeric(3,2),
  chosen_by uuid references auth.users(id),
  chosen_at timestamptz not null default now(),
  primary key (order_number, lot_code)
);

create table plans_prevention.order_risks (
  order_number text not null references plans_prevention.orders(order_number) on delete cascade,
  risk_code text not null references plans_prevention.risks(code),
  checked boolean not null,
  origin text not null check (origin in ('LOT_DEFAUT','NATURE','MANUEL')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (order_number, risk_code)
);

create table plans_prevention.order_measures (
  order_number text not null references plans_prevention.orders(order_number) on delete cascade,
  measure_code text not null references plans_prevention.measures(code),
  checked boolean not null,
  origin text not null check (origin in ('AUTO','MANUEL')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (order_number, measure_code)
);

create table plans_prevention.scope_rules (
  id bigint generated always as identity primary key,
  source_field text not null default 'NAAC_CODE',
  mode text not null check (mode in ('INCLUDE','EXCLUDE')),
  values text[] not null,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table plans_prevention.budget_tracking (      -- suivi budgétaire : sert à qualifier, jamais source maîtresse
  import_id uuid not null references plans_prevention.imports(id) on delete cascade,
  row_no int not null,
  order_number text,
  raw jsonb not null,
  primary key (import_id, row_no)
);
create index budget_tracking_order_idx on plans_prevention.budget_tracking(order_number);

-- Périmètre : recalcul pour les commandes non fixées à la main.
-- Règle : s'il existe une règle INCLUDE active, seules ses valeurs sont dans le périmètre ;
-- sinon, une règle EXCLUDE active retire ses valeurs ; sans règle, tout est dans le périmètre.
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

create or replace function plans_prevention.set_scope_rules(p_rules jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  update plans_prevention.scope_rules set active = false where active;
  insert into plans_prevention.scope_rules(mode, values, created_by)
  select r->>'mode', array(select jsonb_array_elements_text(r->'values')), auth.uid()
    from jsonb_array_elements(p_rules) r;
  n := plans_prevention.apply_scope_rules();
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SCOPE_RULES_SET', 'scope_rules', null, jsonb_build_object('rules', p_rules, 'orders_recalculated', n));
  return n;
end $$;

-- Décision manuelle de périmètre sur une commande (réversible, historisée)
create or replace function plans_prevention.set_order_scope(p_order text, p_scope text, p_override boolean, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  update plans_prevention.orders set scope_status = p_scope, scope_override = p_override where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDER_SCOPE_SET', 'orders', p_order, jsonb_build_object('scope', p_scope, 'override', p_override, 'comment', p_comment));
end $$;

-- RLS commandes
alter table plans_prevention.imports enable row level security;
alter table plans_prevention.import_rows enable row level security;
alter table plans_prevention.orders enable row level security;
alter table plans_prevention.order_lots enable row level security;
alter table plans_prevention.order_risks enable row level security;
alter table plans_prevention.order_measures enable row level security;
alter table plans_prevention.scope_rules enable row level security;
alter table plans_prevention.budget_tracking enable row level security;

create policy imports_admin on plans_prevention.imports for all to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());
create policy import_rows_admin on plans_prevention.import_rows for all to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());
create policy budget_tracking_admin on plans_prevention.budget_tracking for all to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());
create policy scope_rules_select on plans_prevention.scope_rules for select to authenticated
  using (plans_prevention.my_role() is not null);

create policy orders_select on plans_prevention.orders for select to authenticated
  using (plans_prevention.is_manager() or operator_code = plans_prevention.current_operator());
create policy orders_insert_admin on plans_prevention.orders for insert to authenticated
  with check (plans_prevention.is_super_admin());
create policy orders_update_admin on plans_prevention.orders for update to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());
create policy orders_update_owner on plans_prevention.orders for update to authenticated
  using (plans_prevention.is_manager() or operator_code = plans_prevention.current_operator())
  with check (plans_prevention.is_manager() or operator_code = plans_prevention.current_operator());

create policy order_lots_rw on plans_prevention.order_lots for all to authenticated
  using (exists (select 1 from plans_prevention.orders o where o.order_number = order_lots.order_number
         and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator())))
  with check (exists (select 1 from plans_prevention.orders o where o.order_number = order_lots.order_number
         and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator())));
create policy order_risks_rw on plans_prevention.order_risks for all to authenticated
  using (exists (select 1 from plans_prevention.orders o where o.order_number = order_risks.order_number
         and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator())))
  with check (exists (select 1 from plans_prevention.orders o where o.order_number = order_risks.order_number
         and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator())));
create policy order_measures_rw on plans_prevention.order_measures for all to authenticated
  using (exists (select 1 from plans_prevention.orders o where o.order_number = order_measures.order_number
         and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator())))
  with check (exists (select 1 from plans_prevention.orders o where o.order_number = order_measures.order_number
         and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator())));

grant select, insert, update, delete on plans_prevention.imports, plans_prevention.import_rows,
  plans_prevention.orders, plans_prevention.order_lots, plans_prevention.order_risks,
  plans_prevention.order_measures, plans_prevention.budget_tracking to authenticated;
grant select on plans_prevention.scope_rules to authenticated;
grant execute on function plans_prevention.set_scope_rules(jsonb) to authenticated;
grant execute on function plans_prevention.set_order_scope(text,text,boolean,text) to authenticated;
grant execute on function plans_prevention.apply_scope_rules() to authenticated;
