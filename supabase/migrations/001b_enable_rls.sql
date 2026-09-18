-- Plans de Prévention V6 - Enable RLS for additional tables
-- Migration 001b: Enable Row Level Security on tables created in 001

-- Enable RLS on remaining tables
alter table public.pp_order_reconciliation enable row level security;
alter table public.pp_trades enable row level security;
alter table public.pp_nature_catalog enable row level security;
alter table public.pp_risk_catalog enable row level security;
alter table public.pp_measure_catalog enable row level security;
alter table public.pp_command_scope_rules enable row level security;
alter table public.pp_command_scope_rule_values enable row level security;
alter table public.pp_email_templates enable row level security;
alter table public.pp_plan_templates enable row level security;
alter table public.pp_plan_template_versions enable row level security;
alter table public.pp_imports enable row level security;
alter table public.pp_workflow_events enable row level security;
