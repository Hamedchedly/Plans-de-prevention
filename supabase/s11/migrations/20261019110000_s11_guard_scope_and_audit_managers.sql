-- Audit 2026-10-19 : ces deux fonctions modifient les commandes en masse ; réservées aux responsables (utilisées seulement par l'import).
create or replace function plans_prevention.apply_scope_rules()
returns integer language plpgsql security definer set search_path = '' as $function$
declare n int; v_include text[]; v_exclude text[]; v_has_include boolean; v_has_exclude boolean;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  select coalesce(array_agg(distinct v), '{}'), count(*) > 0 into v_include, v_has_include
    from plans_prevention.scope_rules r, unnest(r.values) v where r.active and r.mode = 'INCLUDE';
  select coalesce(array_agg(distinct v), '{}'), count(*) > 0 into v_exclude, v_has_exclude
    from plans_prevention.scope_rules r, unnest(r.values) v where r.active and r.mode = 'EXCLUDE';
  update plans_prevention.orders o
     set scope_status = case
       when v_has_include then (case when o.naac_code = any(v_include) then 'IN_SCOPE' else 'OUT_OF_SCOPE' end)
       when v_has_exclude then (case when o.naac_code = any(v_exclude) then 'OUT_OF_SCOPE' else 'IN_SCOPE' end)
       else 'IN_SCOPE' end,
         updated_at = now()
   where not o.scope_override;
  get diagnostics n = row_count;
  return n;
end $function$;

create or replace function plans_prevention.apply_order_audit()
returns integer language plpgsql security definer set search_path = '' as $function$
declare n int;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  update plans_prevention.orders o
     set plan_status = case a.audit_status when 'ENVOYE' then 'EN_ATTENTE_RETOUR' when 'SIGNE' then 'SIGNEE' end,
         updated_at = now()
    from plans_prevention.order_audit a
   where a.order_number = o.order_number
     and a.audit_status in ('ENVOYE', 'SIGNE')
     and o.plan_status in ('NON_QUALIFIEE', 'A_ENVOYER');
  get diagnostics n = row_count;
  return n;
end $function$;

revoke execute on function plans_prevention.apply_scope_rules() from public, anon;
revoke execute on function plans_prevention.apply_order_audit() from public, anon;
