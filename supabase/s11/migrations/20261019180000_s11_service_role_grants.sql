-- Le rôle de service (fonctions serveur : invite-user, impersonate) doit pouvoir lire et écrire le schéma.
-- Sans ces droits, la lecture du profil échoue (« permission denied for schema plans_prevention »).
grant usage on schema plans_prevention to service_role;
grant select, insert, update on all tables in schema plans_prevention to service_role;
grant usage, select on all sequences in schema plans_prevention to service_role;
grant execute on all functions in schema plans_prevention to service_role;
alter default privileges in schema plans_prevention grant select, insert, update on tables to service_role;
