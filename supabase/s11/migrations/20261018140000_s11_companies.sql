-- Entreprises (identifiées par leur numéro ENTN_NUM) : fiches validées + propositions des utilisateurs à valider.

create table if not exists plans_prevention.companies (
  isis_code text primary key,
  name text,
  os_email text,
  director_name text,
  director_email text,
  director_phone text,
  company_phone text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  validated_by uuid references auth.users(id)
);

create table if not exists plans_prevention.company_proposals (
  id bigint generated always as identity primary key,
  isis_code text not null,
  payload jsonb not null,
  status text not null default 'EN_ATTENTE' check (status in ('EN_ATTENTE', 'APPROUVEE', 'MODIFIEE', 'REFUSEE')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_comment text
);
create index if not exists company_proposals_status_idx on plans_prevention.company_proposals (status);

alter table plans_prevention.companies enable row level security;
alter table plans_prevention.company_proposals enable row level security;
create policy companies_read on plans_prevention.companies for select to authenticated using (plans_prevention.is_active_user());
create policy company_proposals_read on plans_prevention.company_proposals for select to authenticated
  using (plans_prevention.is_super_admin() or created_by = auth.uid());
grant select on plans_prevention.companies to authenticated;
grant select on plans_prevention.company_proposals to authenticated;

-- Champs saisissables (liste blanche)
create or replace function plans_prevention.company_fields(p jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'name', nullif(trim(p->>'name'), ''),
    'os_email', nullif(trim(p->>'os_email'), ''),
    'director_name', nullif(trim(p->>'director_name'), ''),
    'director_email', nullif(trim(p->>'director_email'), ''),
    'director_phone', nullif(trim(p->>'director_phone'), ''),
    'company_phone', nullif(trim(p->>'company_phone'), ''))
$$;

-- Un utilisateur propose des informations : elles restent en attente de validation.
create or replace function plans_prevention.propose_company(p_isis text, p_fields jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not plans_prevention.is_active_user() then raise exception 'Accès refusé'; end if;
  if nullif(trim(coalesce(p_isis, '')), '') is null then raise exception 'Numéro d''entreprise manquant'; end if;
  insert into plans_prevention.company_proposals (isis_code, payload, created_by)
  values (trim(p_isis), plans_prevention.company_fields(p_fields), auth.uid())
  returning id into v_id;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'COMPANY_PROPOSED', 'company_proposals', v_id::text, jsonb_build_object('isis_code', trim(p_isis)));
  return v_id;
end $$;

-- Le Super Admin valide, modifie (p_fields) ou refuse une proposition.
create or replace function plans_prevention.decide_company_proposal(p_id bigint, p_approve boolean, p_comment text, p_fields jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r plans_prevention.company_proposals; v_fields jsonb; v_status text;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  select * into r from plans_prevention.company_proposals where id = p_id for update;
  if not found or r.status <> 'EN_ATTENTE' then raise exception 'Proposition introuvable ou déjà traitée'; end if;
  v_fields := plans_prevention.company_fields(coalesce(p_fields, r.payload));
  if not p_approve then v_status := 'REFUSEE';
  elsif p_fields is null then v_status := 'APPROUVEE';
  else v_status := 'MODIFIEE'; end if;
  if p_approve then
    insert into plans_prevention.companies (isis_code, name, os_email, director_name, director_email, director_phone, company_phone, updated_by, updated_at, validated_by)
    values (r.isis_code, v_fields->>'name', v_fields->>'os_email', v_fields->>'director_name', v_fields->>'director_email', v_fields->>'director_phone', v_fields->>'company_phone', auth.uid(), now(), auth.uid())
    on conflict (isis_code) do update set name = excluded.name, os_email = excluded.os_email, director_name = excluded.director_name,
      director_email = excluded.director_email, director_phone = excluded.director_phone, company_phone = excluded.company_phone,
      updated_by = excluded.updated_by, updated_at = now(), validated_by = excluded.validated_by;
  end if;
  update plans_prevention.company_proposals
     set status = v_status, decided_by = auth.uid(), decided_at = now(), decision_comment = p_comment
   where id = p_id;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'COMPANY_DECIDED', 'company_proposals', p_id::text, jsonb_build_object('status', v_status, 'isis_code', r.isis_code, 'comment', p_comment));
end $$;

-- Saisie directe par le Super Admin (import Excel) : rows = [{isis_code, name, ...}]
create or replace function plans_prevention.upsert_companies(p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare x jsonb; v_n integer := 0; v_fields jsonb;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if nullif(trim(coalesce(x->>'isis_code', '')), '') is null then continue; end if;
    v_fields := plans_prevention.company_fields(x);
    insert into plans_prevention.companies (isis_code, name, os_email, director_name, director_email, director_phone, company_phone, updated_by, updated_at, validated_by)
    values (trim(x->>'isis_code'), v_fields->>'name', v_fields->>'os_email', v_fields->>'director_name', v_fields->>'director_email', v_fields->>'director_phone', v_fields->>'company_phone', auth.uid(), now(), auth.uid())
    on conflict (isis_code) do update set name = excluded.name, os_email = excluded.os_email, director_name = excluded.director_name,
      director_email = excluded.director_email, director_phone = excluded.director_phone, company_phone = excluded.company_phone,
      updated_by = excluded.updated_by, updated_at = now(), validated_by = excluded.validated_by;
    v_n := v_n + 1;
  end loop;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'COMPANY_IMPORT', 'companies', null, jsonb_build_object('rows', v_n));
  return v_n;
end $$;

create or replace function plans_prevention.delete_company(p_isis text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  delete from plans_prevention.companies where isis_code = p_isis;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'COMPANY_DELETED', 'companies', p_isis, '{}'::jsonb);
end $$;

revoke execute on function plans_prevention.propose_company(text,jsonb) from public, anon;
revoke execute on function plans_prevention.decide_company_proposal(bigint,boolean,text,jsonb) from public, anon;
revoke execute on function plans_prevention.upsert_companies(jsonb) from public, anon;
revoke execute on function plans_prevention.delete_company(text) from public, anon;
grant execute on function plans_prevention.propose_company(text,jsonb) to authenticated;
grant execute on function plans_prevention.decide_company_proposal(bigint,boolean,text,jsonb) to authenticated;
grant execute on function plans_prevention.upsert_companies(jsonb) to authenticated;
grant execute on function plans_prevention.delete_company(text) to authenticated;
