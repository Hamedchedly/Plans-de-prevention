-- Modèle de nom du ZIP des fiches (variables : {entreprise}, {nombre}, {secteur}).
create or replace function plans_prevention.app_setting_set(p_key text, p_value text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if p_key not in ('file_name_template', 'zip_name_template', 'mail_objet', 'mail_corps', 'mail_groupe_objet', 'mail_groupe_corps', 'pdf_procedure_alerte', 'pdf_pied_de_page') then raise exception 'Paramètre inconnu'; end if;
  if nullif(trim(coalesce(p_value, '')), '') is null then raise exception 'Valeur vide'; end if;
  insert into plans_prevention.app_settings(key, value, updated_by, updated_at)
  values (p_key, trim(p_value), auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SETTING_CHANGED', 'app_settings', p_key, jsonb_build_object('value', trim(p_value)));
end $$;
