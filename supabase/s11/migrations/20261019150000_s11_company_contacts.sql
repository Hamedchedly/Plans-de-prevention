create table if not exists plans_prevention.company_contacts (
  isis_code text not null references plans_prevention.companies(isis_code) on delete cascade,
  position int not null,
  name text,
  email text,
  contact_type text not null check (contact_type in ('Pouvoir', 'Cde/OS', 'e-Attest', 'Compta')),
  phone text,
  primary key (isis_code, position)
);
alter table plans_prevention.company_contacts enable row level security;
drop policy if exists company_contacts_select on plans_prevention.company_contacts;
create policy company_contacts_select on plans_prevention.company_contacts for select to authenticated using (plans_prevention.is_active_user());
drop policy if exists company_contacts_manage on plans_prevention.company_contacts;
create policy company_contacts_manage on plans_prevention.company_contacts for all to authenticated using (plans_prevention.is_manager()) with check (plans_prevention.is_manager());
grant select, insert, update on plans_prevention.company_contacts to authenticated;
