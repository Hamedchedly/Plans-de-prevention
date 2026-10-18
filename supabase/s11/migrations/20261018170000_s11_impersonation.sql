-- Connexion à la place d'un utilisateur (Super Admin) : fin de session journalisée depuis la session ouverte.
-- Le début est journalisé par la fonction serveur « impersonate » (rôle service, avec l'administrateur et la cible).

create or replace function plans_prevention.log_activity(p_action text, p_entity text, p_entity_id text, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_active_user() then return; end if;
  if p_action not in ('LOGIN', 'IMPORT', 'ERROR', 'IMPERSONATION_END') then return; end if;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), p_action, left(coalesce(p_entity, ''), 100), left(coalesce(p_entity_id, ''), 200), coalesce(p_payload, '{}'::jsonb));
end $$;
