-- Plans de Prévention V6 - Clean Schema (Replacement for 001)
-- This is a simplified, validated version without syntax issues

create extension if not exists "uuid-ossp";

-- ========================
-- USER & COMPANY TABLES
-- ========================

create table if not exists public.pp_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  heritage_code text unique,
  first_name text,
  last_name text,
  email text,
  phone text,
  function text,
  signature_storage_path text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_companies (
  id uuid primary key default uuid_generate_v4(),
  code_isis text not null unique,
  name text,
  address text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_company_contacts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.pp_companies(id) on delete cascade,
  first_name text,
  last_name text,
  role text,
  email text,
  phone text,
  is_active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_company_os_contacts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.pp_companies(id) on delete cascade,
  contact_id uuid not null references public.pp_company_contacts(id) on delete cascade,
  is_default boolean default false,
  active_from timestamp default now(),
  active_to timestamp,
  created_at timestamp default now()
);

-- ========================
-- REFERENCE DATA TABLES
-- ========================

create table if not exists public.pp_trades (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  description text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_nature_catalog (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  normalized_name text,
  trade_id uuid references public.pp_trades(id),
  description text,
  status text default 'active',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_risk_catalog (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.pp_measure_catalog (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  active boolean default true,
  created_at timestamp default now()
);

create table if not exists public.pp_nature_risk_rules (
  id uuid primary key default uuid_generate_v4(),
  nature_id uuid not null references public.pp_nature_catalog(id) on delete cascade,
  risk_id uuid not null references public.pp_risk_catalog(id) on delete cascade,
  created_at timestamp default now(),
  unique(nature_id, risk_id)
);

create table if not exists public.pp_nature_measure_rules (
  id uuid primary key default uuid_generate_v4(),
  nature_id uuid not null references public.pp_nature_catalog(id) on delete cascade,
  measure_id uuid not null references public.pp_measure_catalog(id) on delete cascade,
  created_at timestamp default now(),
  unique(nature_id, measure_id)
);

-- ========================
-- ORDERS & RECONCILIATION
-- ========================

create table if not exists public.pp_orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text not null unique,
  heritage_code text,
  sector_id text,
  intervention_code text,
  budget_line_year text,
  owner_user_id uuid references public.pp_user_profiles(user_id),
  company_id uuid references public.pp_companies(id),
  order_date date,
  budget_nature text,
  cf_code text,
  analytic_account text,
  source_status text,
  amount_ttc numeric(15,2),
  amount_reconciled numeric(15,2),
  amount_gap numeric(15,2),
  tranche_name text,
  site_address text,
  site_city_zip text,
  work_nature text,
  work_description text,
  tracking_match_status text default 'NOT_FOUND',
  qualification_status text default 'PENDING',
  scope_status text default 'IN_SCOPE',
  source_import_id uuid,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_order_trades (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.pp_orders(id) on delete cascade,
  trade_id uuid not null references public.pp_trades(id),
  source text not null,
  confidence_score numeric(3,2),
  selected_by uuid references public.pp_user_profiles(user_id),
  selected_at timestamp,
  created_at timestamp default now(),
  unique(order_id, trade_id)
);

create table if not exists public.pp_order_reconciliation (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.pp_orders(id) on delete cascade,
  tracking_import_id text,
  match_status text not null,
  confidence numeric(3,2),
  manually_confirmed boolean default false,
  confirmed_by uuid references public.pp_user_profiles(user_id),
  confirmed_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- ========================
-- PREVENTION PLANS
-- ========================

create table if not exists public.pp_prevention_plans (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null unique references public.pp_orders(id) on delete cascade,
  template_version_id uuid,
  status text default 'DRAFT',
  intervention_start date,
  intervention_end date,
  drafted_by uuid references public.pp_user_profiles(user_id),
  validated_by uuid references public.pp_user_profiles(user_id),
  sent_at timestamp,
  received_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_prevention_plan_risks (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.pp_prevention_plans(id) on delete cascade,
  risk_id uuid not null references public.pp_risk_catalog(id),
  description text,
  created_at timestamp default now(),
  unique(plan_id, risk_id)
);

create table if not exists public.pp_prevention_plan_measures (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.pp_prevention_plans(id) on delete cascade,
  measure_id uuid not null references public.pp_measure_catalog(id),
  description text,
  created_at timestamp default now(),
  unique(plan_id, measure_id)
);

-- ========================
-- ADMIN & TEMPLATES
-- ========================

create table if not exists public.pp_command_scope_rules (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  active boolean default true,
  field_name text not null,
  mode text not null,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_command_scope_rule_values (
  id uuid primary key default uuid_generate_v4(),
  rule_id uuid not null references public.pp_command_scope_rules(id) on delete cascade,
  value text not null,
  created_at timestamp default now()
);

create table if not exists public.pp_email_templates (
  id uuid primary key default uuid_generate_v4(),
  type text not null,
  subject_template text,
  body_template text,
  version int default 1,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_plan_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.pp_plan_template_versions (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.pp_plan_templates(id) on delete cascade,
  version int not null,
  status text default 'DRAFT',
  definition_json jsonb,
  created_by uuid references public.pp_user_profiles(user_id),
  created_at timestamp default now(),
  unique(template_id, version)
);

-- ========================
-- AUDIT & LOGGING
-- ========================

create table if not exists public.pp_imports (
  id uuid primary key default uuid_generate_v4(),
  filename text,
  source_type text,
  imported_by uuid references public.pp_user_profiles(user_id),
  imported_at timestamp default now(),
  row_count int,
  created_count int,
  updated_count int,
  error_count int
);

create table if not exists public.pp_workflow_events (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.pp_orders(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references public.pp_user_profiles(user_id),
  metadata jsonb,
  created_at timestamp default now()
);

create table if not exists public.pp_notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_user_id uuid not null references public.pp_user_profiles(user_id) on delete cascade,
  subject text,
  message text,
  type text,
  read_at timestamp,
  created_at timestamp default now()
);

create table if not exists public.pp_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references public.pp_user_profiles(user_id),
  subject_user_id uuid references public.pp_user_profiles(user_id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamp default now()
);

create table if not exists public.pp_delegation_permissions (
  id uuid primary key default uuid_generate_v4(),
  delegate_user_id uuid not null references public.pp_user_profiles(user_id) on delete cascade,
  target_user_id uuid not null references public.pp_user_profiles(user_id) on delete cascade,
  permission_type text not null,
  valid_from timestamp default now(),
  valid_to timestamp,
  created_at timestamp default now(),
  created_by uuid references public.pp_user_profiles(user_id)
);

create table if not exists public.pp_archive_records (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null,
  entity_id text not null,
  archived_by uuid references public.pp_user_profiles(user_id),
  archived_at timestamp default now(),
  reason text
);

-- ========================
-- INDEXES
-- ========================

create index if not exists idx_orders_owner_user_id on public.pp_orders(owner_user_id);
create index if not exists idx_orders_company_id on public.pp_orders(company_id);
create index if not exists idx_orders_order_date on public.pp_orders(order_date);
create index if not exists idx_orders_scope_status on public.pp_orders(scope_status);
create index if not exists idx_orders_qualification_status on public.pp_orders(qualification_status);
create index if not exists idx_order_trades_order_id on public.pp_order_trades(order_id);
create index if not exists idx_prevention_plans_order_id on public.pp_prevention_plans(order_id);
create index if not exists idx_prevention_plans_status on public.pp_prevention_plans(status);
create index if not exists idx_audit_logs_created_at on public.pp_audit_logs(created_at);
create index if not exists idx_notifications_recipient on public.pp_notifications(recipient_user_id);

-- ========================
-- ENABLE RLS
-- ========================

alter table public.pp_user_profiles enable row level security;
alter table public.pp_companies enable row level security;
alter table public.pp_company_contacts enable row level security;
alter table public.pp_company_os_contacts enable row level security;
alter table public.pp_orders enable row level security;
alter table public.pp_order_trades enable row level security;
alter table public.pp_order_reconciliation enable row level security;
alter table public.pp_prevention_plans enable row level security;
alter table public.pp_audit_logs enable row level security;
alter table public.pp_notifications enable row level security;
alter table public.pp_delegation_permissions enable row level security;
alter table public.pp_trades enable row level security;
alter table public.pp_nature_catalog enable row level security;
alter table public.pp_risk_catalog enable row level security;
alter table public.pp_measure_catalog enable row level security;
alter table public.pp_command_scope_rules enable row level security;
alter table public.pp_command_scope_rule_values enable row level security;
alter table public.pp_email_templates enable row level security;
alter table public.pp_plan_templates enable row level security;
alter table public.pp_plan_template_versions enable row level security;
alter table public.pp_imports enable row level security;
alter table public.pp_workflow_events enable row level security;
