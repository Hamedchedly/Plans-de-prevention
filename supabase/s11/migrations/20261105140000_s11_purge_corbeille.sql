-- Corbeille et purge (commandes et entreprises).
-- Étapes : actif -> corbeille (restaurable) -> purgée (marquée, sauvegardée, toujours restaurable).
-- La suppression définitive n'est PAS prévue ici : elle demande une validation explicite.
-- Aucune ligne importée n'est supprimée : les entreprises et commandes restent en base, seulement masquées.

-- 1. Colonnes
alter table plans_prevention.orders
  add column if not exists purged_at timestamptz,
  add column if not exists purged_by uuid;

alter table plans_prevention.companies
  add column if not exists trashed_at timestamptz,
  add column if not exists trashed_by uuid,
  add column if not exists purged_at timestamptz,
  add column if not exists purged_by uuid;

alter table plans_prevention.site_banners
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid;

-- 2. Commandes : restaurer depuis la corbeille (annule aussi une purge)
create or replace function plans_prevention.restore_trashed_orders(p_orders text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  if p_orders is null or cardinality(p_orders) = 0 then return 0; end if;

  update plans_prevention.orders
     set trashed_at = null, purged_at = null, purged_by = null, updated_at = now()
   where order_number = any(p_orders) and trashed_at is not null;
  get diagnostics n = row_count;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDERS_RESTORED_FROM_TRASH', 'orders', null,
          jsonb_build_object('count', n, 'orders', p_orders));
  return n;
end $$;

revoke execute on function plans_prevention.restore_trashed_orders(text[]) from public, anon;
grant execute on function plans_prevention.restore_trashed_orders(text[]) to authenticated;

-- 3. Commandes : purge (seulement celles déjà en corbeille, réservé au Super Admin)
create or replace function plans_prevention.purge_orders(p_orders text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if p_orders is null or cardinality(p_orders) = 0 then return 0; end if;

  update plans_prevention.orders
     set purged_at = now(), purged_by = auth.uid(), updated_at = now()
   where order_number = any(p_orders) and trashed_at is not null and purged_at is null;
  get diagnostics n = row_count;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDERS_PURGED', 'orders', null,
          jsonb_build_object('count', n, 'orders', p_orders));
  return n;
end $$;

revoke execute on function plans_prevention.purge_orders(text[]) from public, anon;
grant execute on function plans_prevention.purge_orders(text[]) to authenticated;

-- 4. Entreprises : mise en corbeille (refusée si une commande active y est rattachée)
create or replace function plans_prevention.set_companies_trashed(p_isis text[], p_trashed boolean)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  if p_isis is null or cardinality(p_isis) = 0 then return 0; end if;

  if p_trashed then
    if exists (select 1 from plans_prevention.orders o
                where o.isis_code = any(p_isis) and o.trashed_at is null) then
      raise exception 'Une ou plusieurs entreprises ont encore des commandes actives';
    end if;
    update plans_prevention.companies
       set trashed_at = now(), trashed_by = auth.uid(), updated_at = now()
     where isis_code = any(p_isis) and trashed_at is null;
  else
    update plans_prevention.companies
       set trashed_at = null, trashed_by = null, purged_at = null, purged_by = null, updated_at = now()
     where isis_code = any(p_isis) and trashed_at is not null;
  end if;
  get diagnostics n = row_count;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), case when p_trashed then 'COMPANIES_TRASHED' else 'COMPANIES_RESTORED_FROM_TRASH' end,
          'companies', null, jsonb_build_object('count', n, 'companies', p_isis));
  return n;
end $$;

revoke execute on function plans_prevention.set_companies_trashed(text[], boolean) from public, anon;
grant execute on function plans_prevention.set_companies_trashed(text[], boolean) to authenticated;

-- 5. Entreprises : purge (seulement en corbeille, sans commande active, réservé au Super Admin)
create or replace function plans_prevention.purge_companies(p_isis text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if p_isis is null or cardinality(p_isis) = 0 then return 0; end if;
  if exists (select 1 from plans_prevention.orders o
              where o.isis_code = any(p_isis) and o.trashed_at is null) then
    raise exception 'Une ou plusieurs entreprises ont encore des commandes actives';
  end if;

  update plans_prevention.companies
     set purged_at = now(), purged_by = auth.uid(), updated_at = now()
   where isis_code = any(p_isis) and trashed_at is not null and purged_at is null;
  get diagnostics n = row_count;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'COMPANIES_PURGED', 'companies', null,
          jsonb_build_object('count', n, 'companies', p_isis));
  return n;
end $$;

revoke execute on function plans_prevention.purge_companies(text[]) from public, anon;
grant execute on function plans_prevention.purge_companies(text[]) to authenticated;

-- 6. Entreprises candidates à la corbeille : aucune commande active rattachée.
create or replace function plans_prevention.company_trash_candidates()
returns table (isis_code text, name text, orders_total integer)
language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  return query
    select c.isis_code, c.name,
           (select count(*)::integer from plans_prevention.orders o where o.isis_code = c.isis_code) as orders_total
      from plans_prevention.companies c
     where c.trashed_at is null
       and not exists (select 1 from plans_prevention.orders o
                        where o.isis_code = c.isis_code and o.trashed_at is null)
     order by c.name nulls last, c.isis_code;
end $$;

revoke execute on function plans_prevention.company_trash_candidates() from public, anon;
grant execute on function plans_prevention.company_trash_candidates() to authenticated;

-- 7. Bandeau : retirer un message (il n'est jamais effacé, il est marqué retiré)
create or replace function plans_prevention.remove_site_banner(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  update plans_prevention.site_banners
     set removed_at = now(), removed_by = auth.uid(), active = false, updated_at = now()
   where id = p_id and removed_at is null;
  if not found then raise exception 'Message introuvable ou déjà retiré'; end if;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SITE_BANNER_REMOVED', 'site_banners', p_id::text, '{}'::jsonb);
end $$;

revoke execute on function plans_prevention.remove_site_banner(uuid) from public, anon;
grant execute on function plans_prevention.remove_site_banner(uuid) to authenticated;
