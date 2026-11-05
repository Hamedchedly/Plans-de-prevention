-- Bandeau d'information tout en haut du site : messages configurés par les responsables.
-- Un message n'est jamais supprimé : on le masque (active = false).

create table if not exists plans_prevention.site_banners (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(trim(message)) > 0),
  active boolean not null default true,
  position int not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table plans_prevention.site_banners enable row level security;

drop policy if exists site_banners_select on plans_prevention.site_banners;
create policy site_banners_select on plans_prevention.site_banners for select to authenticated
  using (plans_prevention.is_active_user());

grant select on plans_prevention.site_banners to authenticated;

-- Création (p_id nul) ou modification d'un message, par un Responsable ou le Super Admin.
create or replace function plans_prevention.save_site_banner(p_id uuid, p_message text, p_active boolean, p_position int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := p_id;
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  if nullif(trim(coalesce(p_message, '')), '') is null then raise exception 'Message vide'; end if;

  if v_id is null then
    insert into plans_prevention.site_banners (message, active, position, updated_by)
    values (trim(p_message), coalesce(p_active, true), greatest(coalesce(p_position, 1), 1), auth.uid())
    returning id into v_id;
  else
    update plans_prevention.site_banners
       set message = trim(p_message), active = coalesce(p_active, true),
           position = greatest(coalesce(p_position, 1), 1), updated_by = auth.uid(), updated_at = now()
     where id = v_id;
    if not found then raise exception 'Message introuvable'; end if;
  end if;

  insert into plans_prevention.audit_logs (actor_user_id, action, entity, entity_id, payload)
  values (auth.uid(), 'SITE_BANNER_SAVED', 'site_banners', v_id::text,
          jsonb_build_object('message', trim(p_message), 'actif', coalesce(p_active, true)));
  return v_id;
end $$;

revoke execute on function plans_prevention.save_site_banner(uuid, text, boolean, int) from public, anon;
grant execute on function plans_prevention.save_site_banner(uuid, text, boolean, int) to authenticated;
