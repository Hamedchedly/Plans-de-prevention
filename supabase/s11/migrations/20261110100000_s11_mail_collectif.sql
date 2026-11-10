-- Mail pour toute l'équipe : un modèle propre, éditable comme le mail individuel.
-- Le type COLLECTIF est ajouté ; le mail individuel (IMPORT) et le libre (LIBRE) ne changent pas.

alter table plans_prevention.communication_templates drop constraint if exists communication_templates_kind_check;
alter table plans_prevention.communication_templates
  add constraint communication_templates_kind_check check (kind in ('IMPORT', 'LIBRE', 'COLLECTIF'));

create or replace function plans_prevention.save_communication_template(
  p_id uuid, p_kind text, p_name text, p_subject text, p_body text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  if p_kind not in ('IMPORT', 'LIBRE', 'COLLECTIF') then raise exception 'Type de modèle inconnu'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is null then raise exception 'Nom vide'; end if;

  if v_id is null then
    insert into plans_prevention.communication_templates (kind, name, subject, body, updated_by)
    values (p_kind, trim(p_name), coalesce(p_subject, ''), coalesce(p_body, ''), auth.uid())
    returning id into v_id;
  else
    update plans_prevention.communication_templates
       set kind = p_kind, name = trim(p_name), subject = coalesce(p_subject, ''), body = coalesce(p_body, ''),
           updated_by = auth.uid(), updated_at = now()
     where id = v_id;
    if not found then raise exception 'Modèle introuvable'; end if;
  end if;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'COMM_TEMPLATE_SAVED', 'communication_templates', v_id::text,
          jsonb_build_object('nom', trim(p_name), 'type', p_kind));
  return v_id;
end $$;

revoke execute on function plans_prevention.save_communication_template(uuid, text, text, text, text) from public, anon;
grant execute on function plans_prevention.save_communication_template(uuid, text, text, text, text) to authenticated;

-- Modèle de départ du mail pour toute l'équipe (ajouté une seule fois).
insert into plans_prevention.communication_templates (kind, name, subject, body)
select 'COLLECTIF',
       'Mail pour toute l’équipe',
       'Nouvelles commandes à traiter – import du {date}',
       'Bonjour {prenom},' || chr(10) || chr(10)
         || 'Les nouvelles commandes ont été importées le {date}.' || chr(10) || chr(10)
         || 'Récapitulatif par chargé :' || chr(10) || chr(10)
         || '{recap}' || chr(10) || chr(10)
         || 'Cordialement,' || chr(10)
         || '{redacteur}'
where not exists (select 1 from plans_prevention.communication_templates where kind = 'COLLECTIF');
