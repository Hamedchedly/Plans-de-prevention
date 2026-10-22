-- Mémoire des choix de nature : pour un libellé source donné, la dernière nature retenue par un chargé
-- devient la première proposition des commandes au même libellé. Une correction remplace l'ancien choix.
create table if not exists plans_prevention.nature_choices (
  label_key text primary key,                       -- libellé source normalisé (minuscules, espaces simplifiés)
  nature_id bigint not null references plans_prevention.natures(id),
  chosen_by uuid,
  chosen_at timestamptz not null default now(),
  uses int not null default 1
);
alter table plans_prevention.nature_choices enable row level security;
create policy nature_choices_select on plans_prevention.nature_choices for select to authenticated
  using (plans_prevention.my_role() is not null);
revoke insert, update on plans_prevention.nature_choices from public, anon, authenticated;

-- Enregistre le choix pour le libellé de la commande ; seuls les utilisateurs qui voient la commande peuvent le faire.
create or replace function plans_prevention.record_nature_choice(p_order text, p_nature_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_text text; v_key text;
begin
  if plans_prevention.my_role() is null or plans_prevention.my_role() = 'ASSISTANT' then raise exception 'Réservé aux chargés et responsables'; end if;
  select o.nature_text into v_text from plans_prevention.orders o
   where o.order_number = p_order
     and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator()
          or o.sector_code = any (plans_prevention.current_sector_codes()));
  if not found or v_text is null or btrim(v_text) = '' then return; end if;
  v_key := lower(regexp_replace(btrim(v_text), '\s+', ' ', 'g'));
  insert into plans_prevention.nature_choices(label_key, nature_id, chosen_by, chosen_at, uses)
  values (v_key, p_nature_id, auth.uid(), now(), 1)
  on conflict (label_key) do update
    set nature_id = excluded.nature_id, chosen_by = excluded.chosen_by, chosen_at = now(),
        uses = plans_prevention.nature_choices.uses + 1;
end $$;
revoke execute on function plans_prevention.record_nature_choice(text, bigint) from public, anon;
grant execute on function plans_prevention.record_nature_choice(text, bigint) to authenticated;
