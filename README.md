# 📋 Plans de Prévention V6 — Internal Prevention Plan Management System

**Status:** Phase 0 Complete ✓ | Phase 1 Infrastructure Guide Ready 📖  
**Branch:** `claude/prevention-plans-app-v6-liv6ji`  
**Last Updated:** 2026-09-18

---

## 🎯 Project Overview

Plans de Prévention V6 is a comprehensive internal application for managing construction/maintenance prevention plans in a large housing management organization.

**Key Features:**
- Excel-based order management (867 orders from master source)
- Multi-trade order qualification (78% require manual assignment)
- Company & contact management with OS (Official Signatory) email support
- Prevention plan creation with risk/measure assessment
- PDF generation with operator signature injection
- Email workflow (mailto-based in V1)
- Full audit trail and compliance tracking
- Role-based access control (SUPER_ADMIN, RESPONSABLE, CHARGE_OPERATIONS)

**Workflow:**
```
Excel Import → Scope Filtering → Reconciliation → 
Qualification → Plan Creation → Risk Analysis → 
PDF Generation → Email → Operator Confirmation → Archive
```

---

## 📊 Data Overview

| Metric | Value |
|--------|-------|
| Total Orders (Master Source) | 867 |
| Unique Order Numbers | 867 |
| Orders Matched in Budget Tracking | 186 (21%) |
| Orders Requiring Qualification | 681 (79%) |
| Companies | 197 |
| Operational Managers | 37 |
| Work Natures | 516 |
| Trade Codes | 26 |
| Risk Categories | 14 |
| Safety Measures | 27 |

---

## 📚 Documentation Structure

### Essential Reading (In Order)
1. **PHASE_0_ANALYSIS_COMPLETE.md** ← Start here!
   - Complete data reconciliation results
   - Database schema (locked)
   - Feature breakdown by phase
   - Implementation guidelines

2. **CLAUDE.md**
   - Development guidelines
   - Architecture decisions
   - Critical implementation rules
   - Bootstrap configuration

3. **PHASE_1_INFRASTRUCTURE.md**
   - Step-by-step Supabase setup
   - Database schema creation
   - RLS policy configuration
   - React + Vite scaffold guide
   - Deployment instructions

### Detailed Specifications
- `docs/COMPILATION_FONCTIONNALITES.md` — 28 features broken down
- `docs/CAHIER_DES_CHARGES.md` — Detailed requirements
- `docs/DATA_MODEL.md` — Database schema (locked)
- `docs/ARCHITECTURE.md` — Technical decisions
- `docs/MODELE_EXPORT.md` — PDF template structure
- `docs/PHASE_0_RECONCILIATION.md` — Reconciliation details

### Reference Data
- `reference/ANM_COMD_TRAV_ER_6.xlsx` — Master orders (867 rows)
- `reference/ANM_SUIVTRXSECT_7.xlsx` — Budget tracking (1,379 rows)
- `reference/REFERENTIEL_CORPS_ETAT.xlsx` — Trade catalog
- `reference/REFERENTIEL_RISQUES_PLANS_PREVENTION.xlsx` — Risks & Measures
- `reference/PLAN_DE_PREVENTION.xlsx` — PDF template example
- `reference/MAPPING_IMPORTS.xlsx` — Column mapping guide

### Analysis Data
- `analysis/RECONCILIATION_STATS.json` — Key metrics
- `analysis/COMMANDES_A_QUALIFIER.csv` — Orders needing qualification

---

## 🏗️ Tech Stack

```
Frontend:        React 19 + TypeScript + Vite
Styling:         Tailwind CSS + shadcn/ui
State Management: TanStack Router + TanStack Query  
Backend:         Supabase PostgreSQL
Authentication:  Supabase Auth (email/password)
File Storage:    Supabase Storage
Validation:      Zod
Deployment:      Railway
```

---

## 🔑 Architecture Highlights

