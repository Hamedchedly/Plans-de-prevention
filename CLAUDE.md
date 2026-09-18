# CLAUDE.md — Plans de Prévention V6

**Application:** Internal Prevention Plan Management System  
**Status:** Phase 0 Complete - Ready for Phase 1 Implementation  
**Branch:** `claude/prevention-plans-app-v6-liv6ji`  

## Overview

Internal French application for managing construction/maintenance prevention plans. Workflow: Excel imports → qualification → company/contact enrichment → risk assessment → PDF generation → operator approval → archive.

Master reference: **PHASE_0_ANALYSIS_COMPLETE.md**

## Quick Start

```bash
# Clone and setup
git clone <repo> && cd Plans-de-prevention
git checkout claude/prevention-plans-app-v6-liv6ji

# Read essential docs (5 minutes)
cat PHASE_0_ANALYSIS_COMPLETE.md
cat docs/COMPILATION_FONCTIONNALITES.md
cat docs/DATA_MODEL.md

# Reference files location
ls -la reference/  # Excel sources + referentials
ls -la analysis/   # Reconciliation stats
```

## Key Architecture Decisions

1. **Master source:** ANM_COMD_TRAV_ER (867 orders)
2. **Qualification source:** ANM_SUIVTRXSECT (budget tracking)
3. **Reconciliation:** 186 matched, 681 require manual qualification
4. **Multi-trade support:** One order → multiple corps d'état
5. **Scope filtering:** V6 feature - orders can be marked OUT_OF_SCOPE, never deleted
6. **Data integrity:** All source imports preserved, audit trail mandatory
7. **PDF:** Template-driven (structured blocks, no code)
8. **V1 constraints:** mailto only, no company portal, no automated risk validation

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **State:** TanStack Router + TanStack Query
- **Backend:** Supabase PostgreSQL + Auth + Storage
- **Validation:** Zod
- **Deployment:** Railway

## Database Schema

**Locked architecture** - see `docs/DATA_MODEL.md` for complete schema.

Core tables:
- `orders` - master entity with scope_status, qualification_status
- `order_trades` - multi-trade association (source, confidence_score)
- `order_reconciliation` - budget tracking match status
- `companies`, `company_contacts`, `company_os_contacts` - company data
- `trades`, `nature_catalog`, `risk_catalog`, `measure_catalog` - reference data
- `prevention_plans`, `prevention_plan_risks`, `prevention_plan_measures` - plan data
- `command_scope_rules`, `command_scope_rule_values` - V6 filtering
- `audit_logs`, `workflow_events`, `notifications` - audit trail
- `email_templates`, `plan_templates`, `plan_template_versions` - templates
- `delegation_permissions`, `archive_records` - workflow

## Critical Implementation Rules

✓ Never delete imported orders - mark OUT_OF_SCOPE instead  
✓ One order can have multiple trades (order_trades table)  
✓ Budget tracking is NOT the master source - qualification tool  
✓ Audit trail mandatory for all mutations (actor_user_id, subject_user_id)  
✓ Template-driven PDF with no arbitrary code execution  
✓ RLS policies enforce role-based access control  
✓ Always distinguish propriétaire métier vs auteur réel  

## Development Workflow

### Before starting each phase:
1. Read phase documentation in `docs/PHASE_*_RECONCILIATION.md`
2. Check `PHASE_0_ANALYSIS_COMPLETE.md` for context
3. Verify schema against locked architecture
4. Run migrations on test database

### Features cannot cross phases without Phase 0 review

The following features are locked pending Phase 0:
- ✓ Multi-trade support per order
- ✓ Scope filtering (IN_SCOPE/OUT_OF_SCOPE)
- ✓ Reconciliation matching
- ✓ Company contact OS mapping

