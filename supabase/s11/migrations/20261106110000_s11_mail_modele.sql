-- Modèle par défaut du mail d'import : sans nom de fichier, avec le tableau récapitulatif par chargé.
-- Ne touche que le modèle par défaut (identifié par son nom) lorsqu'il contient encore {recap}.
update plans_prevention.communication_templates
   set subject = 'Nouvelles commandes à traiter – import du {date}',
       body = $body$Bonjour {prenom},

Les nouvelles commandes ont été importées le {date}.

Récapitulatif par chargé :

{recap}

Cordialement,
{redacteur}$body$
 where name = 'Nouvelles commandes après import' and body like '%{recap}%';
