-- Workflow du plan, demandes d'exclusion et propositions de référentiel soumises à validation du Super Admin.
-- Principe : toute modification d'un utilisateur est visible immédiatement dans sa session (overlay côté app),
-- et n'est généralisée à tous qu'après approbation explicite du Super Admin.

-- 1. Statuts de la commande / du plan
alter table plans_prevention.orders
  add column if not exists plan_status text not null default 'NON_QUALIFIEE'
    check (plan_status in ('NON_QUALIFIEE','A_ENVOYER','EN_ATTENTE_RETOUR','ARCHIVEE')),
  add column if not exists nature_proposal_id bigint,
  add column if not exists scope_request_status text not null default 'AUCUNE'
    check (scope_request_status in ('AUCUNE','EN_ATTENTE','APPROUVEE','REFUSEE')),
  add column if not exists scope_request_reason text,
  add column if not exists scope_request_by uuid references auth.users(id),
  add column if not exists scope_request_at timestamptz;

update plans_prevention.orders set plan_status = 'A_ENVOYER' where qualification_status = 'QUALIFIED';
create index if not exists orders_plan_status_idx on plans_prevention.orders(plan_status);

-- 2. Propositions de référentiel (nouvelle nature, ou mise à jour de la règle d'une nature)
create table if not exists plans_prevention.referential_proposals (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('NATURE_NOUVELLE','NATURE_REGLE')),
  nature_id bigint references plans_prevention.natures(id) on delete cascade,
  payload jsonb not null,                    -- {label, lots[], risks[], measures[]}
  reason text,
  status text not null default 'EN_ATTENTE' check (status in ('EN_ATTENTE','APPROUVEE','AJUSTEE','REFUSEE')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_comment text
);
alter table plans_prevention.orders
  add constraint orders_nature_proposal_fk foreign key (nature_proposal_id)
  references plans_prevention.referential_proposals(id);

-- 3. Mesures rattachées à une nature (snapshot de la règle approuvée)
create table if not exists plans_prevention.nature_measures (
  nature_id bigint not null references plans_prevention.natures(id) on delete cascade,
  measure_code text not null references plans_prevention.measures(code),
  primary key (nature_id, measure_code)
);

alter table plans_prevention.referential_proposals enable row level security;
alter table plans_prevention.nature_measures enable row level security;

create policy referential_proposals_select on plans_prevention.referential_proposals for select to authenticated
  using (created_by = auth.uid() or plans_prevention.is_super_admin());
create policy nature_measures_select on plans_prevention.nature_measures for select to authenticated using (true);
create policy nature_measures_admin on plans_prevention.nature_measures for all to authenticated
  using (plans_prevention.is_super_admin()) with check (plans_prevention.is_super_admin());

grant select on plans_prevention.referential_proposals, plans_prevention.nature_measures to authenticated;

-- 4. Fonctions

create or replace function plans_prevention.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from plans_prevention.profiles where user_id = auth.uid() and is_active)
$$;

-- Proposition d'un utilisateur (nouvelle nature ou nouvelle règle). Ne modifie pas le référentiel commun.
create or replace function plans_prevention.propose_referential(
  p_kind text, p_nature_id bigint, p_label text, p_lots int[], p_risks text[], p_measures text[], p_reason text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not plans_prevention.is_active_user() then raise exception 'Compte inactif'; end if;
  if coalesce(array_length(p_lots, 1), 0) = 0 then raise exception 'Au moins un lot est requis'; end if;
  if p_kind = 'NATURE_NOUVELLE' then
    if nullif(trim(coalesce(p_label, '')), '') is null then raise exception 'Libellé requis'; end if;
    if exists (select 1 from plans_prevention.natures where lower(label) = lower(trim(p_label))) then
      raise exception 'Cette nature existe déjà';
    end if;
  elsif p_kind = 'NATURE_REGLE' then
    if p_nature_id is null then raise exception 'Nature requise'; end if;
  else
    raise exception 'Type de proposition inconnu';
  end if;

  insert into plans_prevention.referential_proposals(kind, nature_id, payload, reason, created_by)
  values (p_kind, p_nature_id,
    jsonb_build_object('label', trim(coalesce(p_label, '')), 'lots', to_jsonb(coalesce(p_lots, '{}'::int[])),
      'risks', to_jsonb(coalesce(p_risks, '{}'::text[])), 'measures', to_jsonb(coalesce(p_measures, '{}'::text[]))),
    p_reason, auth.uid())
  returning id into v_id;

  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'REFERENTIAL_PROPOSED', 'referential_proposals', v_id::text,
    jsonb_build_object('kind', p_kind, 'nature_id', p_nature_id, 'label', p_label, 'reason', p_reason));
  return v_id;
