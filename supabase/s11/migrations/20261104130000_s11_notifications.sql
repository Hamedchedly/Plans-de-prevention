-- Notifications du site : envoyées par le Super Admin, ou automatiquement après un import.
-- Audience : TOUS (tous les utilisateurs actifs) ou CHOIX (chargés listés + responsables).

create table if not exists plans_prevention.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'MANUEL' check (kind in ('MANUEL', 'IMPORT')),
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  audience text not null check (audience in ('TOUS', 'CHOIX')),
  operator_codes text[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists plans_prevention.notification_reads (
  notification_id uuid not null references plans_prevention.notifications(id),
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create or replace function plans_prevention.notification_visible(p_audience text, p_codes text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select plans_prevention.is_active_user() and (
    p_audience = 'TOUS'
    or plans_prevention.is_manager()
    or plans_prevention.current_operator() = any(p_codes)
  )
$$;

alter table plans_prevention.notifications enable row level security;
alter table plans_prevention.notification_reads enable row level security;

drop policy if exists notifications_select on plans_prevention.notifications;
drop policy if exists notification_reads_select on plans_prevention.notification_reads;
create policy notifications_select on plans_prevention.notifications for select to authenticated
  using (plans_prevention.notification_visible(audience, operator_codes));
create policy notification_reads_select on plans_prevention.notification_reads for select to authenticated
  using (user_id = auth.uid());

grant select on plans_prevention.notifications to authenticated;
grant select on plans_prevention.notification_reads to authenticated;

-- Envoi manuel par le Super Admin.
create or replace function plans_prevention.send_notification(p_title text, p_body text, p_audience text, p_operators text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_codes text[] := coalesce(p_operators, '{}'::text[]);
begin
  if not plans_prevention.is_super_admin() then raise exception 'Réservé au Super Admin'; end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then raise exception 'Titre vide'; end if;
  if p_audience not in ('TOUS', 'CHOIX') then raise exception 'Audience inconnue'; end if;
  if p_audience = 'CHOIX' and cardinality(v_codes) = 0 then raise exception 'Aucun destinataire choisi'; end if;

  insert into plans_prevention.notifications (kind, title, body, audience, operator_codes, created_by)
  values ('MANUEL', trim(p_title), coalesce(p_body, ''), p_audience,
          case when p_audience = 'TOUS' then '{}'::text[] else v_codes end, auth.uid())
  returning id into v_id;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'NOTIFICATION_SENT', 'notifications', v_id::text,
          jsonb_build_object('titre', trim(p_title), 'audience', p_audience, 'chargés', v_codes));
  return v_id;
end $$;

-- Notification automatique après un import (responsable ou Super Admin).
create or replace function plans_prevention.notify_import(p_kind text, p_file text, p_inserted int, p_updated int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  insert into plans_prevention.notifications (kind, title, body, audience, operator_codes, created_by)
  values ('IMPORT',
          'Nouvel export importé',
          coalesce(p_kind, '') || ' · ' || coalesce(p_file, '') || ' : ' || coalesce(p_inserted, 0) || ' nouvelle(s) ligne(s), '
            || coalesce(p_updated, 0) || ' mise(s) à jour.',
          'TOUS', '{}'::text[], auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Marque comme lues les notifications visibles par l'utilisateur.
create or replace function plans_prevention.mark_notifications_read(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  insert into plans_prevention.notification_reads (notification_id, user_id)
  select n.id, auth.uid()
    from plans_prevention.notifications n
   where n.id = any(coalesce(p_ids, '{}'::uuid[]))
     and plans_prevention.notification_visible(n.audience, n.operator_codes)
  on conflict (notification_id, user_id) do nothing;
end $$;

revoke execute on function plans_prevention.notification_visible(text, text[]) from public, anon;
revoke execute on function plans_prevention.send_notification(text, text, text, text[]) from public, anon;
revoke execute on function plans_prevention.notify_import(text, text, int, int) from public, anon;
revoke execute on function plans_prevention.mark_notifications_read(uuid[]) from public, anon;
grant execute on function plans_prevention.send_notification(text, text, text, text[]) to authenticated;
grant execute on function plans_prevention.notify_import(text, text, int, int) to authenticated;
grant execute on function plans_prevention.mark_notifications_read(uuid[]) to authenticated;
