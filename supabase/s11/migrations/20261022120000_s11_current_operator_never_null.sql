-- Sans code chargé, current_operator() renvoyait NULL : la comparaison « chargé de la commande » ne levait alors
-- aucune erreur dans save_plan, save_plan_natures et set_plan_period. Désormais une chaîne vide : la comparaison est fausse.
create or replace function plans_prevention.current_operator()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(p.operator_code, '') from plans_prevention.profiles p where p.user_id = auth.uid()
$$;
