-- Communications : modèles de mails (envoyés ensuite par mailto depuis l'application).
-- Un modèle « Après import » sert à prévenir chaque chargé du nombre de nouvelles commandes.

create table if not exists plans_prevention.communication_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'LIBRE' check (kind in ('IMPORT', 'LIBRE')),
  name text not null check (length(trim(name)) > 0),
  subject text not null default '',
  body text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table plans_prevention.communication_templates enable row level security;

drop policy if exists communication_templates_select on plans_prevention.communication_templates;
create policy communication_templates_select on plans_prevention.communication_templates for select to authenticated
  using (plans_prevention.is_manager());

grant select on plans_prevention.communication_templates to authenticated;

-- Création (p_id nul) ou modification d'un modèle, par un Responsable ou le Super Admin.
create or replace function plans_prevention.save_communication_template(
  p_id uuid, p_kind text, p_name text, p_subject text, p_body text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  if p_kind not in ('IMPORT', 'LIBRE') then raise exception 'Type de modèle inconnu'; end if;
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

-- Modèle de départ, uniquement s'il n'en existe encore aucun de type « Après import ».
insert into plans_prevention.communication_templates (kind, name, subject, body)
select 'IMPORT',
       'Nouvelles commandes après import',
       'Nouvelles commandes à traiter – {fichier}',
       'Bonjour {prenom},' || chr(10) || chr(10)
         || 'Le fichier « {fichier} » a été importé le {date}.' || chr(10)
         || '{nouvelles} nouvelle(s) commande(s) vous ont été affectée(s).' || chr(10) || chr(10)
         || 'Cordialement,' || chr(10) || '{redacteur}'
where not exists (select 1 from plans_prevention.communication_templates where kind = 'IMPORT');
