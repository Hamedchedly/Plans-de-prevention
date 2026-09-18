# MODELE D'EXPORT PDF

Source initiale : `PLAN_DE_PREVENTION.xlsx`, feuille `FICHE DE PREVENTION`.

Champs injectés : lot/corps d'état, tâche/nature, période, commande, nature activité, personne à alerter, zone, moyens techniques, risques, mesures, rédacteur, téléphone/email, date rédaction, signature.

Le modèle initial comporte 14 familles de risques et 27 mesures, référencées dans `REFERENTIEL_RISQUES_PLANS_PREVENTION.xlsx`.

## Editeur Super Admin
Blocs : SECTION, TEXT, FIELD, CHECKBOX, RISK_TABLE, MEASURE_TABLE, TABLE, IMAGE, SIGNATURE, SPACER.
Chaque bloc : id stable, type, x/y, largeur/hauteur, source de données, condition, style.
Actions : ajouter, supprimer, dupliquer, déplacer, redimensionner, renommer, source, condition, prévisualiser, publier.
Version publiée immuable ; le PDF garde la version utilisée.

## Exigence
L'aperçu et l'export final doivent utiliser le même moteur. Le rendu doit rester fidèle au modèle initial.


## Sources de données V6

Le modèle peut consommer :
- commande ;
- entreprise ;
- contact OS ;
- chargé d'opérations ;
- corps d'état ;
- nature ;
- risques ;
- mesures ;
- secteur ;
- chantier ;
- signature.

Le moteur de template doit permettre de référencer des chemins de données, par exemple :
`order.order_number`
`order.trade_names`
`company.name`
`company.isis_code`
`company.os_contact.email`
`user.full_name`
`user.signature`
`plan.risks`
`plan.measures`

Les champs absents doivent produire un état de validation et non une erreur silencieuse.
