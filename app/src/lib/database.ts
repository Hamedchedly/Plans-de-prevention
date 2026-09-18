// Database types and helpers for Plans de Prévention V6

export type UserProfile = {
  user_id: string
  heritage_code: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  function: string | null
  signature_storage_path: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type Company = {
  id: string
  code_isis: string
  name: string | null
  address: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type CompanyContact = {
  id: string
  company_id: string
  first_name: string | null
  last_name: string | null
  role: string | null
  email: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type Trade = {
  id: string
  code: string
  name: string
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type Order = {
  id: string
  order_number: string
  heritage_code: string | null
  sector_id: string | null
  intervention_code: string | null
  budget_line_year: string | null
  owner_user_id: string | null
  company_id: string | null
  order_date: string | null
  budget_nature: string | null
  cf_code: string | null
  analytic_account: string | null
  source_status: string | null
  amount_ttc: number | null
  amount_reconciled: number | null
  amount_gap: number | null
  tranche_name: string | null
  site_address: string | null
  site_city_zip: string | null
  work_nature: string | null
  work_description: string | null
  tracking_match_status: string
  qualification_status: string
  scope_status: string
  source_import_id: string | null
  created_at: string
  updated_at: string
}

export type OrderTrade = {
  id: string
  order_id: string
  trade_id: string
  source: string
  confidence_score: number | null
  selected_by: string | null
  selected_at: string | null
  created_at: string
}

export type PreventionPlan = {
  id: string
  order_id: string
  template_version_id: string | null
  status: string
  intervention_start: string | null
  intervention_end: string | null
  drafted_by: string | null
  validated_by: string | null
  sent_at: string | null
  received_at: string | null
  created_at: string
  updated_at: string
}

// Table names with prefix
export const TABLES = {
  USER_PROFILES: 'pp_user_profiles',
  COMPANIES: 'pp_companies',
  COMPANY_CONTACTS: 'pp_company_contacts',
  COMPANY_OS_CONTACTS: 'pp_company_os_contacts',
  TRADES: 'pp_trades',
  NATURE_CATALOG: 'pp_nature_catalog',
  RISK_CATALOG: 'pp_risk_catalog',
  MEASURE_CATALOG: 'pp_measure_catalog',
  ORDERS: 'pp_orders',
  ORDER_TRADES: 'pp_order_trades',
  ORDER_RECONCILIATION: 'pp_order_reconciliation',
  PREVENTION_PLANS: 'pp_prevention_plans',
  PREVENTION_PLAN_RISKS: 'pp_prevention_plan_risks',
  PREVENTION_PLAN_MEASURES: 'pp_prevention_plan_measures',
  COMMAND_SCOPE_RULES: 'pp_command_scope_rules',
  COMMAND_SCOPE_RULE_VALUES: 'pp_command_scope_rule_values',
  EMAIL_TEMPLATES: 'pp_email_templates',
  PLAN_TEMPLATES: 'pp_plan_templates',
  PLAN_TEMPLATE_VERSIONS: 'pp_plan_template_versions',
  AUDIT_LOGS: 'pp_audit_logs',
  NOTIFICATIONS: 'pp_notifications',
  WORKFLOW_EVENTS: 'pp_workflow_events',
  IMPORTS: 'pp_imports',
  DELEGATION_PERMISSIONS: 'pp_delegation_permissions',
  ARCHIVE_RECORDS: 'pp_archive_records',
} as const