### Data Integrity
- **Never delete source data** — Mark as OUT_OF_SCOPE instead
- **Source preservation** — All imports stored with historical tracking
- **Scope management** — Rules can be changed anytime without data loss
- **Audit trail** — Every mutation tracked with actor vs. subject

### Multi-Trade Support
```sql
-- One order can have multiple trades
orders → order_trades → trades
-- Stores source (BUDGET_TRACKING, INTC_MAPPING, AI_ASSISTED, MANUAL)
-- Stores confidence_score (0.0-1.0)
```

### Role-Based Access Control
- **SUPER_ADMIN** → All data, all configurations
- **RESPONSABLE** → All orders + KPI, can substitute for operators
- **CHARGE_OPERATIONS** → Own orders + delegated

### Qualification Strategy
1. **BUDGET_TRACKING** (1.0) — Found in ANM_SUIVTRXSECT
2. **INTC_MAPPING** (0.92) — Intervention code → trade lookup
3. **NATURE_MATCH** (0.75) — Work nature string matching
4. **AI_ASSISTED** (0.60) — Description analysis
5. **MANUAL** (null) — User selection required

---

## 📋 Implementation Phases

### ✓ Phase 0: Analysis & Reconciliation (COMPLETE)
- Data reconciliation completed
- Schema locked
- Features prioritized
- Reference data catalogued

### → Phase 1: Infrastructure Setup (GUIDE READY)
- Supabase project creation
- Database schema migration
- RLS policy configuration
- React + Vite scaffold
- Authentication setup
- **Estimated duration:** 3-4 days

### → Phase 2: Import & Filtering
- Excel upload interface
- Column mapping
- Duplicate detection
- Scope filtering rules
- Reconciliation matching

### → Phase 3: Company Management
- Company CRUD
- Contact management
- OS email assignment
- Address management
- Alert system

### → Phase 4: Dashboard & UI
- KPI calculations
- Filter system
- Multi-select actions
- Grouping & sorting
- Onglets (tabs)

### → Phase 5: Trade Qualification
- Manual selection UI
- Multi-trade support
- Confidence display
- "À QUALIFIER" workflow

### → Phase 6: Plan Creation
- Plan form UI
- Auto-prefill from order/company
- Nature search
- Date/period selection

### → Phase 7: Risk & Measure Analysis
- Risk/Measure proposal engine
- Nature → Risk/Measure rules
- Manual selection UI
- Source tracking

### → Phase 8: PDF Generation & Preview
- Template engine (structured blocks)
- Block types: SECTION, TEXT, FIELD, CHECKBOX, RISK_TABLE, MEASURE_TABLE, TABLE, IMAGE, SIGNATURE
- Preview rendering
- PDF export

### → Phase 9: Email & Mailto
- Email template editor
- Variable substitution
- Mailto link generation
- Send confirmation

### → Phase 10: Workflow (Send/Receive/Relance)
- Send confirmation UI
- Receive confirmation
- Relance functionality

### → Phase 11-14: Advanced Features
- Delegation & substitution
- Notifications
- Archive management
- Audit UI
- Super Admin configuration

---

## 🚀 Quick Start

### Read First (5 minutes)
```bash
cat PHASE_0_ANALYSIS_COMPLETE.md
cat CLAUDE.md
```

### Phase 1: Infrastructure (3-4 days)
```bash
# Follow PHASE_1_INFRASTRUCTURE.md step-by-step
# 1. Create Supabase project
# 2. Run database migrations
# 3. Create React app
# 4. Deploy to Railway
```

### Development Workflow
```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Deploy to Railway
git push origin claude/prevention-plans-app-v6-liv6ji
```

---

## 🔐 Critical Implementation Rules

✅ **Data Integrity**
- Never cascade delete orders
- Always preserve source imports
- Mark scope status on every rule change
- Maintain complete audit trail

✅ **Business Logic**
- One order = multiple possible trades
- Budget tracking is qualification tool, not master
- Manual qualification required when ambiguous
- Distinguish actor (who did it) vs. subject (who affected)

