# ARCHITECTURE TECHNIQUE

Stack : React 19, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Router/Query, Zod, Supabase PostgreSQL/Auth/Storage/RLS, déploiement Railway compatible.

## Principes
- Commande = objet métier principal.
- Excel = source historisée, pas la base.
- Super Admin = seul importeur global.
- Une commande peut avoir plusieurs corps d'état.
- Qualification automatique puis validation manuelle si ambiguë.
- Propriétaire métier ≠ auteur réel de l'action.
- PDF piloté par modèle versionné.
- V1 mailto, portail entreprise V2.

## Tables clés
orders, companies, company_contacts, company_os_contacts, order_reconciliation, order_trades, trade_catalog, nature_catalog, risk_catalog, measure_catalog, nature_risk_rules, nature_measure_rules, prevention_plans, prevention_plan_risks, prevention_plan_measures, delegation_permissions, email_templates, plan_templates, plan_template_versions, plan_template_blocks, imports, import_rows, workflow_events, notifications, audit_logs, archive_records.

## Rapprochement
`order_reconciliation`: order_id, tracking_import_id, match_status, confidence, manually_confirmed, confirmed_by, confirmed_at.
Statuts : MATCHED, NOT_FOUND, MULTIPLE_MATCH, MANUAL_CLASSIFICATION, NEEDS_REVIEW.

## Alertes
Entreprise : MISSING_COMPANY_NAME, MISSING_OS_EMAIL, MISSING_OS_CONTACT, MISSING_ADDRESS.
Commande : NOT_IN_BUDGET_TRACKING, MISSING_TRADE, MULTIPLE_TRADE_CANDIDATES.

## Corps d'état
`trade_catalog` + `order_trades`. Source/confidence/confirmation manuelle.

## Contacts OS
`company_contacts` + `company_os_contacts`. Plusieurs contacts autorisés ; un contact OS par défaut.

## Filtre temps
order_date : LAST_7_DAYS, LAST_30_DAYS, CUSTOM.

## RLS
CHARGE_OPERATIONS : ses commandes + délégations.
RESPONSABLE : global métier.
SUPER_ADMIN : global.

## Audit
actor_user_id, subject_user_id, entity_type, entity_id, action, before, after, created_at.

## Modèle PDF
JSON structuré validé Zod, versionné, aucun code arbitraire. Preview et export utilisent le même moteur.

## Multi-lignes
COMN_NUM vide : conserver source, ne pas hériter implicitement.


## PHASE 0 OBLIGATOIRE — RÉCONCILIATION

Consulter `docs/PHASE_0_RECONCILIATION.md` et `reference/MAPPING_IMPORTS.xlsx` avant toute migration métier. La source commandes est maître. Le suivi budgétaire est secondaire et sert au rapprochement/qualification.


## Architecture V6 — périmètre de commandes

Ajouter les tables/configurations :

- `command_scope_rules`
- `command_scope_rule_values`
- `order_import_rows`
- `order_scope_status`

Une ligne source importée doit conserver son état de périmètre.

Exemple :
`scope_status = IN_SCOPE | OUT_OF_SCOPE`

La règle active peut être basée sur :
- `NAAC_CODE`
- autres champs futurs configurables.

Le Super Admin peut activer une liste blanche GT/GE/CP sans supprimer les commandes hors périmètre.

## Corps d'état

Ne pas mettre un seul `trade_id` dans `orders`.
Utiliser :
`order_trades`

Une commande peut avoir N corps d'état.

Conserver :
`source = BUDGET_TRACKING | INTC_MAPPING | AUTO_ANALYSIS | MANUAL`

et :
`confidence_score`.

## Entreprises / OS

Utiliser :
`companies`
`company_contacts`
`company_addresses`

Une entreprise peut avoir N contacts et N adresses.
Une ou plusieurs adresses peuvent être marquées comme contacts/adresses OS par défaut.

## Commandes vs lignes import

Une commande est identifiée par `COMN_NUM`.
Les lignes source doivent rester disponibles dans `order_import_rows` pour audit et réconciliation.

Le suivi budgétaire est une source de contrôle et de qualification, pas une source maître.