end $$;

-- Décision du Super Admin : approuver, ajuster (payload modifié) ou refuser.
create or replace function plans_prevention.decide_referential(
  p_id bigint, p_status text, p_comment text, p_adjusted jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r plans_prevention.referential_proposals; v_nid bigint; v_payload jsonb;
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if p_status not in ('APPROUVEE','AJUSTEE','REFUSEE') then raise exception 'Décision invalide'; end if;
  select * into r from plans_prevention.referential_proposals where id = p_id for update;
  if not found or r.status <> 'EN_ATTENTE' then raise exception 'Proposition introuvable ou déjà traitée'; end if;

  if p_status = 'REFUSEE' then
    update plans_prevention.orders set nature_proposal_id = null where nature_proposal_id = p_id;
  else
    v_payload := coalesce(p_adjusted, r.payload);
    if r.kind = 'NATURE_NOUVELLE' then
      insert into plans_prevention.natures(label) values (v_payload->>'label') returning id into v_nid;
    else
      v_nid := r.nature_id;
    end if;
    delete from plans_prevention.nature_lots where nature_id = v_nid;
    delete from plans_prevention.nature_risks where nature_id = v_nid;
    delete from plans_prevention.nature_measures where nature_id = v_nid;
    insert into plans_prevention.nature_lots(nature_id, lot_code)
      select v_nid, x::int from jsonb_array_elements_text(v_payload->'lots') x;
    insert into plans_prevention.nature_risks(nature_id, risk_code)
      select v_nid, x from jsonb_array_elements_text(v_payload->'risks') x;
    insert into plans_prevention.nature_measures(nature_id, measure_code)
      select v_nid, x from jsonb_array_elements_text(v_payload->'measures') x;
    -- les plans en attente sur cette proposition pointent désormais sur la nature validée
    update plans_prevention.orders set nature_id = v_nid, nature_proposal_id = null
      where nature_proposal_id = p_id;
  end if;

  update plans_prevention.referential_proposals
     set status = p_status, decided_by = auth.uid(), decided_at = now(),
         decision_comment = p_comment, nature_id = coalesce(v_nid, nature_id)
   where id = p_id;

  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'REFERENTIAL_DECIDED', 'referential_proposals', p_id::text,
    jsonb_build_object('status', p_status, 'comment', p_comment, 'adjusted', p_adjusted is not null));
end $$;

