-- 1. Utilisateur « dans le service » : champ séparé de « Actif » (un compte hors service garde son accès, il est seulement masqué).
alter table plans_prevention.profiles add column if not exists in_service boolean not null default true;

create or replace function plans_prevention.set_in_service(p_user_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if not exists (select 1 from plans_prevention.profiles where user_id = p_user_id) then raise exception 'Profil introuvable'; end if;
  update plans_prevention.profiles set in_service = p_value where user_id = p_user_id;
  insert into plans_prevention.audit_logs(actor_user_id, subject_user_id, action, entity, entity_id, payload)
  values (auth.uid(), p_user_id, 'PROFILE_SERVICE_CHANGED', 'profiles', p_user_id::text, jsonb_build_object('in_service', p_value));
end $$;
revoke execute on function plans_prevention.set_in_service(uuid, boolean) from public, anon;
grant execute on function plans_prevention.set_in_service(uuid, boolean) to authenticated;

-- 2. L'assistant lit toutes les fiches de l'entreprise (commandes, lots, risques, mesures).
create policy orders_select_assistant on plans_prevention.orders for select to authenticated
  using (plans_prevention.my_role() = 'ASSISTANT');
create policy order_lots_select_assistant on plans_prevention.order_lots for select to authenticated
  using (plans_prevention.my_role() = 'ASSISTANT');
create policy order_risks_select_assistant on plans_prevention.order_risks for select to authenticated
  using (plans_prevention.my_role() = 'ASSISTANT');
create policy order_measures_select_assistant on plans_prevention.order_measures for select to authenticated
  using (plans_prevention.my_role() = 'ASSISTANT');

-- 3. Pas de code chargé pour l'assistant : save_plan, save_plan_natures et set_plan_period exigent un chargé de la commande,
--    donc refusent l'assistant sans modifier leur code.
alter table plans_prevention.profiles add constraint profiles_assistant_no_operator
  check (role <> 'ASSISTANT' or operator_code is null);

-- 4. Envoi : l'assistant peut seulement faire passer une fiche « À envoyer » à « En attente retour ».
create or replace function plans_prevention.advance_plan_status(p_order text, p_to text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from text; v_op text;
begin
  select plan_status, operator_code into v_from, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (
    plans_prevention.is_manager() or v_op = plans_prevention.current_operator()
    or (plans_prevention.my_role() = 'ASSISTANT' and v_from = 'A_ENVOYER' and p_to = 'EN_ATTENTE_RETOUR')
  ) then raise exception 'Accès refusé'; end if;
  if not (
    (v_from = 'A_ENVOYER' and p_to = 'EN_ATTENTE_RETOUR')
    or (v_from = 'EN_ATTENTE_RETOUR' and p_to = 'SIGNEE')
    or (v_from = 'EN_ATTENTE_RETOUR' and p_to = 'ARCHIVEE')
    or (v_from = 'SIGNEE' and p_to = 'ARCHIVEE')
  ) then
    raise exception 'Transition interdite : % vers %', v_from, p_to;
  end if;
  update plans_prevention.orders
     set plan_status = p_to,
         archive_reason = case when p_to = 'ARCHIVEE' then 'MANUEL' else null end,
         updated_at = now()
   where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PLAN_STATUS_CHANGED', 'orders', p_order, jsonb_build_object('from', v_from, 'to', p_to));
end $$;
