-- Termes de lots gérables par le Super Admin.
-- On ne retire jamais un terme : on le désactive (active = false), ce qui garde l'historique.

alter table plans_prevention.lot_terms add column if not exists active boolean not null default true;

create or replace function plans_prevention.set_lot_term(p_term text, p_lot int, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_term text := lower(trim(coalesce(p_term, '')));
  v_active boolean := coalesce(p_active, true);
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if v_term = '' then raise exception 'Terme vide'; end if;
  if not exists (select 1 from plans_prevention.lots l where l.code = p_lot) then raise exception 'Lot inconnu'; end if;

  insert into plans_prevention.lot_terms (term, lot_code, active)
  values (v_term, p_lot, v_active)
  on conflict (term, lot_code) do update set active = excluded.active;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'LOT_TERM_SET', 'lot_terms', v_term || ' -> ' || p_lot,
          jsonb_build_object('term', v_term, 'lot', p_lot, 'active', v_active));
end $$;

revoke execute on function plans_prevention.set_lot_term(text, int, boolean) from public, anon;
grant execute on function plans_prevention.set_lot_term(text, int, boolean) to authenticated;
