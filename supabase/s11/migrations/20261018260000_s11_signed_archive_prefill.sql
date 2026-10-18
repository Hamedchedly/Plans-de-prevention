-- Statut « Signée » (catégorie avant archivage), motif d'archivage, archivage automatique à 6 mois,
-- audit importé (statuts des commandes auditées), pré-remplissage des chargés sans compte.

-- 1. Statut SIGNEE et motif d'archivage
alter table plans_prevention.orders drop constraint if exists orders_plan_status_check;
alter table plans_prevention.orders add constraint orders_plan_status_check
  check (plan_status in ('NON_QUALIFIEE', 'A_ENVOYER', 'EN_ATTENTE_RETOUR', 'SIGNEE', 'ARCHIVEE', 'ENVOYE_MANUELLEMENT'));
alter table plans_prevention.orders add column if not exists archive_reason text
  check (archive_reason in ('MANUEL', 'OBSOLETE', 'ENVOI_SANS_RETOUR', 'SIGNEE_6_MOIS'));

-- 2. Transitions : retour reçu = signée ; signée archivée à la main ; archivage manuel depuis l'attente de retour
create or replace function plans_prevention.advance_plan_status(p_order text, p_to text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from text; v_op text;
begin
  select plan_status, operator_code into v_from, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or v_op = plans_prevention.current_operator()) then raise exception 'Accès refusé'; end if;
  if not (
    (v_from = 'A_ENVOYER' and p_to = 'EN_ATTENTE_RETOUR')
    or (v_from = 'EN_ATTENTE_RETOUR' and p_to = 'SIGNEE')
    or (v_from = 'EN_ATTENTE_RETOUR' and p_to = 'ARCHIVEE')
    or (v_from = 'SIGNEE' and p_to = 'ARCHIVEE')
  ) then
    raise exception 'Transition interdite : % vers %', v_from, p_to;
  end if;
  update plans_prevention.orders
     set plan_status = p_to,
         archive_reason = case when p_to = 'ARCHIVEE' then 'MANUEL' else null end,
         updated_at = now()
   where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PLAN_STATUS_CHANGED', 'orders', p_order, jsonb_build_object('from', v_from, 'to', p_to));
end $$;

-- 3. Archivage automatique à 6 mois après la date de commande (appelé à l'ouverture du tableau de bord)
create or replace function plans_prevention.auto_archive_plans()
returns int language plpgsql security definer set search_path = '' as $$
declare n int := 0; r int;
begin
  update plans_prevention.orders set plan_status = 'ARCHIVEE', archive_reason = 'OBSOLETE', updated_at = now()
   where plan_status in ('NON_QUALIFIEE', 'A_ENVOYER') and scope_status = 'IN_SCOPE'
     and order_date < (current_date - interval '6 months');
  get diagnostics r = row_count; n := n + r;
  update plans_prevention.orders set plan_status = 'ARCHIVEE', archive_reason = 'ENVOI_SANS_RETOUR', updated_at = now()
   where plan_status = 'EN_ATTENTE_RETOUR' and order_date < (current_date - interval '6 months');
  get diagnostics r = row_count; n := n + r;
  update plans_prevention.orders set plan_status = 'ARCHIVEE', archive_reason = 'SIGNEE_6_MOIS', updated_at = now()
   where plan_status = 'SIGNEE' and order_date < (current_date - interval '6 months');
  get diagnostics r = row_count; n := n + r;
  return n;
end $$;
revoke execute on function plans_prevention.auto_archive_plans() from public, anon;
grant execute on function plans_prevention.auto_archive_plans() to authenticated;

-- 4. Audit importé : statut relevé par chargé, appliqué aux commandes présentes (et aux futurs imports)
create table if not exists plans_prevention.order_audit (
  order_number text primary key,
  charge_name text not null,
  audit_date date,
  comment text,
  audit_status text not null check (audit_status in ('ENVOYE', 'SIGNE', 'SANS_PLAN')),
  imported_at timestamptz not null default now()
);
alter table plans_prevention.order_audit enable row level security;
create policy order_audit_select on plans_prevention.order_audit for select to authenticated using (plans_prevention.is_active_user());
grant select on plans_prevention.order_audit to authenticated;

create or replace function plans_prevention.apply_order_audit()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update plans_prevention.orders o
     set plan_status = case a.audit_status when 'ENVOYE' then 'EN_ATTENTE_RETOUR' when 'SIGNE' then 'SIGNEE' end,
         updated_at = now()
    from plans_prevention.order_audit a
   where a.order_number = o.order_number
     and a.audit_status in ('ENVOYE', 'SIGNE')
     and o.plan_status in ('NON_QUALIFIEE', 'A_ENVOYER');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function plans_prevention.apply_order_audit() from public, anon;
grant execute on function plans_prevention.apply_order_audit() to authenticated;

-- 5. Pré-remplissage des chargés sans compte (identité, mail, suivi des invitations) : Super Admin / responsable seulement
create table if not exists plans_prevention.operator_prefills (
  operator_code text primary key,
  first_name text,
  last_name text,
  email text,
  phone text,
  invite_sent_at timestamptz,
  last_reminder_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table plans_prevention.operator_prefills enable row level security;
create policy operator_prefills_manage on plans_prevention.operator_prefills for all to authenticated
  using (plans_prevention.is_manager()) with check (plans_prevention.is_manager());
grant select, insert, update on plans_prevention.operator_prefills to authenticated;
