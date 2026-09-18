# PHASE 0 COMPLETE ANALYSIS — PLANS DE PRÉVENTION V6

**Date:** 18 septembre 2026  
**Status:** ✓ Reconciliation & Architecture Complete  
**Next:** Phase 1 - Infrastructure Setup

---

## EXECUTIVE SUMMARY

This is a comprehensive internal prevention plan management application for construction/maintenance orders. The application manages the complete workflow from Excel imports through qualification, risk assessment, PDF generation, and approval tracking.

### Key Facts
- **867 unique orders** from master source (ANM_COMD_TRAV_ER)
- **186 matched** in budget tracking (ANM_SUIVTRXSECT)
- **681 require manual qualification**
- **37 operational managers** (UTIC_CODE)
- **197 companies** with contact/OS email management
- **V1 scope:** Internal app only (no company portal)
- **V2 scope:** Company portal (independent, future)

### Critical Rules
✓ Never delete imported data - mark OUT_OF_SCOPE instead  
✓ One order can have multiple trades (corps d'état)  
✓ Budget tracking is qualification source, not master  
✓ Audit trail is mandatory for all mutations  
✓ Template-driven PDF with no arbitrary code  

---

## DATA RECONCILIATION RESULTS

### Orders Source (ANM_COMD_TRAV_ER_6)
| Metric | Value |
|--------|-------|
| Total unique orders | 867 |
| Operational managers | 37 |
| Companies | 197 |
| Work natures | 516 |
| Date range | up to 2026-09-18 |
| Last 7 days | 82 orders |
| Last 30 days | 431 orders |

### Budget Tracking Source (ANM_SUIVTRXSECT_7)
| Metric | Value |
|--------|-------|
| Total lines | 1,379 |
| Unique order numbers | 1,026 |
| Matched with master | 186 |
| Missing qualifications | 681 |
| S11 sector orders | 36 (20 matched, 16 need qualification) |

### Key Insight: Reconciliation Strategy
- Master source drives all order creation/updates
- Budget tracking provides trade qualification hints
- Missing budget tracking → order goes to "À QUALIFIER" tab
- Operator can manually qualify with multiple trade selection
- Never delete unmatched orders - they remain in scope

---

## TECHNICAL ARCHITECTURE

### Stack Decision
```
Frontend:     React 19 + TypeScript + Vite
Styling:      Tailwind CSS + shadcn/ui
State:        TanStack Router + TanStack Query
Validation:   Zod
Backend:      Supabase PostgreSQL + Auth + Storage
Deployment:   Railway
```

### Database Schema (Locked Architecture)

#### Core Entities
```sql
-- Orders (master entity)
orders {
  id UUID, order_number, heritage_code, sector_id, intervention_code,
  budget_line_year, owner_user_id, company_id, order_date, budget_nature,
  cf_code, analytic_account, source_status, amount_ttc, amount_reconciled,
  amount_gap, tranche_name, site_address, site_city_zip, work_nature,
  work_description, tracking_match_status, qualification_status
}

-- Multi-trade support (critical)
order_trades {
  id UUID, order_id, trade_id, source, confidence_score,
  selected_by, selected_at
}

-- Company management
companies { id, code_isis, name, address, active }
company_contacts { id, company_id, first_name, last_name, role, email, phone }
company_os_contacts { id, company_id, contact_id, is_default, active_from, active_to }

-- Reference catalogs
trades { id, code, name, active, description }
nature_catalog { id, name, trade_id nullable, description, status }
risk_catalog { id, code, name, active }
measure_catalog { id, code, name, active }

-- Rules
nature_risk_rules { nature_id, risk_id, priority, active }
nature_measure_rules { nature_id, measure_id, priority, active }

-- Reconciliation (V6)
order_reconciliation {
  id, order_id, tracking_import_id, match_status, confidence,
  manually_confirmed, confirmed_by, confirmed_at
}

-- Scope filtering (V6)
command_scope_rules {
  id, name, active, field_name, mode INCLUDE/EXCLUDE,
  created_by, created_at
}
command_scope_rule_values { id, rule_id, value }

-- Plans
prevention_plans {
  id, order_id, template_version_id, status, intervention_start,
  intervention_end, drafted_by, validated_by, sent_at, received_at
}
prevention_plan_risks { plan_id, risk_id, selected, source }
prevention_plan_measures { plan_id, measure_id, selected, source }

-- Audit & Workflow
workflow_events {
  plan_id, action, actor_user_id, subject_user_id, metadata, created_at
}
notifications {
  recipient_user_id, type, title, body, read_at, created_at
}
audit_logs {
  actor_user_id, subject_user_id, entity_type, entity_id,
  action, before_json, after_json, created_at
}

-- Admin
email_templates { type, subject_template, body_template, version, active }
plan_templates { id, name, active }
plan_template_versions {
  id, template_id, version, status, definition_json, created_by
}

-- Imports
imports {
  filename, source_type, imported_by, imported_at, row_count,
  created_count, updated_count, error_count
}

-- Delegation
delegation_permissions {
  delegate_user_id, target_user_id, can_read, can_edit, can_send,
  start_at, end_at, active
}
```

### Trade Detection Priority
When qualification source is unknown, rank signals by confidence:
1. **BUDGET_TRACKING (1.0)** - Found in ANM_SUIVTRXSECT
2. **INTC_MAPPING (0.92)** - INTC_CODE → trade lookup
3. **NATURE_MATCH (0.75)** - Work nature string match
4. **AI_ASSISTED (0.60)** - Description analysis
5. **MANUAL (null)** - User selection required

### Role-Based Access Control (RLS)
- **SUPER_ADMIN**: All data, all configurations
- **RESPONSABLE**: All orders + KPI, can act for operators, notifications on delegation
- **CHARGE_OPERATIONS**: Own orders + delegated, no substitution notifications

### Alert System
**Company Alerts:**
- MISSING_COMPANY_NAME
- MISSING_OS_EMAIL
- MISSING_OS_CONTACT
- MISSING_ADDRESS

**Order Alerts:**
- NOT_IN_BUDGET_TRACKING
- MISSING_TRADE
- MULTIPLE_TRADE_CANDIDATES

---

## FEATURE BREAKDOWN BY PHASE

### Phase 1: Infrastructure (Supabase Setup)
- [ ] Supabase project configuration
- [ ] Database schema creation (all tables)
- [ ] Auth setup with roles
- [ ] RLS policies for RBAC
- [ ] Storage for signatures

### Phase 2: Core Data Import & Filtering
- [ ] Import module (Excel → DB)
- [ ] Duplicate detection & idempotency
- [ ] Command scope filtering rules (V6)
- [ ] Command → Company mapping
- [ ] Reconciliation with budget tracking
- [ ] "À QUALIFIER" tab population

### Phase 3: Company & Contact Management
- [ ] Company CRUD
- [ ] Contact management
- [ ] OS contact assignment (default support)
- [ ] Address management
- [ ] Alert system

### Phase 4: Dashboard & Listing
- [ ] Dashboard UI framework
- [ ] KPI calculations
- [ ] Filter system (date, company, trade, sector, status)
- [ ] Multi-select actions
- [ ] Grouping options

### Phase 5: Trade Qualification
- [ ] Manual trade selection UI
- [ ] Multi-trade support for one order
- [ ] Confidence scoring display
- [ ] Source indication (BUDGET_TRACKING, MANUAL, etc.)
- [ ] "À QUALIFIER" qualification flow

### Phase 6: Prevention Plan Creation
- [ ] Plan form (trade + date period)
- [ ] Auto-prefill from order/company/contact
- [ ] Nature search and selection
- [ ] Plan UI framework

### Phase 7: Risk & Measure Analysis
- [ ] Risk catalog integration
- [ ] Measure catalog integration
- [ ] Nature → Risk/Measure rules
- [ ] Auto-proposal engine
- [ ] Manual selection UI
- [ ] Source tracking

### Phase 8: PDF Generation & Preview
- [ ] Template engine (structured blocks, no code)
- [ ] Block types: SECTION, TEXT, FIELD, CHECKBOX, RISK_TABLE, MEASURE_TABLE, TABLE, IMAGE, SIGNATURE
- [ ] Preview rendering
- [ ] PDF export
- [ ] Template versioning

### Phase 9: Email & Mailto
- [ ] Email template editor (Super Admin)
- [ ] Variable substitution engine
- [ ] Mailto link generation
- [ ] Send confirmation UI
- [ ] Signature injection into PDF

### Phase 10: Plan Workflow (Send/Receive)
- [ ] Send confirmation (manual after mailto)
- [ ] Send date tracking
- [ ] Receive confirmation
- [ ] Receive date + comment
- [ ] Resend/relance functionality

### Phase 11: Delegation & Notifications
- [ ] Delegation permissions UI
- [ ] Substitution action tracking
- [ ] Notification engine (audit events)
- [ ] Notification preferences

### Phase 12: Archive Management
- [ ] Archive criteria (date-based)
- [ ] Archive UI
- [ ] Archive retrieval
- [ ] Unarchive with permission checks

### Phase 13: Audit & Compliance
- [ ] Audit log storage
- [ ] Audit UI (view all changes)
- [ ] Activity tracking per entity
- [ ] Export capabilities

### Phase 14: Super Admin Configuration
- [ ] Users management
- [ ] Company management (Super Admin view)
- [ ] Contact management
- [ ] Command filtering rules (V6)
- [ ] Trade catalog editor
- [ ] Nature catalog editor
- [ ] Risk/Measure catalog editor
- [ ] Email template editor
- [ ] PDF template editor (structured blocks)
- [ ] Import journal

---

## REFERENCE DATA STRUCTURE

### Provided Catalogs
**Trades (0100-0829):**
- 0100: Aménagement logement
- 0101: Maçonnerie
- 0102: Réfection voirie et abords
- 0201: Etanchéité terrasse
- 0301: Menuiserie
- 0302: Serrurerie
- 0401: Revêtement sol
- 0601: Chauffage
- 0802: Ascenseur
- ... (26 total trades)

**Nature Catalog:** 516 natures from source (WNATURE)

**Risk Catalog:** 14 families + 27 measures from REFERENTIEL

---

## BOOTSTRAP CONFIGURATION

### Initial Users
```
super_admin / password123 → Create real password on first login
user / password123 → Test operator, UTIC_CODE: TEST_USER
```

### Default System Config
- Default filter: All scopes
- Default templates: Standard prevention plan template v1
- Email templates: Initial send + resend templates
- Signature: No default (operator uploads)

---

## CRITICAL IMPLEMENTATION GUIDELINES

### Data Integrity
1. ✓ Never cascade delete source import rows
2. ✓ Always preserve original values in historical columns
3. ✓ Mark scope status (IN_SCOPE/OUT_OF_SCOPE) on modification
4. ✓ Track rule application date on each order

### Audit & Traceability
1. ✓ Every mutation creates audit_log entry
2. ✓ Distinguish actor_user_id (who did it) vs subject_user_id (who it affects)
3. ✓ For delegation: notify subject if actor ≠ SUPER_ADMIN
4. ✓ Store before/after JSON for all entity changes

### UX & Workflow
1. ✓ Never auto-submit, always explicit confirmation
2. ✓ No background operations without user awareness
3. ✓ Preview/export must use identical rendering
4. ✓ Template editor: blocks only, no arbitrary code

### V1 Constraints
1. ✓ Email: mailto only (no SMTP backend)
2. ✓ No company portal (V2 independent)
3. ✓ No automatic risk/measure analysis (assistant only)
4. ✓ Manual confirmation required for send/receive

---

## DEPLOYMENT CHECKLIST

### Pre-Production
- [ ] Supabase project created (prod environment)
- [ ] RLS policies tested
- [ ] Auth configuration verified
- [ ] Storage buckets created
- [ ] Vite build tested
- [ ] Railway service created

### Go-Live
- [ ] Backup of Supabase database
- [ ] Super admin account created
- [ ] Bootstrap operators created
- [ ] Import sample Excel successful
- [ ] End-to-end workflow tested
- [ ] Audit logging verified

---

## NEXT IMMEDIATE STEPS

1. **Initialize Supabase Project** (Phase 1)
   - Create PostgreSQL database
   - Configure Auth
   - Run migrations
   - Set up RLS policies

2. **Create React + Vite App** (Phase 1)
   - `npm create vite@latest plans-prevention -- --template react-ts`
   - Install dependencies
   - Configure Tailwind + shadcn/ui
   - Set up Supabase client

3. **Implement Core Schema** (Phase 1)
   - Run migration files
   - Verify constraints
   - Test RLS enforcement

4. **Build Import Flow** (Phase 2)
   - Excel upload
   - Mapping/preview
   - Duplicate detection
   - Scope filtering integration

---

## CONCLUSION

Phase 0 is **COMPLETE**. All source files analyzed, schema locked, features prioritized. 

**Ready to begin Phase 1: Infrastructure Setup.**

The application is well-scoped, data-driven, and audit-heavy. Success depends on careful schema implementation and strict adherence to data integrity principles (never delete, always mark scope status).