## Phase Breakdown

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 0 | Analysis & Schema | ✓ COMPLETE |
| Phase 1 | Supabase + React Setup | → TODO |
| Phase 2 | Import & Filtering | → TODO |
| Phase 3 | Company Management | → TODO |
| Phase 4 | Dashboard & UI | → TODO |
| Phase 5 | Trade Qualification | → TODO |
| Phase 6 | Plan Creation | → TODO |
| Phase 7 | Risk/Measure Analysis | → TODO |
| Phase 8 | PDF & Preview | → TODO |
| Phase 9 | Email & mailto | → TODO |
| Phase 10 | Send/Receive Workflow | → TODO |
| Phase 11 | Delegation | → TODO |
| Phase 12 | Archive | → TODO |
| Phase 13 | Audit UI | → TODO |
| Phase 14 | Super Admin | → TODO |

## Reference Files

**Data Sources:**
- `reference/ANM_COMD_TRAV_ER_6.xlsx` - Master orders (867 rows)
- `reference/ANM_SUIVTRXSECT_7.xlsx` - Budget tracking (1,379 rows)
- `reference/REFERENTIEL_CORPS_ETAT.xlsx` - Trade catalog (0100-0829)
- `reference/REFERENTIEL_RISQUES_PLANS_PREVENTION.xlsx` - Risk/Measure (14+27)
- `reference/PLAN_DE_PREVENTION.xlsx` - PDF template example

**Documentation:**
- `PHASE_0_ANALYSIS_COMPLETE.md` - Full reconciliation results (THIS IS THE MASTER)
- `docs/COMPILATION_FONCTIONNALITES.md` - Feature list (28 features)
- `docs/CAHIER_DES_CHARGES.md` - Detailed requirements
- `docs/DATA_MODEL.md` - Database schema
- `docs/ARCHITECTURE.md` - Technical decisions
- `docs/PHASE_0_RECONCILIATION.md` - Reconciliation details

**Analysis:**
- `analysis/RECONCILIATION_STATS.json` - Metrics

## Important Notes

### Orders & Qualifications
- 681 orders (78%) don't exist in budget tracking
- These go to "À QUALIFIER" tab for manual assignment
- Never delete them - mark as OUT_OF_SCOPE if needed
- Operator can select multiple trades per order

### Scope Filtering (V6)
- Super Admin configures which order types are active (e.g., GT+GE+CP)
- Configuration stored in `command_scope_rules` + `command_scope_rule_values`
- Can be changed anytime - old rules stored for audit
- Orders marked IN_SCOPE or OUT_OF_SCOPE, never deleted

### Companies
- 197 unique companies (ENTN_NUM)
- May have multiple contacts, multiple addresses
- OS contacts (default preferred) for email delivery
- Alerts if name missing or OS email missing

### Operators
- 37 operators (UTIC_CODE)
- First login: set password, profile, signature
- Can delegate to other operators
- Responsible for qualification of unmatched orders

## Bootstrap Users (Development)
```
super_admin / superadmin → Real password required on first login
user / user → Test operator
```

## Running Locally

```bash
# After Phase 1 setup
npm install
npm run dev

# Supabase local dev (if using local stack)
supabase start
supabase link

# Build for production
npm run build
npm run preview
```

## Deployment

Target: Railway (compatible with stack)

```bash
# Push to Railway
git push origin claude/prevention-plans-app-v6-liv6ji
# Railway auto-deploys on push
```

## Testing

For Phase 1+: Use provided Excel files in `reference/` for import testing.

Test data:
- Sample order: `512001` (should match budget tracking)
- Sample order: `512004` (should NOT match - goes to À QUALIFIER)
- S11 sector: 36 orders (16 unmatched for qualification testing)

## Help & References

- French terminology: Check `docs/COMPILATION_FONCTIONNALITES.md` for PAGE references
- Schema questions: See locked architecture in `docs/DATA_MODEL.md`
- Feature questions: Check `PHASE_0_ANALYSIS_COMPLETE.md` feature table
- Excel source mapping: `reference/MAPPING_IMPORTS.xlsx`

## Last Updated

2026-09-18 - Phase 0 Analysis Complete

