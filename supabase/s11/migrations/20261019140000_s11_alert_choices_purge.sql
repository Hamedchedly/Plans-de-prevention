-- 1. Alertes à choix : options proposées pour chaque décision. Les décisions A01 à A06 (basées sur des « réponses »
--    qui n'ont pas été recueillies dans l'application) repassent à traiter, avec leurs choix.
alter table plans_prevention.alerts add column if not exists options text[];

update plans_prevention.alerts set options = array[
  'Chute d’objet et chute de hauteur (proposition)', 'Chute d’objet seulement (modèle actuel)', 'Chute de hauteur seulement']
 where code = 'A01';
update plans_prevention.alerts set options = array[
  'Ajouter « Vibration » (proposition)', 'Ne pas ajouter « Vibration » (modèle actuel)']
 where code = 'A02';
update plans_prevention.alerts set options = array[
  'Ajouter « Chute d’objet » et « Produit chimique » pour projections et éclaboussures (proposition)', 'Coupure seulement (modèle actuel)']
 where code = 'A03';
update plans_prevention.alerts set options = array[
  'Rattacher au lot 14 PEINTURE / REVETEMENTS DE SOL (proposition)', 'Ne pas rattacher (natures absentes du modèle)']
 where code = 'A04';
update plans_prevention.alerts set options = array[
  'Rattacher au lot 21 VOIRIES / RESEAUX DIVERS (proposition)', 'Ne pas rattacher']
 where code = 'A05';
update plans_prevention.alerts set options = array[
  'Conserver multi-lots (proposition)', 'Fusionner les natures']
 where code = 'A06';

update plans_prevention.alerts
   set status = 'A_VALIDER', decision_comment = null, decided_at = null, decided_by = null
 where code in ('A01', 'A02', 'A03', 'A04', 'A05', 'A06');

-- 2. Purge des commandes hors périmètre (HO) et des entreprises qui ne leur sont rattachées que ;
--    les données supprimées sont conservées dans purge_log (récupérables).
create table if not exists plans_prevention.purge_log (
  id bigint generated always as identity primary key,
  purged_at timestamptz not null default now(),
  purged_by uuid,
  orders_count int not null,
  companies_count int not null,
  payload jsonb not null
);
alter table plans_prevention.purge_log enable row level security;
revoke all on plans_prevention.purge_log from public, anon, authenticated;

create or replace function plans_prevention.purge_preview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_orders int; v_companies int; v_kept int;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  select count(*) into v_orders from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE';
  select count(*) into v_companies from plans_prevention.companies c
   where c.isis_code in (select isis_code from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE' and isis_code is not null)
     and not exists (select 1 from plans_prevention.orders i where i.isis_code = c.isis_code and i.scope_status = 'IN_SCOPE');
  select count(*) into v_kept from plans_prevention.companies c
   where c.isis_code in (select isis_code from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE' and isis_code is not null)
     and exists (select 1 from plans_prevention.orders i where i.isis_code = c.isis_code and i.scope_status = 'IN_SCOPE');
  return jsonb_build_object('orders', v_orders, 'companies', v_companies, 'companies_kept', v_kept);
end $$;
revoke execute on function plans_prevention.purge_preview() from public, anon;
grant execute on function plans_prevention.purge_preview() to authenticated;

create or replace function plans_prevention.purge_out_of_scope()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_orders jsonb; v_companies jsonb; v_natures jsonb; v_lots jsonb; v_risks jsonb; v_measures jsonb;
  v_n_orders int; v_n_companies int; v_payload jsonb;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  -- sauvegarde avant suppression
  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into v_orders from plans_prevention.orders o where o.scope_status = 'OUT_OF_SCOPE';
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_companies from plans_prevention.companies c
   where c.isis_code in (select isis_code from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE' and isis_code is not null)
     and not exists (select 1 from plans_prevention.orders i where i.isis_code = c.isis_code and i.scope_status = 'IN_SCOPE');
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_natures from plans_prevention.order_natures x
   where x.order_number in (select order_number from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE');
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_lots from plans_prevention.order_lots x
   where x.order_number in (select order_number from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE');
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_risks from plans_prevention.order_risks x
   where x.order_number in (select order_number from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE');
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_measures from plans_prevention.order_measures x
   where x.order_number in (select order_number from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE');
  v_payload := jsonb_build_object('orders', v_orders, 'companies', v_companies, 'order_natures', v_natures,
                                  'order_lots', v_lots, 'order_risks', v_risks, 'order_measures', v_measures);
  v_n_orders := jsonb_array_length(v_orders);
  v_n_companies := jsonb_array_length(v_companies);

  -- suppression : les commandes entraînent leurs lignes liées (cascade)
  delete from plans_prevention.orders where scope_status = 'OUT_OF_SCOPE';
  delete from plans_prevention.companies c
   where c.isis_code in (select (x->>'isis_code') from jsonb_array_elements(v_companies) x)
     and not exists (select 1 from plans_prevention.orders i where i.isis_code = c.isis_code);

  insert into plans_prevention.purge_log(purged_by, orders_count, companies_count, payload)
  values (auth.uid(), v_n_orders, v_n_companies, v_payload);
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PURGE_HORS_PERIMETRE', 'orders', null, jsonb_build_object('orders', v_n_orders, 'companies', v_n_companies));
  return jsonb_build_object('orders', v_n_orders, 'companies', v_n_companies);
end $$;
revoke execute on function plans_prevention.purge_out_of_scope() from public, anon;
grant execute on function plans_prevention.purge_out_of_scope() to authenticated;
