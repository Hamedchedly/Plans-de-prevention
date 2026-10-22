-- Correction : le contrôle « chargé de la commande » renvoyait NULL quand un code était vide,
-- et « if not (...) » ne levait alors aucune erreur. Désormais : refus explicite si le code ne correspond pas.
-- À exécuter dans l'éditeur SQL (contient des instructions de suppression de lignes existantes, remplacées à l'identique).

create or replace function plans_prevention.save_plan(p_order text, p_nature_id bigint, p_proposal_id bigint, p_lots jsonb, p_risks jsonb, p_measures jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_op text;
begin
  if plans_prevention.my_role() = 'ASSISTANT' then raise exception 'Le rôle Assistant ne crée ni ne modifie de fiche'; end if;
  select plan_status, operator_code into v_status, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or coalesce(v_op = plans_prevention.current_operator(), false)) then raise exception 'Accès refusé'; end if;
  if v_status not in ('NON_QUALIFIEE', 'A_ENVOYER') then raise exception 'Plan verrouillé (statut %)', v_status; end if;
  if p_proposal_id is not null and not exists (
       select 1 from plans_prevention.referential_proposals
        where id = p_proposal_id and status = 'EN_ATTENTE' and created_by = auth.uid()) then
    raise exception 'Proposition invalide';
  end if;

  delete from plans_prevention.order_lots where order_number = p_order;
  insert into plans_prevention.order_lots(order_number, lot_code, source, confidence, chosen_by)
    select p_order, (x->>'code')::int, x->>'source', nullif(x->>'confidence', '')::numeric, auth.uid()
      from jsonb_array_elements(coalesce(p_lots, '[]'::jsonb)) x;

  delete from plans_prevention.order_risks where order_number = p_order;
  insert into plans_prevention.order_risks(order_number, risk_code, checked, origin, updated_by)
    select p_order, x->>'code', (x->>'checked')::boolean, x->>'origin', auth.uid()
      from jsonb_array_elements(coalesce(p_risks, '[]'::jsonb)) x;

  delete from plans_prevention.order_measures where order_number = p_order;
  insert into plans_prevention.order_measures(order_number, measure_code, checked, origin, updated_by)
    select p_order, x->>'code', (x->>'checked')::boolean, x->>'origin', auth.uid()
      from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) x;

  update plans_prevention.orders
     set nature_id = case when p_proposal_id is null then p_nature_id else null end,
         nature_proposal_id = p_proposal_id,
         qualification_status = 'QUALIFIED',
         plan_status = case when plan_status = 'NON_QUALIFIEE' then 'A_ENVOYER' else plan_status end,
         updated_at = now()
   where order_number = p_order;

  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PLAN_SAVED', 'orders', p_order, jsonb_build_object('nature_id', p_nature_id, 'proposal_id', p_proposal_id));
end $$;

create or replace function plans_prevention.save_plan_natures(p_order text, p_natures bigint[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_op text;
begin
  if plans_prevention.my_role() = 'ASSISTANT' then raise exception 'Le rôle Assistant ne crée ni ne modifie de fiche'; end if;
  select plan_status, operator_code into v_status, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or coalesce(v_op = plans_prevention.current_operator(), false)) then raise exception 'Accès refusé'; end if;
  if v_status not in ('NON_QUALIFIEE', 'A_ENVOYER') then raise exception 'Plan verrouillé (statut %)', v_status; end if;
  delete from plans_prevention.order_natures where order_number = p_order;
  insert into plans_prevention.order_natures(order_number, nature_id, chosen_by)
    select p_order, n, auth.uid() from unnest(coalesce(p_natures, '{}'::bigint[])) n
    on conflict do nothing;
end $$;

create or replace function plans_prevention.set_plan_period(p_order text, p_start date, p_end date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_op text;
begin
  if plans_prevention.my_role() = 'ASSISTANT' then raise exception 'Le rôle Assistant ne crée ni ne modifie de fiche'; end if;
  select plan_status, operator_code into v_status, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or coalesce(v_op = plans_prevention.current_operator(), false)) then raise exception 'Accès refusé'; end if;
  if v_status not in ('NON_QUALIFIEE', 'A_ENVOYER') then raise exception 'Plan verrouillé (statut %)', v_status; end if;
  if p_start is not null and p_end is not null and p_end < p_start then raise exception 'La fin est antérieure au début'; end if;
  update plans_prevention.orders set period_start = p_start, period_end = p_end, updated_at = now() where order_number = p_order;
end $$;
