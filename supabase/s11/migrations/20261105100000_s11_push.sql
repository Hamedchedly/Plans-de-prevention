-- Notifications navigateur, même site fermé : abonnements par appareil (Web Push).
-- L'envoi lui-même est fait par la fonction Edge « push-notify » (clés VAPID dans les secrets).

alter table plans_prevention.notifications add column if not exists pushed_at timestamptz;

create table if not exists plans_prevention.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table plans_prevention.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on plans_prevention.push_subscriptions;
create policy push_subscriptions_select on plans_prevention.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

grant select on plans_prevention.push_subscriptions to authenticated;

-- Enregistre l'abonnement de l'appareil courant pour l'utilisateur connecté.
create or replace function plans_prevention.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not plans_prevention.is_active_user() then raise exception 'Compte inactif'; end if;
  if nullif(trim(coalesce(p_endpoint, '')), '') is null
     or nullif(trim(coalesce(p_p256dh, '')), '') is null
     or nullif(trim(coalesce(p_auth, '')), '') is null then
    raise exception 'Abonnement incomplet';
  end if;
  insert into plans_prevention.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, revoked_at = null;
end $$;

-- Désactive l'abonnement de l'appareil courant (sans supprimer la ligne).
create or replace function plans_prevention.revoke_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  update plans_prevention.push_subscriptions
     set revoked_at = now()
   where endpoint = p_endpoint and user_id = auth.uid();
end $$;

revoke execute on function plans_prevention.save_push_subscription(text, text, text) from public, anon;
revoke execute on function plans_prevention.revoke_push_subscription(text) from public, anon;
grant execute on function plans_prevention.save_push_subscription(text, text, text) to authenticated;
grant execute on function plans_prevention.revoke_push_subscription(text) to authenticated;
