-- Adresse réelle du chantier.
-- address = adresse source (export commandes, ou adresse réelle du suivi budgétaire, STSC_ADRESSE, prioritaire si renseignée)
-- address_manual = correction saisie par le chargé ; conservée lors des ré-imports, prioritaire à l'affichage.

alter table plans_prevention.orders add column if not exists address_manual text;

-- 1. Reprise de l'adresse du suivi budgétaire (la plus récente non vide par commande)
create or replace function plans_prevention.apply_budget_addresses()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  with latest as (
    select distinct on (b.order_number) b.order_number, nullif(btrim(b.raw->>'STSC_ADRESSE'), '') as addr
      from plans_prevention.budget_tracking b
      join plans_prevention.imports i on i.id = b.import_id
     where b.order_number is not null and nullif(btrim(b.raw->>'STSC_ADRESSE'), '') is not null
     order by b.order_number, i.created_at desc
  )
  update plans_prevention.orders o set address = l.addr
    from latest l
   where o.order_number = l.order_number and o.address is distinct from l.addr;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function plans_prevention.apply_budget_addresses() from public, anon;
grant execute on function plans_prevention.apply_budget_addresses() to authenticated;

-- Reprise immédiate des adresses déjà présentes dans le suivi budgétaire importé
with latest as (
  select distinct on (b.order_number) b.order_number, nullif(btrim(b.raw->>'STSC_ADRESSE'), '') as addr
    from plans_prevention.budget_tracking b
    join plans_prevention.imports i on i.id = b.import_id
   where b.order_number is not null and nullif(btrim(b.raw->>'STSC_ADRESSE'), '') is not null
   order by b.order_number, i.created_at desc
)
update plans_prevention.orders o set address = l.addr
  from latest l
 where o.order_number = l.order_number and o.address is distinct from l.addr;

-- 2. Correction d'adresse par le chargé (ou le responsable / Super Admin) : visible sur la commande qu'il peut voir
create or replace function plans_prevention.update_order_address(p_order text, p_address text)
returns void language plpgsql security definer set search_path = '' as $$
declare v text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if not exists (
    select 1 from plans_prevention.orders o
     where o.order_number = p_order
       and (plans_prevention.is_manager()
            or o.operator_code = plans_prevention.current_operator()
            or o.sector_code = any (plans_prevention.current_sector_codes()))
  ) then
    raise exception 'Commande introuvable ou non accessible';
  end if;
  update plans_prevention.orders set address_manual = v where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDER_ADDRESS_SET', 'orders', p_order, jsonb_build_object('address', v));
end $$;
revoke execute on function plans_prevention.update_order_address(text, text) from public, anon;
grant execute on function plans_prevention.update_order_address(text, text) to authenticated;
