-- Plans de Prévention V6 - RLS Policies
-- Migration 002: Row Level Security policies for role-based access control

-- Helper function for role checking
create or replace function get_user_role()
returns text as $$
declare
  role text;
begin
  select raw_user_meta_data->>'role' into role from auth.users where id = auth.uid();
  return coalesce(role, 'CHARGE_OPERATIONS');
end;
$$ language plpgsql security definer set search_path = public;

-- USER_PROFILES RLS
create policy "user_profiles: Users can read own profile"
on public.pp_user_profiles for select
to authenticated
using (user_id = auth.uid());

create policy "user_profiles: SUPER_ADMIN can read all profiles"
on public.pp_user_profiles for select
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

create policy "user_profiles: SUPER_ADMIN can update profiles"
on public.pp_user_profiles for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- COMPANIES RLS
create policy "companies: Authenticated users can read"
on public.pp_companies for select
to authenticated
using (true);

create policy "companies: SUPER_ADMIN can insert"
on public.pp_companies for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "companies: SUPER_ADMIN can update"
on public.pp_companies for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- COMPANY_CONTACTS RLS
create policy "company_contacts: Authenticated can read"
on public.pp_company_contacts for select
to authenticated
using (true);

create policy "company_contacts: SUPER_ADMIN can manage"
on public.pp_company_contacts for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "company_contacts: SUPER_ADMIN can update"
on public.pp_company_contacts for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- COMPANY_OS_CONTACTS RLS
create policy "company_os_contacts: Authenticated can read"
on public.pp_company_os_contacts for select
to authenticated
using (true);

create policy "company_os_contacts: SUPER_ADMIN can manage"
on public.pp_company_os_contacts for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "company_os_contacts: SUPER_ADMIN can update"
on public.pp_company_os_contacts for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- ORDERS RLS
create policy "orders: CHARGE_OPERATIONS can read own orders"
on public.pp_orders for select
to authenticated
using (
  owner_user_id = auth.uid()
  or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN')
);

create policy "orders: RESPONSABLE and SUPER_ADMIN can insert"
on public.pp_orders for insert
to authenticated
with check (get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'));

create policy "orders: RESPONSABLE and SUPER_ADMIN can update"
on public.pp_orders for update
to authenticated
using (get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'));

-- ORDER_TRADES RLS
create policy "order_trades: Users can read related"
on public.pp_order_trades for select
to authenticated
using (
  exists (
    select 1 from public.pp_orders o
    where o.id = order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

create policy "order_trades: Users can insert"
on public.pp_order_trades for insert
to authenticated
with check (
  exists (
    select 1 from public.pp_orders o
    where o.id = order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

-- ORDER_RECONCILIATION RLS
create policy "order_reconciliation: Users can read related"
on public.pp_order_reconciliation for select
to authenticated
using (
  exists (
    select 1 from public.pp_orders o
    where o.id = order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

create policy "order_reconciliation: Users can insert"
on public.pp_order_reconciliation for insert
to authenticated
with check (
  exists (
    select 1 from public.pp_orders o
    where o.id = order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

-- TRADES RLS
create policy "trades: All authenticated can read"
on public.pp_trades for select
to authenticated
using (true);

create policy "trades: SUPER_ADMIN can manage"
on public.pp_trades for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "trades: SUPER_ADMIN can update"
on public.pp_trades for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- NATURE_CATALOG RLS
create policy "nature_catalog: All authenticated can read"
on public.pp_nature_catalog for select
to authenticated
using (true);

create policy "nature_catalog: SUPER_ADMIN can manage"
on public.pp_nature_catalog for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- RISK_CATALOG RLS
create policy "risk_catalog: All authenticated can read"
on public.pp_risk_catalog for select
to authenticated
using (true);

create policy "risk_catalog: SUPER_ADMIN can manage"
on public.pp_risk_catalog for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- MEASURE_CATALOG RLS
create policy "measure_catalog: All authenticated can read"
on public.pp_measure_catalog for select
to authenticated
using (true);

create policy "measure_catalog: SUPER_ADMIN can manage"
on public.pp_measure_catalog for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- PREVENTION_PLANS RLS
create policy "prevention_plans: Users can read own/delegated plans"
on public.pp_prevention_plans for select
to authenticated
using (
  exists (
    select 1 from public.pp_orders o
    where o.id = prevention_plans.order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

create policy "prevention_plans: Users can insert"
on public.pp_prevention_plans for insert
to authenticated
with check (
  exists (
    select 1 from public.pp_orders o
    where o.id = prevention_plans.order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

create policy "prevention_plans: Users can update own"
on public.pp_prevention_plans for update
to authenticated
using (
  exists (
    select 1 from public.pp_orders o
    where o.id = prevention_plans.order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

-- AUDIT_LOGS RLS
create policy "audit_logs: SUPER_ADMIN only"
on public.pp_audit_logs for select
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- NOTIFICATIONS RLS
create policy "notifications: Recipients only"
on public.pp_notifications for select
to authenticated
using (recipient_user_id = auth.uid());

-- DELEGATION_PERMISSIONS RLS
create policy "delegation_permissions: SUPER_ADMIN and RESPONSABLE"
on public.pp_delegation_permissions for select
to authenticated
using (
  get_user_role() in ('SUPER_ADMIN', 'RESPONSABLE')
  or delegate_user_id = auth.uid()
  or target_user_id = auth.uid()
);

create policy "delegation_permissions: SUPER_ADMIN can manage"
on public.pp_delegation_permissions for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "delegation_permissions: SUPER_ADMIN can update"
on public.pp_delegation_permissions for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- COMMAND_SCOPE_RULES RLS
create policy "command_scope_rules: All can read"
on public.pp_command_scope_rules for select
to authenticated
using (true);

create policy "command_scope_rules: SUPER_ADMIN can manage"
on public.pp_command_scope_rules for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "command_scope_rules: SUPER_ADMIN can update"
on public.pp_command_scope_rules for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- COMMAND_SCOPE_RULE_VALUES RLS
create policy "command_scope_rule_values: All can read"
on public.pp_command_scope_rule_values for select
to authenticated
using (true);

create policy "command_scope_rule_values: SUPER_ADMIN can manage"
on public.pp_command_scope_rule_values for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- EMAIL_TEMPLATES RLS
create policy "email_templates: All can read"
on public.pp_email_templates for select
to authenticated
using (true);

create policy "email_templates: SUPER_ADMIN can manage"
on public.pp_email_templates for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- PLAN_TEMPLATES RLS
create policy "plan_templates: All can read"
on public.pp_plan_templates for select
to authenticated
using (true);

create policy "plan_templates: SUPER_ADMIN can manage"
on public.pp_plan_templates for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- PLAN_TEMPLATE_VERSIONS RLS
create policy "plan_template_versions: All can read"
on public.pp_plan_template_versions for select
to authenticated
using (true);

create policy "plan_template_versions: SUPER_ADMIN can manage"
on public.pp_plan_template_versions for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- IMPORTS RLS
create policy "imports: All can read"
on public.pp_imports for select
to authenticated
using (true);

create policy "imports: RESPONSABLE and SUPER_ADMIN can manage"
on public.pp_imports for insert
to authenticated
with check (get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'));

-- WORKFLOW_EVENTS RLS
create policy "workflow_events: All can read"
on public.pp_workflow_events for select
to authenticated
using (true);

create policy "workflow_events: Users can create"
on public.pp_workflow_events for insert
to authenticated
with check (get_user_role() in ('CHARGE_OPERATIONS', 'RESPONSABLE', 'SUPER_ADMIN'));