✅ **User Experience**
- Never auto-submit → explicit confirmation always
- No background operations without awareness
- Preview = final PDF rendering (same engine)
- Operator controls signature, not system

✅ **V1 Constraints**
- Email: mailto only (no SMTP backend)
- No company portal (V2 independent)
- No automated risk validation
- Manual send/receive confirmation

---

## 👥 Bootstrap Accounts (Development)

```
super_admin / password → SUPER_ADMIN role
user / password → CHARGE_OPERATIONS (test operator)
```

Change passwords on first login in production!

---

## 🗄️ Database Schema (23 Tables)

**Core:**
- `orders` — Master orders with scope_status
- `order_trades` — Multi-trade associations
- `order_reconciliation` — Budget tracking matches

**Company:**
- `companies`
- `company_contacts`
- `company_os_contacts`

**Reference Data:**
- `trades`, `nature_catalog`
- `risk_catalog`, `measure_catalog`
- `nature_risk_rules`, `nature_measure_rules`

**Plans:**
- `prevention_plans`
- `prevention_plan_risks`
- `prevention_plan_measures`

**Administration:**
- `command_scope_rules`, `command_scope_rule_values`
- `email_templates`
- `plan_templates`, `plan_template_versions`
- `delegation_permissions`
- `imports`

**Audit:**
- `audit_logs`
- `workflow_events`
- `notifications`
- `archive_records`

See `docs/DATA_MODEL.md` for complete schema definition.

---

## 🔍 Key Insights from Phase 0

### Reconciliation Results
- **186 orders** (21%) matched with budget tracking
- **681 orders** (79%) require manual trade qualification
- **S11 sector:** 36 orders (16 need qualification)
- **Date distribution:** Peak activity last 30 days (431 orders)

### Data Quality
- All 867 orders are unique by COMN_NUM
- 197 distinct companies, 37 operators
- 516 work natures (many similar, consolidated in catalog)
- Most commandes from last 90 days

### Implementation Impact
- Manual qualification is critical path
- Company data enrichment required upfront
- Multi-trade support non-negotiable
- Scope filtering must support policy changes

---

## 📝 Commit Message Convention

All commits include:
```
<phase>: <description>

- Detail 1
- Detail 2
- Detail 3

Next phase: [phase name]
```

Signed with Claude Haiku 4.5 attribution footer.

---

## 🔗 Important Links

- **GitHub Repo:** https://github.com/Hamedchedly/Plans-de-prevention
- **Branch:** `claude/prevention-plans-app-v6-liv6ji`
- **Supabase Dashboard:** [Project-specific URL]
- **Railway Dashboard:** [Project-specific URL]

---

## ✅ Verification Checklist

Before starting Phase 1:
- [ ] Read PHASE_0_ANALYSIS_COMPLETE.md
- [ ] Read CLAUDE.md
- [ ] Review PHASE_1_INFRASTRUCTURE.md
- [ ] Understand data flow: Excel → Orders → Trades → Plans → PDF
- [ ] Verify reference files in `reference/` directory
- [ ] Confirm branch: `claude/prevention-plans-app-v6-liv6ji`

Before finishing each phase:
- [ ] All features for phase implemented
- [ ] Unit/integration tests pass
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Changes committed and pushed
- [ ] Next phase guide created

---

## 📞 Support

For questions:
1. Check PHASE_0_ANALYSIS_COMPLETE.md
2. Review CLAUDE.md for guidelines
3. Consult phase-specific documentation
4. Check reference files for data mapping
5. Review commit history for implementation examples

---

## 📄 License

Internal project for [Organization]. All rights reserved.

**Version:** V6  
**Status:** Phase 0 Complete, Phase 1 Ready  
**Last Updated:** 2026-09-18

---

**Ready to build! 🚀**

Start with: `PHASE_0_ANALYSIS_COMPLETE.md` then `PHASE_1_INFRASTRUCTURE.md`