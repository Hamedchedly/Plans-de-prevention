# PHASE 0 — RÉCONCILIATION DES SOURCES ET MODÈLE DÉFINITIF

Date : 18/09/2026

## Résultats des fichiers réels

Source commandes `ANM_COMD_TRAV_ER_6.xlsx` :
- 867 lignes de commandes ;
- 867 numéros de commande uniques ;
- 37 valeurs distinctes d'ID chargé op ;
- 197 entreprises/fournisseurs ;
- 516 natures de travaux ;
- 694 descriptions distinctes ;
- date maximale de commande : 2026-09-18.

Source suivi `ANM_SUIVTRXSECT_7.xlsx` :
- 1 379 lignes ;
- 1026 numéros de commande uniques ;
- corps d'état renseigné sur une majorité des lignes ;
- certaines lignes n'ont pas de numéro de commande : elles ne doivent pas être artificiellement rattachées à une commande précédente.

Rapprochement exact par numéro de commande :
- 186 commandes de l'export commandes sont présentes dans le suivi ;
- 681 sont absentes et doivent passer dans `A_QUALIFIER`.

S11 :
- 36 commandes ;
- 20 trouvées dans le suivi ;
- 16 à qualifier.

Filtres temporels basés sur `COMD_DATE` de l'export commandes :
- 7 derniers jours : 82 commandes ;
- 30 derniers jours : 431 commandes.

## Source maître

`ANM_COMD_TRAV_ER` est la source maître de la liste des commandes.

Elle doit créer/mettre à jour les commandes sans supprimer une commande absente du suivi.

## Source de qualification

`ANM_SUIVTRXSECT` est une source secondaire de qualification/contrôle.

Elle permet notamment :
- de récupérer le corps d'état ;
- de contrôler secteur ;
- de contrôler entreprise ;
- de récupérer les dates travaux ;
- de récupérer certains éléments budgétaires ;
- de vérifier l'état des travaux.

## Commande absente du suivi

Créer un statut métier `A_QUALIFIER`.

Cette commande apparaît dans un onglet spécifique du dashboard.

Le chargé d'opérations doit pouvoir :
- rechercher un corps d'état ;
- sélectionner plusieurs corps d'état ;
- ajouter un corps d'état ;
- valider la qualification.

Une fois validée, la commande n'est plus bloquée par l'absence dans le suivi.

La qualification est mémorisée avec :
- source = `MANUAL` ;
- utilisateur ;
- date ;
- corps d'état retenus.

## Détermination automatique du corps d'état

Ordre de confiance recommandé :

1. correspondance directe de la commande dans le suivi budgétaire ;
2. table `INTC_CODE → corps d'état` ;
3. correspondance nature travaux ;
4. analyse description travaux ;
5. combinaison des signaux ;
6. choix manuel si ambigu.

Le système doit conserver :
- `trade_source` ;
- `confidence_score` ;
- `trade_candidates`.

Exemple :
`SUIVI_BUDGETAIRE / 1.00`
`RULES / 0.92`
`AI_ASSISTED / 0.71`
`MANUAL / null`

L'analyse automatique est une proposition, pas une validation réglementaire.

## Plusieurs corps d'état

Une commande peut être liée à plusieurs corps d'état.

Ne pas stocker un seul champ `orders.corps_etat`.

Créer :
`order_trades(order_id, trade_id, source, confidence_score, selected_by, selected_at)`.

## Entreprises

`ENTN_NUM` est le code métier ISIS/fournisseur.

Une entreprise possède :
- identité ;
- plusieurs contacts ;
- plusieurs adresses ;
- plusieurs contacts OS.

Créer une notion `is_default_os = true`.

Le mail de plan est envoyé par défaut à l'adresse/contact OS marqué par défaut.

Le chargé peut sélectionner un autre contact.

## Informations manquantes

Alerte sur le code ISIS si :
- nom entreprise absent ;
- aucun email OS actif ;
- aucune adresse OS par défaut.

Le nom entreprise devient le libellé principal dès qu'il est renseigné.

## Chargés d'opérations

`UTIC_CODE` est la clé métier issue de l'export commandes.

Le compte utilisateur est créé/rapproché par ce code.

Le chargé renseigne lors de sa première connexion :
- nom ;
- prénom ;
- email ;
- téléphone ;
- fonction ;
- signature.

Le Super Admin peut modifier.

## Architecture de données verrouillée

### orders
- id UUID
- order_number
- heritage_code
- sector_id
- intervention_code
- budget_line_year
- owner_user_id
- company_id
- order_date
- budget_nature
- cf_code
- analytic_account
- source_status
- amount_ttc
- amount_reconciled
- amount_gap
- tranche_name
- site_address
- site_city_zip
- work_nature
- work_description
- tracking_match_status
- qualification_status
- created_at
- updated_at

### companies
- id
- code_isis
- name
- address
- active
- created_at
- updated_at

### company_contacts
- id
- company_id
- first_name
- last_name
- role
- email
- phone
- is_active

### company_os_contacts
- id
- company_id
- contact_id
- is_default
- active_from
- active_to

### order_trades
- id
- order_id
- trade_id
- source
- confidence_score
- selected_by
- selected_at

### trades
- id
- code
- name
- active
- description

## Dashboard S11

Le dashboard doit fonctionner par propriétaire métier.

Exemple S11 :
- KPI ;
- filtres ;
- regroupement entreprise ;
- regroupement corps d'état ;
- multisélection ;
- onglets ;
- tableau de commandes.

Le tableau ne doit pas reproduire les lignes sources du suivi si plusieurs lignes représentent la même commande.

Une ligne du dashboard = une commande.

Colonnes :
- sélection ;
- n° commande ;
- date commande ;
- descriptif/nature ;
- corps d'état ;
- entreprise ;
- ISIS ;
- source corps d'état ;
- risques ;
- mesures ;
- alertes ;
- statut ;
- actions.

## KPI

Pour l'utilisateur :
- commandes sans plan ;
- plans envoyés ;
- retours reçus ;
- commandes à qualifier ;
- relances à effectuer.

Le Responsable voit les mêmes KPI sur tout le périmètre.

Le Super Admin voit les KPI globaux.

## Filtre temporel

Utiliser `COMD_DATE`.

Presets :
- toutes ;
- 7 derniers jours ;
- 30 derniers jours ;
- période personnalisée.

Ne pas utiliser `STSD_DATECOM` comme date principale de filtre car elle est incomplète.

## Référentiel corps d'état

Le référentiel initial est fourni dans :
`reference/REFERENTIEL_CORPS_ETAT.xlsx`.

Le Super Admin dispose d'une page :
`PAGE-20 — Corps d'état & sécurité`.

Elle permet de vérifier :
- nombre de natures ;
- risques ;
- mesures ;
- taux de complétude ;
- incohérences ;
- règles de correspondance.

## Principe d'évolution

Les chargés enrichissent progressivement :
- entreprises ;
- contacts ;
- natures ;
- qualifications manuelles.

Les données validées alimentent une base commune.

Le Super Admin conserve le contrôle du référentiel de risques et mesures.
