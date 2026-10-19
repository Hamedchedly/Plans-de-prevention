-- 1. Secteurs rattachés à l'utilisateur connecté (profiles.sector_codes).
create or replace function plans_prevention.current_sector_codes()
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(p.sector_codes, '{}'::text[]) from plans_prevention.profiles p
   where p.user_id = auth.uid() and p.is_active
$$;
revoke execute on function plans_prevention.current_sector_codes() from public, anon;
grant execute on function plans_prevention.current_sector_codes() to authenticated;

-- 2. Un chargé voit, en plus de ses propres commandes, celles de ses secteurs.
--    Politique additive (elle s'ajoute à orders_select, sans la remplacer).
create policy orders_select_sector on plans_prevention.orders
  for select to authenticated
  using (plans_prevention.is_active_user() and sector_code = any (plans_prevention.current_sector_codes()));

-- 3. Codes secteur et chargé visibles pour l'utilisateur (sans le contenu des commandes).
--    Security invoker : la politique RLS s'applique, le responsable voit tout, le chargé ses secteurs.
create or replace function plans_prevention.order_filter_options()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'sectors', coalesce((select jsonb_agg(s order by s) from (select distinct o.sector_code as s from plans_prevention.orders o where o.sector_code is not null) x), '[]'::jsonb),
    'operators', coalesce((select jsonb_agg(c order by c) from (select distinct o.operator_code as c from plans_prevention.orders o where o.operator_code is not null) y), '[]'::jsonb)
  )
$$;
revoke execute on function plans_prevention.order_filter_options() from public, anon;
grant execute on function plans_prevention.order_filter_options() to authenticated;
