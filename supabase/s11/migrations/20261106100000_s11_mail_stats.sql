-- Mail collectif : par chargé, plans réalisés sur une année et reste à faire.
-- Lecture seule ; périmètre et règles identiques aux indicateurs (commandes IN_SCOPE, hors corbeille et archivées).
-- Réalisé = fiche créée, envoyée ou signée ; reste à faire = commande encore sans plan (à qualifier).

create or replace function plans_prevention.communication_stats(p_year int)
returns table (operator_code text, realises int, reste int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not plans_prevention.is_manager() then raise exception 'Réservé au Responsable ou au Super Admin'; end if;
  return query
    select coalesce(o.operator_code, '—'),
           (count(*) filter (where o.plan_status in ('A_ENVOYER', 'EN_ATTENTE_RETOUR', 'SIGNEE')))::int,
           (count(*) filter (where o.plan_status = 'NON_QUALIFIEE'))::int
      from plans_prevention.orders o
     where o.scope_status = 'IN_SCOPE' and o.trashed_at is null and o.kpi_excluded = false
       and o.order_date >= make_date(p_year, 1, 1) and o.order_date < make_date(p_year + 1, 1, 1)
     group by 1;
end $$;

revoke execute on function plans_prevention.communication_stats(int) from public, anon;
grant execute on function plans_prevention.communication_stats(int) to authenticated;

-- Modèle par défaut : ajoute le récapitulatif (sans effacer un modèle déjà personnalisé qui le contient).
update plans_prevention.communication_templates
   set body = $body$Bonjour {prenom},

Le fichier « {fichier} » a été importé le {date}.

Récapitulatif par chargé :
{recap}

Cordialement,
{redacteur}$body$
 where name = 'Nouvelles commandes après import' and body not like '%{recap}%';
