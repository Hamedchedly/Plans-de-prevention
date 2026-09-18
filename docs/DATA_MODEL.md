# MODELE DE DONNEES CIBLE

## Identités

### users
Auth identity / rôle.

### user_profiles
Informations métier du chargé :
- user_id
- prénom
- nom
- email
- téléphone
- fonction
- signature
- code métier
- actif

## Entreprises

### companies
- id
- isis_code
- name
- address
- active

### company_contacts
- id
- company_id
- first_name
- last_name
- role
- email
- phone
- active

### company_addresses
- id
- company_id
- address
- city
- postal_code
- type
- is_os_default
- active

## Commandes

### orders
- id
- order_number
- order_date
- patrimony_code
- sector_id
- intervention_code
- budget_line
- budget_type
- cf
- analytical_account
- amount_ttc
- amount_reconciled
- amount_gap
- tranche
- site_address
- site_city
- work_nature
- work_description
- owner_user_id
- company_id
- scope_status
- source_import_id

### order_trades
- order_id
- trade_id
- source
- confidence_score
- selected_by
- validated_at

## Référentiels

### trades
code, name, active

### nature_catalog
name, normalized_name, trade_id nullable, description, status

### risk_catalog
code, name, active

### measure_catalog
code, name, active

### nature_risk_rules
nature_id, risk_id, priority, active

### nature_measure_rules
nature_id, measure_id, priority, active

## Plans

### prevention_plans
- id
- order_id
- template_version_id
- status
- intervention_start
- intervention_end
- drafted_by
- validated_by
- sent_at
- received_at

### prevention_plan_risks
plan_id, risk_id, selected, source

### prevention_plan_measures
plan_id, measure_id, selected, source

## Workflow

### workflow_events
plan_id, action, actor_user_id, subject_user_id, metadata, created_at

### notifications
recipient_user_id, type, title, body, read_at

### archive_records
entity_type, entity_id, archived_by, archived_at, reason

## Administration

### email_templates
type, subject_template, body_template, version, active

### plan_templates
name, active

### plan_template_versions
template_id, version, status, definition_json, created_by

### plan_template_blocks
optionnel si blocs normalisés ; sinon intégrés dans definition_json

### command_scope_rules
- name
- active
- field_name
- mode INCLUDE/EXCLUDE
- created_by

### command_scope_rule_values
- rule_id
- value

### delegation_permissions
- delegate_user_id
- target_user_id
- can_read
- can_edit
- can_send
- start_at
- end_at
- active

### imports
- filename
- source_type
- imported_by
- imported_at
- row_count
- created_count
- updated_count
- error_count

### audit_logs
- actor_user_id
- subject_user_id
- entity_type
- entity_id
- action
- before_json
- after_json
- created_at
