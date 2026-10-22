-- Préférences de lots par nature, apprises des décisions des chargés.
-- Le référentiel (nature_lots) n'est jamais modifié : une préférence ne fait que
-- empêcher l'ajout automatique d'un lot retiré à la main, ou au contraire le proposer
-- quand il a été ajouté à la main.
create table if not exists plans_prevention.nature_lot_preferences (
  nature_id bigint not null references plans_prevention.natures(id),
  lot_code int not null references plans_prevention.lots(code),
  keep boolean not null,
  chosen_by uuid,
  chosen_at timestamptz not null default now(),
  uses int not null default 1,
  primary key (nature_id, lot_code)
);

alter table plans_prevention.nature_lot_preferences enable row level security;
drop policy if exists nature_lot_preferences_select on plans_prevention.nature_lot_preferences;
create policy nature_lot_preferences_select on plans_prevention.nature_lot_preferences
  for select to authenticated using (plans_prevention.my_role() is not null);
revoke insert, update on plans_prevention.nature_lot_preferences from public, anon, authenticated;
grant select on plans_prevention.nature_lot_preferences to authenticated;

create or replace function plans_prevention.record_nature_lot_preference(p_nature_id bigint, p_lot_code int, p_keep boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if plans_prevention.my_role() is null or plans_prevention.my_role() = 'ASSISTANT' then
    raise exception 'Réservé aux chargés et responsables';
  end if;
  insert into plans_prevention.nature_lot_preferences(nature_id, lot_code, keep, chosen_by, chosen_at, uses)
  values (p_nature_id, p_lot_code, p_keep, auth.uid(), now(), 1)
  on conflict (nature_id, lot_code) do update
    set keep = excluded.keep, chosen_by = excluded.chosen_by, chosen_at = now(),
        uses = plans_prevention.nature_lot_preferences.uses + 1;
end $$;

revoke execute on function plans_prevention.record_nature_lot_preference(bigint, int, boolean) from public, anon;
grant execute on function plans_prevention.record_nature_lot_preference(bigint, int, boolean) to authenticated;
