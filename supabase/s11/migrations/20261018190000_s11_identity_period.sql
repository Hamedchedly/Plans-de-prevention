-- Identité des utilisateurs (renseignée par chacun, modifiable par le Super Admin) et période d'intervention des fiches.

alter table plans_prevention.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists contact_email text;

alter table plans_prevention.orders
  add column if not exists period_start date,
  add column if not exists period_end date;

create or replace function plans_prevention.update_profile_identity(p_user_id uuid, p_first text, p_last text, p_phone text, p_contact_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_first text := nullif(trim(coalesce(p_first, '')), ''); v_last text := nullif(trim(coalesce(p_last, '')), '');
begin
  if not plans_prevention.is_active_user() then raise exception 'Accès refusé'; end if;
  if p_user_id <> auth.uid() and not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  update plans_prevention.profiles
     set first_name = v_first,
         last_name = v_last,
         full_name = trim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')),
         phone = nullif(trim(coalesce(p_phone, '')), ''),
         contact_email = nullif(trim(coalesce(p_contact_email, '')), ''),
         updated_at = now()
   where user_id = p_user_id;
  insert into plans_prevention.audit_logs(actor_user_id, subject_user_id, action, entity, entity_id, payload)
  values (auth.uid(), p_user_id, 'PROFILE_IDENTITY_UPDATED', 'profiles', p_user_id::text, jsonb_build_object('by_admin', p_user_id <> auth.uid()));
end $$;

create or replace function plans_prevention.set_plan_period(p_order text, p_start date, p_end date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_op text;
begin
  select plan_status, operator_code into v_status, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or v_op = plans_prevention.current_operator()) then raise exception 'Accès refusé'; end if;
  if v_status not in ('NON_QUALIFIEE', 'A_ENVOYER') then raise exception 'Plan verrouillé (statut %)', v_status; end if;
  if p_start is not null and p_end is not null and p_end < p_start then raise exception 'La fin est antérieure au début'; end if;
  update plans_prevention.orders set period_start = p_start, period_end = p_end, updated_at = now() where order_number = p_order;
end $$;

revoke execute on function plans_prevention.update_profile_identity(uuid,text,text,text,text) from public, anon;
revoke execute on function plans_prevention.set_plan_period(text,date,date) from public, anon;
grant execute on function plans_prevention.update_profile_identity(uuid,text,text,text,text) to authenticated;
grant execute on function plans_prevention.set_plan_period(text,date,date) to authenticated;
