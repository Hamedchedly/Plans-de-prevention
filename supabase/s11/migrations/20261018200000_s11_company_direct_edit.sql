-- Modification directe d'une fiche entreprise par le Super Admin (sans proposition). Accès par fonction uniquement.
create or replace function plans_prevention.admin_save_company(p_isis text, p_fields jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if nullif(trim(coalesce(p_isis, '')), '') is null then raise exception 'Numéro d''entreprise manquant'; end if;
  insert into plans_prevention.companies(isis_code, name, os_email, director_name, director_email, director_phone, company_phone, updated_by, updated_at, validated_by, archived)
  values (trim(p_isis),
          nullif(trim(p_fields->>'name'), ''), nullif(trim(p_fields->>'os_email'), ''),
          nullif(trim(p_fields->>'director_name'), ''), nullif(trim(p_fields->>'director_email'), ''),
          nullif(trim(p_fields->>'director_phone'), ''), nullif(trim(p_fields->>'company_phone'), ''),
          auth.uid(), now(), auth.uid(), false)
  on conflict (isis_code) do update set
    name = excluded.name, os_email = excluded.os_email,
    director_name = excluded.director_name, director_email = excluded.director_email,
    director_phone = excluded.director_phone, company_phone = excluded.company_phone,
    updated_by = excluded.updated_by, updated_at = now(), validated_by = excluded.validated_by, archived = false;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'COMPANY_SAVED', 'companies', trim(p_isis), jsonb_build_object('name', nullif(trim(p_fields->>'name'), ''), 'os_email', nullif(trim(p_fields->>'os_email'), '')));
end $$;

revoke execute on function plans_prevention.admin_save_company(text, jsonb) from public, anon;
grant execute on function plans_prevention.admin_save_company(text, jsonb) to authenticated;
