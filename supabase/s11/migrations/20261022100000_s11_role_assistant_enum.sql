-- Rôle Assistant : lecture de toutes les fiches et envoi aux entreprises, sans création ni modification de fiche.
alter type plans_prevention.app_role add value if not exists 'ASSISTANT';
