-- Référentiels plans de prévention (S11). Modifiables par le Super Admin uniquement.
create table plans_prevention.lots (
  code int primary key,                 -- N° du modèle PLAN_DE_PREVENTION (1..21)
  name text not null unique,
  active boolean not null default true
);

create table plans_prevention.risks (
  code text primary key,                -- R01..R14, libellé identique à la fiche
  label text not null unique,
  family text not null,
  active boolean not null default true
);

create table plans_prevention.measures (
  code text primary key,                -- M01..M27
  label text not null unique,
  family text not null,
  rule_type text not null check (rule_type in ('ANY_RISK','ALL_RISKS','MANUAL')),
  -- ANY_RISK : cochée si au moins un risque lié est coché
  -- ALL_RISKS : cochée si au moins un risque est coché (règle « tous risques »)
  -- MANUAL : jamais automatique
  validated boolean not null default false,
  active boolean not null default true
);

create table plans_prevention.measure_risk_rules (
  measure_code text not null references plans_prevention.measures(code) on delete cascade,
  risk_code text not null references plans_prevention.risks(code) on delete cascade,
  primary key (measure_code, risk_code)
);

create table plans_prevention.lot_risks (
  lot_code int not null references plans_prevention.lots(code),
  risk_code text not null references plans_prevention.risks(code),
  is_default boolean not null,          -- présent dans >= 50 % des tâches du lot
  validated boolean not null default false,
  primary key (lot_code, risk_code)
);

create table plans_prevention.natures (
  id bigint generated always as identity primary key,
  label text not null unique,
  model_code text,                      -- code modèle lot.tâche (ex. 3.1.1) si connu
  group_label text,                     -- groupe du modèle (ex. « Fondations »)
  keywords text[] not null default '{}',
  active boolean not null default true
);

create table plans_prevention.nature_lots (
  nature_id bigint not null references plans_prevention.natures(id) on delete cascade,
  lot_code int not null references plans_prevention.lots(code),
  primary key (nature_id, lot_code)
);

create table plans_prevention.nature_risks (   -- écarts propres à une nature, en plus des défauts du lot
  nature_id bigint not null references plans_prevention.natures(id) on delete cascade,
  risk_code text not null references plans_prevention.risks(code),
  primary key (nature_id, risk_code)
);

create table plans_prevention.vocabulary (
  term text primary key,                -- mot saisi par le chargé
  equivalents text[] not null
);

create table plans_prevention.alerts (
  code text primary key,                -- A01…
  type text not null,
  object text not null,
  finding text not null,
  proposal text not null,
  status text not null default 'A_VALIDER'
    check (status in ('A_VALIDER','APPLIQUE_A_VALIDER','VALIDE','MODIFIE','IGNORE')),
  decision_comment text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table plans_prevention.referentiel_versions (
  id bigint generated always as identity primary key,
  label text not null,
  source text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- RLS : lecture pour tout utilisateur actif, écriture pour le Super Admin
do $$
declare t text;
begin
  foreach t in array array['lots','risks','measures','measure_risk_rules','lot_risks','natures','nature_lots','nature_risks','vocabulary','alerts','referentiel_versions']
  loop
    execute format('alter table plans_prevention.%I enable row level security', t);
    execute format('create policy %I on plans_prevention.%I for select to authenticated using (plans_prevention.my_role() is not null)', t||'_select', t);
    execute format('create policy %I on plans_prevention.%I for all to authenticated using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin())', t||'_admin', t);
    execute format('grant select on plans_prevention.%I to authenticated', t);
  end loop;
end $$;
grant insert, update, delete on plans_prevention.lots, plans_prevention.risks, plans_prevention.measures,
  plans_prevention.measure_risk_rules, plans_prevention.lot_risks, plans_prevention.natures,
  plans_prevention.nature_lots, plans_prevention.nature_risks, plans_prevention.vocabulary,
  plans_prevention.referentiel_versions to authenticated;
grant insert, update, delete on plans_prevention.alerts to authenticated;
grant usage on all sequences in schema plans_prevention to authenticated;

-- Décision sur une alerte : responsables et Super Admin
create or replace function plans_prevention.decide_alert(p_code text, p_status text, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  if p_status not in ('VALIDE','MODIFIE','IGNORE','A_VALIDER','APPLIQUE_A_VALIDER') then raise exception 'Statut invalide'; end if;
  update plans_prevention.alerts set status = p_status, decision_comment = p_comment,
         decided_by = auth.uid(), decided_at = now() where code = p_code;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ALERT_DECIDED', 'alerts', p_code, jsonb_build_object('status', p_status, 'comment', p_comment));
end $$;
grant execute on function plans_prevention.decide_alert(text,text,text) to authenticated;
