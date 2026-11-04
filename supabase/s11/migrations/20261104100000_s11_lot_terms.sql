-- Termes du métier qui désignent un lot (ex. « VR » ou « volets roulants » → menuiseries extérieures).
-- Distinct du vocabulaire de recherche de natures, pour ne pas ajouter de lots par analogie.
create table if not exists plans_prevention.lot_terms (
  term text not null,                                           -- terme en minuscules, sans accents
  lot_code int not null references plans_prevention.lots(code),
  primary key (term, lot_code)
);

alter table plans_prevention.lot_terms enable row level security;
drop policy if exists lot_terms_select on plans_prevention.lot_terms;
drop policy if exists lot_terms_admin on plans_prevention.lot_terms;
create policy lot_terms_select on plans_prevention.lot_terms for select to authenticated using (plans_prevention.my_role() is not null);
create policy lot_terms_admin on plans_prevention.lot_terms for all to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());
grant select on plans_prevention.lot_terms to authenticated;
grant insert, update on plans_prevention.lot_terms to authenticated;

insert into plans_prevention.lot_terms (term, lot_code) values
  ('vr', 11),
  ('volet roulant', 11),
  ('volets roulants', 11),
  ('motorisation', 18),
  ('elec', 18)
on conflict (term, lot_code) do nothing;
