-- Archivage par période pour un ou plusieurs chargés.
-- Une commande archivée par période reste visible, mais n'est plus comptée dans les KPIs (kpi_excluded).

alter table plans_prevention.orders add column if not exists kpi_excluded boolean not null default false;

-- Prévisualisation (p_dry_run = true) ou archivage effectif (p_dry_run = false).
-- p_operators vide ou nul = tous les chargés.
create or replace function plans_prevention.archive_orders_by_period(
  p_from date, p_to date, p_operators text[], p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ops text[] := case when cardinality(coalesce(p_operators, '{}'::text[])) = 0 then null else p_operators end;
  v_result jsonb;
  v_count int;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'Période invalide'; end if;

  select jsonb_build_object(
    'dry_run', coalesce(p_dry_run, true),
    'total', (select count(*) from plans_prevention.orders o
               where o.trashed_at is null and not o.kpi_excluded
                 and o.order_date between p_from and p_to
                 and (v_ops is null or o.operator_code = any(v_ops))),
    'par_charge', (select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'n', c.n) order by c.code), '[]'::jsonb)
                     from (select o.operator_code as code, count(*) as n
                             from plans_prevention.orders o
                            where o.trashed_at is null and not o.kpi_excluded
                              and o.order_date between p_from and p_to
                              and (v_ops is null or o.operator_code = any(v_ops))
                            group by o.operator_code) c)
  ) into v_result;

  if coalesce(p_dry_run, true) then
    return v_result;
  end if;

  update plans_prevention.orders o
     set kpi_excluded = true,
         plan_status = 'ARCHIVEE',
         archive_reason = 'MANUEL',
         updated_at = now()
   where o.trashed_at is null and not o.kpi_excluded
     and o.order_date between p_from and p_to
     and (v_ops is null or o.operator_code = any(v_ops));
  get diagnostics v_count = row_count;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDERS_ARCHIVED_PERIOD', 'orders', null,
          jsonb_build_object('de', p_from, 'a', p_to, 'chargés', coalesce(v_ops, array['TOUS']::text[]),
                             'nombre', v_count));

  return v_result || jsonb_build_object('archived', v_count);
end $$;

revoke execute on function plans_prevention.archive_orders_by_period(date, date, text[], boolean) from public, anon;
grant execute on function plans_prevention.archive_orders_by_period(date, date, text[], boolean) to authenticated;

-- KPIs : les commandes archivées par période sont exclues de toutes les mesures.
create or replace function plans_prevention.kpi_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  return (
    with ev as (
      select a.entity_id as order_number,
             min(a.created_at) filter (where a.action = 'PLAN_SAVED') as drafted,
             min(a.created_at) filter (where a.action = 'PLAN_STATUS_CHANGED' and a.payload->>'to' = 'EN_ATTENTE_RETOUR') as sent,
             min(a.created_at) filter (where a.action = 'PLAN_STATUS_CHANGED' and a.payload->>'to' = 'ARCHIVEE') as returned
        from plans_prevention.audit_logs a
       where a.entity = 'orders' and a.action in ('PLAN_SAVED', 'PLAN_STATUS_CHANGED')
       group by a.entity_id
    ), base as (
      select o.order_number, o.operator_code, o.scope_status, o.scope_override, o.scope_request_status, o.plan_status,
             ev.drafted, ev.sent, ev.returned
        from plans_prevention.orders o
        left join ev on ev.order_number = o.order_number
       where o.trashed_at is null and not o.kpi_excluded
    )
    select jsonb_build_object(
      'periode', jsonb_build_object('de', p_from, 'a', p_to),
      'perimetre', jsonb_build_object(
        'dans_perimetre', (select count(*) from base where scope_status = 'IN_SCOPE'),
        'hors_perimetre', (select count(*) from base where scope_status = 'OUT_OF_SCOPE'),
        'forcees', (select count(*) from base where scope_override),
        'exclusions_en_attente', (select count(*) from base where scope_request_status = 'EN_ATTENTE')),
      'statuts', (select coalesce(jsonb_object_agg(s.plan_status, s.n), '{}'::jsonb)
                    from (select plan_status, count(*) as n from base where scope_status = 'IN_SCOPE' group by 1) s),
      'fiches_creees_periode', (select count(*) from base where drafted >= p_from and drafted < p_to),
      'envoyees_periode', (select count(*) from base where sent >= p_from and sent < p_to),
      'retours_periode', (select count(*) from base where returned >= p_from and returned < p_to),
      'delai_moyen_retour_jours', (select round(avg(extract(epoch from (returned - sent)) / 86400)::numeric, 1)
                                     from base where returned is not null and sent is not null),
      'par_charge', (select coalesce(jsonb_agg(jsonb_build_object(
                        'code', c.code, 'dans_perimetre', c.dans, 'a_qualifier', c.a_qual, 'fiches', c.fiches,
                        'envoyees', c.env, 'retournees', c.ret, 'delai_jours', c.delai) order by c.code), '[]'::jsonb)
                       from (select operator_code as code,
                                    count(*) filter (where scope_status = 'IN_SCOPE') as dans,
                                    count(*) filter (where scope_status = 'IN_SCOPE' and plan_status = 'NON_QUALIFIEE') as a_qual,
                                    count(*) filter (where scope_status = 'IN_SCOPE' and plan_status <> 'NON_QUALIFIEE') as fiches,
                                    count(*) filter (where scope_status = 'IN_SCOPE' and plan_status in ('EN_ATTENTE_RETOUR', 'ARCHIVEE')) as env,
                                    count(*) filter (where scope_status = 'IN_SCOPE' and plan_status = 'ARCHIVEE') as ret,
                                    round(avg(extract(epoch from (returned - sent)) / 86400) filter (where returned is not null and sent is not null)::numeric, 1) as delai
                               from base where operator_code is not null group by operator_code) c)
    )
  );
end $$;
