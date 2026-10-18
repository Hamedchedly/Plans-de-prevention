-- Paramètres de l'application (modèle de nom des fichiers de fiches), modifiables par le Super Admin.
-- Accès uniquement par fonctions « security definer » ; aucune politique.

create table if not exists plans_prevention.app_settings (
  key text primary key,
  value text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table plans_prevention.app_settings enable row level security;
revoke all on plans_prevention.app_settings from public, anon, authenticated;

insert into plans_prevention.app_settings(key, value)
values ('file_name_template', '{entreprise}_{commande}_{secteur}_Plan de prévention')
on conflict (key) do nothing;

create or replace function plans_prevention.app_setting_get(p_key text)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not plans_prevention.is_active_user() then raise exception 'Accès refusé'; end if;
  return (select value from plans_prevention.app_settings where key = p_key);
end $$;

create or replace function plans_prevention.app_setting_set(p_key text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if p_key not in ('file_name_template') then raise exception 'Paramètre inconnu'; end if;
  if nullif(trim(coalesce(p_value, '')), '') is null then raise exception 'Valeur vide'; end if;
  insert into plans_prevention.app_settings(key, value, updated_by, updated_at)
  values (p_key, trim(p_value), auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SETTING_CHANGED', 'app_settings', p_key, jsonb_build_object('value', trim(p_value)));
end $$;

revoke execute on function plans_prevention.app_setting_get(text) from public, anon;
revoke execute on function plans_prevention.app_setting_set(text, text) from public, anon;
grant execute on function plans_prevention.app_setting_get(text) to authenticated;
grant execute on function plans_prevention.app_setting_set(text, text) to authenticated;
