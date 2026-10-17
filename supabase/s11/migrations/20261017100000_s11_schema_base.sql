-- Plans de prévention — secteur S11
-- Schéma dédié : rien n'est créé ni modifié dans le schéma public (autres applications du projet).
create schema if not exists plans_prevention;

create type plans_prevention.app_role as enum ('SUPER_ADMIN','RESPONSABLE','CHARGE_OPERATIONS');

create table plans_prevention.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role plans_prevention.app_role not null default 'CHARGE_OPERATIONS',
  operator_code text,                       -- UTIC_CODE du chargé
  sector_codes text[] not null default '{}',-- secteurs visibles (ex. {S11})
  is_active boolean not null default true,
  signature_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plans_prevention.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  subject_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helpers RLS (security definer : évitent la récursion des politiques)
create or replace function plans_prevention.my_role()
returns plans_prevention.app_role language sql stable security definer set search_path = '' as $$
  select p.role from plans_prevention.profiles p where p.user_id = auth.uid() and p.is_active
$$;

create or replace function plans_prevention.current_operator()
returns text language sql stable security definer set search_path = '' as $$
  select p.operator_code from plans_prevention.profiles p where p.user_id = auth.uid()
$$;

create or replace function plans_prevention.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'SUPER_ADMIN' and p.is_active from plans_prevention.profiles p where p.user_id = auth.uid()), false)
$$;

create or replace function plans_prevention.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role in ('SUPER_ADMIN','RESPONSABLE') and p.is_active from plans_prevention.profiles p where p.user_id = auth.uid()), false)
$$;

-- updated_at automatique
create or replace function plans_prevention.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on plans_prevention.profiles
  for each row execute function plans_prevention.touch_updated_at();

-- Création automatique du profil à l'inscription (rôle chargé par défaut)
create or replace function plans_prevention.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into plans_prevention.profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created_plans after insert on auth.users
  for each row execute function plans_prevention.handle_new_user();

-- Premier super administrateur : à exécuter une fois, par un administrateur de la base
create or replace function plans_prevention.promote_super_admin(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update plans_prevention.profiles set role = 'SUPER_ADMIN', is_active = true
  where email = p_email;
  if not found then raise exception 'Aucun profil pour %', p_email; end if;
end $$;
revoke all on function plans_prevention.promote_super_admin(text) from public, anon, authenticated;

alter table plans_prevention.profiles enable row level security;
alter table plans_prevention.audit_logs enable row level security;

create policy profiles_select on plans_prevention.profiles for select to authenticated
  using (user_id = auth.uid() or plans_prevention.is_manager());
create policy profiles_update_self on plans_prevention.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Changement de rôle, de chargé ou de secteur : uniquement par le Super Admin, via cette fonction
create or replace function plans_prevention.admin_set_profile(
  p_user_id uuid, p_role plans_prevention.app_role, p_operator_code text,
  p_sector_codes text[], p_is_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old record;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  select * into v_old from plans_prevention.profiles where user_id = p_user_id;
  if not found then raise exception 'Profil introuvable'; end if;
  update plans_prevention.profiles
     set role = p_role, operator_code = p_operator_code, sector_codes = coalesce(p_sector_codes,'{}'),
         is_active = p_is_active
   where user_id = p_user_id;
  insert into plans_prevention.audit_logs(actor_user_id, subject_user_id, action, entity, entity_id, payload)
  values (auth.uid(), p_user_id, 'PROFILE_UPDATED', 'profiles', p_user_id::text,
    jsonb_build_object('before', to_jsonb(v_old), 'after', jsonb_build_object('role',p_role,'operator_code',p_operator_code,'sector_codes',p_sector_codes,'is_active',p_is_active)));
end $$;

create policy audit_select on plans_prevention.audit_logs for select to authenticated
  using (plans_prevention.is_super_admin());
create policy audit_insert on plans_prevention.audit_logs for insert to authenticated
  with check (actor_user_id = auth.uid());

grant usage on schema plans_prevention to authenticated;
grant select on plans_prevention.profiles to authenticated;
grant update (full_name, signature_path) on plans_prevention.profiles to authenticated;
grant select, insert on plans_prevention.audit_logs to authenticated;
grant usage on all sequences in schema plans_prevention to authenticated;
grant execute on all functions in schema plans_prevention to authenticated;
