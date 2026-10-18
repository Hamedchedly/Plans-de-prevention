-- Correspondance code NAAC (GT / GE / CP) + corps d'état → lot.
-- Les rapprochements proposés sont à valider par le Super Admin ; un choix d'utilisateur passe par une proposition.

create table if not exists plans_prevention.naac_corps_etat (
  naac text not null check (naac in ('GT','GE','CP')),
  corps_label text not null,
  lot_code int references plans_prevention.lots(code),   -- null = à qualifier par l'utilisateur
  validated boolean not null default false,
  primary key (naac, corps_label)
);
alter table plans_prevention.naac_corps_etat enable row level security;
create policy naac_corps_etat_select on plans_prevention.naac_corps_etat for select to authenticated using (true);
create policy naac_corps_etat_admin on plans_prevention.naac_corps_etat for all to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());
grant select on plans_prevention.naac_corps_etat to authenticated;

insert into plans_prevention.naac_corps_etat(naac, corps_label, lot_code) values
  ('GT','(a) Maçonnerie',3), ('GT','(b) Abords',21), ('GT','(c) Isolation',9), ('GT','(d) Espaces Ext',20), ('GT','(e) Divers',null),
  ('GE','(f) Ravalement',7), ('GE','(g) Halls',null), ('GE','(h) Cages',null), ('GE','(i) Electricité',18), ('GE','(j) Couvertures',5),
  ('CP','(m) Carrelage',13), ('CP','(o) Plomberie',15), ('CP','(p) Toitures',5), ('CP','(q) Menuiseries ext',11),
  ('CP','(r) Fermetures',11), ('CP','(s) Portes gges',null), ('CP','(u) Etanchéité',6), ('CP','(w) Isolat extérieure',9),
  ('CP','(y) amenagt ext',20), ('CP','(z) Electricité',18)
on conflict do nothing;

alter table plans_prevention.referential_proposals drop constraint if exists referential_proposals_kind_check;
alter table plans_prevention.referential_proposals add constraint referential_proposals_kind_check
  check (kind in ('NATURE_NOUVELLE','NATURE_REGLE','CORPS_NAAC'));

create or replace function plans_prevention.propose_corps_naac(p_naac text, p_corps_label text, p_lot_code int, p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not plans_prevention.is_active_user() then raise exception 'Compte inactif'; end if;
  if p_naac not in ('GT','GE','CP') then raise exception 'Code NAAC inconnu'; end if;
  if p_lot_code is null then raise exception 'Lot requis'; end if;
  insert into plans_prevention.referential_proposals(kind, payload, reason, created_by)
  values ('CORPS_NAAC', jsonb_build_object('naac', p_naac, 'corps_label', p_corps_label, 'lot_code', p_lot_code), p_reason, auth.uid())
  returning id into v_id;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'CORPS_NAAC_PROPOSED', 'referential_proposals', v_id::text,
    jsonb_build_object('naac', p_naac, 'corps_label', p_corps_label, 'lot_code', p_lot_code));
  return v_id;
end $$;

create or replace function plans_prevention.decide_corps_naac(p_id bigint, p_approve boolean, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
declare r plans_prevention.referential_proposals;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  select * into r from plans_prevention.referential_proposals where id = p_id for update;
  if not found or r.kind <> 'CORPS_NAAC' or r.status <> 'EN_ATTENTE' then raise exception 'Proposition introuvable ou déjà traitée'; end if;
  if p_approve then
    insert into plans_prevention.naac_corps_etat(naac, corps_label, lot_code, validated)
    values (r.payload->>'naac', r.payload->>'corps_label', (r.payload->>'lot_code')::int, true)
    on conflict (naac, corps_label) do update set lot_code = excluded.lot_code, validated = true;
  end if;
  update plans_prevention.referential_proposals
     set status = case when p_approve then 'APPROUVEE' else 'REFUSEE' end,
         decided_by = auth.uid(), decided_at = now(), decision_comment = p_comment
   where id = p_id;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'CORPS_NAAC_DECIDED', 'referential_proposals', p_id::text, jsonb_build_object('approved', p_approve, 'comment', p_comment));
end $$;

revoke execute on function plans_prevention.propose_corps_naac(text,text,int,text) from public, anon;
revoke execute on function plans_prevention.decide_corps_naac(bigint,boolean,text) from public, anon;
grant execute on function plans_prevention.propose_corps_naac(text,text,int,text) to authenticated;
grant execute on function plans_prevention.decide_corps_naac(bigint,boolean,text) to authenticated;
