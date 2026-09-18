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
on public.user_profiles for select
to authenticated
using (user_id = auth.uid());

create policy "user_profiles: SUPER_ADMIN can read all profiles"
on public.user_profiles for select
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

create policy "user_profiles: SUPER_ADMIN can update profiles"
on public.user_profiles for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- COMPANIES RLS
create policy "companies: Authenticated users can read"
on public.companies for select
to authenticated
using (true);

create policy "companies: SUPER_ADMIN can insert"
on public.companies for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "companies: SUPER_ADMIN can update"
on public.companies for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- COMPANY_CONTACTS RLS
create policy "company_contacts: Authenticated can read"
on public.company_contacts for select
to authenticated
using (true);

create policy "company_contacts: SUPER_ADMIN can manage"
on public.company_contacts for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "company_contacts: SUPER_ADMIN can update"
on public.company_contacts for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- ORDERS RLS
create policy "orders: CHARGE_OPERATIONS can read own orders"
on public.orders for select
to authenticated
using (
  owner_user_id = auth.uid()
  or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN')
);

create policy "orders: RESPONSABLE and SUPER_ADMIN can insert"
on public.orders for insert
to authenticated
with check (get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'));

create policy "orders: RESPONSABLE and SUPER_ADMIN can update"
on public.orders for update
to authenticated
using (get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'));

-- TRADES RLS
create policy "trades: All authenticated can read"
on public.trades for select
to authenticated
using (true);

create policy "trades: SUPER_ADMIN can manage"
on public.trades for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "trades: SUPER_ADMIN can update"
on public.trades for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- NATURE_CATALOG RLS
create policy "nature_catalog: All authenticated can read"
on public.nature_catalog for select
to authenticated
using (true);

create policy "nature_catalog: SUPER_ADMIN can manage"
on public.nature_catalog for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- RISK_CATALOG RLS
create policy "risk_catalog: All authenticated can read"
on public.risk_catalog for select
to authenticated
using (true);

create policy "risk_catalog: SUPER_ADMIN can manage"
on public.risk_catalog for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- MEASURE_CATALOG RLS
create policy "measure_catalog: All authenticated can read"
on public.measure_catalog for select
to authenticated
using (true);

create policy "measure_catalog: SUPER_ADMIN can manage"
on public.measure_catalog for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

-- PREVENTION_PLANS RLS
create policy "prevention_plans: Users can read own/delegated plans"
on public.prevention_plans for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = prevention_plans.order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

create policy "prevention_plans: Users can insert"
on public.prevention_plans for insert
to authenticated
with check (
  exists (
    select 1 from public.orders o
    where o.id = prevention_plans.order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

create policy "prevention_plans: Users can update own"
on public.prevention_plans for update
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = prevention_plans.order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

-- AUDIT_LOGS RLS
create policy "audit_logs: SUPER_ADMIN only"
on public.audit_logs for select
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- NOTIFICATIONS RLS
create policy "notifications: Recipients only"
on public.notifications for select
to authenticated
using (recipient_user_id = auth.uid());

-- DELEGATION_PERMISSIONS RLS
create policy "delegation_permissions: SUPER_ADMIN and RESPONSABLE"
on public.delegation_permissions for select
to authenticated
using (
  get_user_role() in ('SUPER_ADMIN', 'RESPONSABLE')
  or delegate_user_id = auth.uid()
  or target_user_id = auth.uid()
);

create policy "delegation_permissions: SUPER_ADMIN can manage"
on public.delegation_permissions for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "delegation_permissions: SUPER_ADMIN can update"
on public.delegation_permissions for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- COMMAND_SCOPE_RULES RLS
create policy "command_scope_rules: All can read"
on public.command_scope_rules for select
to authenticated
using (true);

create policy "command_scope_rules: SUPER_ADMIN can manage"
on public.command_scope_rules for insert
to authenticated
with check (get_user_role() = 'SUPER_ADMIN');

create policy "command_scope_rules: SUPER_ADMIN can update"
on public.command_scope_rules for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');
