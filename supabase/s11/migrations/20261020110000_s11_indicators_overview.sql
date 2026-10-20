-- Indicateurs d'utilisation et de suivi pour le Super Admin : connexions, fiches par semaine, stock par étape.
-- Filtre optionnel par chargé (code UTIC). Lecture seule.
create or replace function plans_prevention.indicators_overview(
  p_from timestamptz default (now() - interval '12 weeks'),
  p_to timestamptz default (now() + interval '1 day'),
  p_operator text default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  return (
    with
    users as (
      select p.user_id, p.operator_code from plans_prevention.profiles p
       where p.is_active and (p_operator is null or p.operator_code = p_operator)
    ),
    login_ev as (
      select a.actor_user_id as uid, a.created_at as at, p.operator_code
        from plans_prevention.audit_logs a
        left join plans_prevention.profiles p on p.user_id = a.actor_user_id
       where a.action = 'LOGIN' and a.created_at >= p_from and a.created_at < p_to
         and (p_operator is null or p.operator_code = p_operator)
    ),
    weeks as (
      select generate_series(date_trunc('week', p_from), date_trunc('week', p_to - interval '1 second'), interval '1 week') as wk
    ),
    login_weeks as (
      select w.wk::date as week,
             count(distinct e.uid) as users,
             count(e.uid) as logins
        from weeks w left join login_ev e on date_trunc('week', e.at) = w.wk
       group by w.wk
    ),
    login_by_op as (
      select coalesce(operator_code, '—') as operator_code, count(distinct uid) as users, count(*) as logins, max(at) as last_at
        from login_ev group by 1
    ),
    stock as (
      select o.order_number, o.operator_code, o.plan_status from plans_prevention.orders o
       where o.scope_status = 'IN_SCOPE' and o.trashed_at is null and (p_operator is null or o.operator_code = p_operator)
    ),
    fiche_ev as (
      select a.created_at as at, a.action, coalesce(a.payload->>'to', '') as to_status
        from plans_prevention.audit_logs a
       where a.entity = 'orders' and a.created_at >= p_from and a.created_at < p_to
         and (a.action = 'PLAN_SAVED' or (a.action = 'PLAN_STATUS_CHANGED' and a.payload->>'to' in ('EN_ATTENTE_RETOUR', 'SIGNEE', 'ARCHIVEE')))
         and (p_operator is null or exists (select 1 from plans_prevention.orders o where o.order_number = a.entity_id and o.operator_code = p_operator))
    ),
    fiche_weeks as (
      select w.wk::date as week,
             count(*) filter (where e.action = 'PLAN_SAVED') as creees,
             count(*) filter (where e.to_status = 'EN_ATTENTE_RETOUR') as envoyees,
             count(*) filter (where e.to_status = 'SIGNEE') as signees,
             count(*) filter (where e.to_status = 'ARCHIVEE') as archivees
        from weeks w left join fiche_ev e on date_trunc('week', e.at) = w.wk
       group by w.wk
    )
    select jsonb_build_object(
      'periode', jsonb_build_object('debut', p_from, 'fin', p_to, 'chargé', p_operator),
      'kpi', jsonb_build_object(
        'comptes_actifs', (select count(*) from users),
        'connectes', (select count(distinct uid) from login_ev where uid is not null),
        'connexions', (select count(*) from login_ev),
        'jamais_connectes', (select count(*) from users u where not exists (
            select 1 from plans_prevention.audit_logs a where a.action = 'LOGIN' and a.actor_user_id = u.user_id))
      ),
      'connexions_par_semaine', (select coalesce(jsonb_agg(jsonb_build_object('semaine', week, 'utilisateurs', users, 'connexions', logins) order by week), '[]'::jsonb) from login_weeks),
      'connexions_par_charge', (select coalesce(jsonb_agg(jsonb_build_object('code', operator_code, 'utilisateurs', users, 'connexions', logins, 'derniere', last_at) order by logins desc), '[]'::jsonb) from login_by_op),
      'fiches_par_semaine', (select coalesce(jsonb_agg(jsonb_build_object('semaine', week, 'creees', creees, 'envoyees', envoyees, 'signees', signees, 'archivees', archivees) order by week), '[]'::jsonb) from fiche_weeks),
      'stock', (select coalesce(jsonb_object_agg(plan_status, n), '{}'::jsonb) from (select plan_status, count(*) as n from stock group by 1) s),
      'stock_par_charge', (select coalesce(jsonb_agg(jsonb_build_object('code', operator_code, 'statuts', statuts) order by operator_code), '[]'::jsonb)
                             from (select operator_code, jsonb_object_agg(plan_status, n) as statuts
                                     from (select coalesce(operator_code, '—') as operator_code, plan_status, count(*) as n from stock group by 1, 2) x
                                    group by operator_code) y),
      'chargés', (select coalesce(jsonb_agg(distinct operator_code order by operator_code), '[]'::jsonb) from plans_prevention.profiles where is_active and operator_code is not null)
    )
  );
end $$;

revoke execute on function plans_prevention.indicators_overview(timestamptz, timestamptz, text) from public, anon;
grant execute on function plans_prevention.indicators_overview(timestamptz, timestamptz, text) to authenticated;
