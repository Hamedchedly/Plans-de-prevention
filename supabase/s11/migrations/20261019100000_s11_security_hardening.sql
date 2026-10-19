-- Audit 2026-10-19 : promote_super_admin n'avait aucun contrôle et était appelable par tout utilisateur connecté.
-- L'application ne l'appelle pas : retrait de tous les droits client (reste disponible depuis l'éditeur SQL).
revoke execute on function plans_prevention.promote_super_admin(text) from public, anon, authenticated;

-- Aucune fonction métier n'est appelée sans connexion : retrait de l'exécution anonyme sur toutes les fonctions SECURITY DEFINER du schéma.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'plans_prevention' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', r.fn);
  end loop;
end $$;
