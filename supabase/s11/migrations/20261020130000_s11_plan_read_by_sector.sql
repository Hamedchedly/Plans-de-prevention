-- Lecture de la fiche (lots, risques, mesures) alignée sur la visibilité de la commande :
-- un chargé voit les fiches de ses commandes et de ses secteurs, comme il voit la commande.
-- Les écritures restent inchangées (politiques order_*_rw, et fonctions save_plan / save_plan_natures).
create policy order_lots_select_visible on plans_prevention.order_lots for select to authenticated
  using (exists (select 1 from plans_prevention.orders o where o.order_number = order_lots.order_number
    and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator()
         or o.sector_code = any (plans_prevention.current_sector_codes()))));
create policy order_risks_select_visible on plans_prevention.order_risks for select to authenticated
  using (exists (select 1 from plans_prevention.orders o where o.order_number = order_risks.order_number
    and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator()
         or o.sector_code = any (plans_prevention.current_sector_codes()))));
create policy order_measures_select_visible on plans_prevention.order_measures for select to authenticated
  using (exists (select 1 from plans_prevention.orders o where o.order_number = order_measures.order_number
    and (plans_prevention.is_manager() or o.operator_code = plans_prevention.current_operator()
         or o.sector_code = any (plans_prevention.current_sector_codes()))));