-- Demande d'exclusion : motif obligatoire, la commande reste visible en attente de décision du Super Admin.
create or replace function plans_prevention.request_scope_exclusion(p_order text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_active_user() then raise exception 'Compte inactif'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Motif obligatoire (5 caractères minimum)'; end if;
  update plans_prevention.orders
     set scope_request_status = 'EN_ATTENTE', scope_request_reason = trim(p_reason),
         scope_request_by = auth.uid(), scope_request_at = now(), updated_at = now()
   where order_number = p_order and scope_status = 'IN_SCOPE' and scope_request_status <> 'EN_ATTENTE';
  if not found then raise exception 'Commande introuvable, déjà hors périmètre ou demande déjà en attente'; end if;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SCOPE_EXCLUSION_REQUESTED', 'orders', p_order, jsonb_build_object('reason', trim(p_reason)));
end $$;

create or replace function plans_prevention.decide_scope_exclusion(p_order text, p_approve boolean, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  update plans_prevention.orders
     set scope_status = case when p_approve then 'OUT_OF_SCOPE' else scope_status end,
         scope_override = case when p_approve then true else scope_override end,
         scope_request_status = case when p_approve then 'APPROUVEE' else 'REFUSEE' end,
         updated_at = now()
   where order_number = p_order and scope_request_status = 'EN_ATTENTE';
  if not found then raise exception 'Aucune demande en attente pour cette commande'; end if;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SCOPE_EXCLUSION_DECIDED', 'orders', p_order,
    jsonb_build_object('approved', p_approve, 'comment', p_comment));
end $$;

-- Exclusion directe interdite aux responsables : seule une décision du Super Admin peut sortir une commande.
create or replace function plans_prevention.set_order_scope(p_order text, p_scope text, p_override boolean, p_comment text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé aux responsables'; end if;
  if p_scope = 'OUT_OF_SCOPE' and not plans_prevention.is_super_admin() then
    raise exception 'Une exclusion passe par une demande validée par le Super Admin';
  end if;
  update plans_prevention.orders set scope_status = p_scope, scope_override = p_override, updated_at = now()
   where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'ORDER_SCOPE_SET', 'orders', p_order, jsonb_build_object('scope', p_scope, 'override', p_override, 'comment', p_comment));
end $$;

-- Transitions de statut : A_ENVOYER → EN_ATTENTE_RETOUR → ARCHIVEE
create or replace function plans_prevention.advance_plan_status(p_order text, p_to text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from text; v_op text;
begin
  select plan_status, operator_code into v_from, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or v_op = plans_prevention.current_operator()) then raise exception 'Accès refusé'; end if;
  if not ((v_from = 'A_ENVOYER' and p_to = 'EN_ATTENTE_RETOUR') or (v_from = 'EN_ATTENTE_RETOUR' and p_to = 'ARCHIVEE')) then
    raise exception 'Transition interdite : % vers %', v_from, p_to;
  end if;
  update plans_prevention.orders set plan_status = p_to, updated_at = now() where order_number = p_order;
  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PLAN_STATUS_CHANGED', 'orders', p_order, jsonb_build_object('from', v_from, 'to', p_to));
end $$;

-- Enregistrement atomique du plan (lots, risques, mesures, nature ou proposition en attente).
create or replace function plans_prevention.save_plan(
  p_order text, p_nature_id bigint, p_proposal_id bigint, p_lots jsonb, p_risks jsonb, p_measures jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_op text;
begin
  select plan_status, operator_code into v_status, v_op from plans_prevention.orders where order_number = p_order for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if not (plans_prevention.is_manager() or v_op = plans_prevention.current_operator()) then raise exception 'Accès refusé'; end if;
  if v_status not in ('NON_QUALIFIEE', 'A_ENVOYER') then raise exception 'Plan verrouillé (statut %)', v_status; end if;
  if p_proposal_id is not null and not exists (
       select 1 from plans_prevention.referential_proposals
        where id = p_proposal_id and status = 'EN_ATTENTE' and created_by = auth.uid()) then
    raise exception 'Proposition invalide';
  end if;

  delete from plans_prevention.order_lots where order_number = p_order;
  insert into plans_prevention.order_lots(order_number, lot_code, source, confidence, chosen_by)
    select p_order, (x->>'code')::int, x->>'source', nullif(x->>'confidence', '')::numeric, auth.uid()
      from jsonb_array_elements(coalesce(p_lots, '[]'::jsonb)) x;

  delete from plans_prevention.order_risks where order_number = p_order;
  insert into plans_prevention.order_risks(order_number, risk_code, checked, origin, updated_by)
    select p_order, x->>'code', (x->>'checked')::boolean, x->>'origin', auth.uid()
      from jsonb_array_elements(coalesce(p_risks, '[]'::jsonb)) x;

  delete from plans_prevention.order_measures where order_number = p_order;
  insert into plans_prevention.order_measures(order_number, measure_code, checked, origin, updated_by)
    select p_order, x->>'code', (x->>'checked')::boolean, x->>'origin', auth.uid()
      from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) x;

  update plans_prevention.orders
     set nature_id = case when p_proposal_id is null then p_nature_id else null end,
         nature_proposal_id = p_proposal_id,
         qualification_status = 'QUALIFIED',
         plan_status = case when plan_status = 'NON_QUALIFIEE' then 'A_ENVOYER' else plan_status end,
         updated_at = now()
   where order_number = p_order;

  insert into plans_prevention.audit_logs(actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'PLAN_SAVED', 'orders', p_order, jsonb_build_object('nature_id', p_nature_id, 'proposal_id', p_proposal_id));
end $$;

-- Droits d'exécution : uniquement les utilisateurs connectés
revoke execute on function plans_prevention.is_active_user() from public, anon;
revoke execute on function plans_prevention.propose_referential(text,bigint,text,int[],text[],text[],text) from public, anon;
revoke execute on function plans_prevention.decide_referential(bigint,text,text,jsonb) from public, anon;
revoke execute on function plans_prevention.request_scope_exclusion(text,text) from public, anon;
revoke execute on function plans_prevention.decide_scope_exclusion(text,boolean,text) from public, anon;
revoke execute on function plans_prevention.advance_plan_status(text,text) from public, anon;
revoke execute on function plans_prevention.save_plan(text,bigint,bigint,jsonb,jsonb,jsonb) from public, anon;
grant execute on function plans_prevention.is_active_user() to authenticated;
grant execute on function plans_prevention.propose_referential(text,bigint,text,int[],text[],text[],text) to authenticated;
grant execute on function plans_prevention.decide_referential(bigint,text,text,jsonb) to authenticated;
grant execute on function plans_prevention.request_scope_exclusion(text,text) to authenticated;
grant execute on function plans_prevention.decide_scope_exclusion(text,boolean,text) to authenticated;
grant execute on function plans_prevention.advance_plan_status(text,text) to authenticated;
grant execute on function plans_prevention.save_plan(text,bigint,bigint,jsonb,jsonb,jsonb) to authenticated;
