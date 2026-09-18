# PHASE 2 — IMPORT & FILTERING

**Status:** Ready to Start  
**Predecessor:** Phase 1 ✓ Complete  
**Duration:** Estimated 4-5 days  
**Deliverable:** Excel import + scope filtering + reconciliation + qualification UI

---

## OBJECTIVES

1. **Excel Import Module** - Upload and parse ANM_COMD_TRAV_ER
2. **Scope Filtering (V6)** - Super Admin configurable order scope
3. **Budget Tracking Reconciliation** - Match orders with ANM_SUIVTRXSECT
4. **Qualification Interface** - Manual trade assignment for unmatched orders
5. **Dashboard Integration** - Display imported orders with status

---

## ARCHITECTURE OVERVIEW

```
Excel Upload
    ↓
Parse & Validate
    ↓
Scope Filtering (IN_SCOPE / OUT_OF_SCOPE)
    ↓
Budget Tracking Reconciliation
    ├─ Found in tracking → MATCHED
    └─ Not found → A_QUALIFIER
    ↓
Store in pp_orders
    ├─ pp_order_trades (for manual qualification)
    └─ pp_order_reconciliation (matching status)
    ↓
Dashboard Display
    ├─ Tab: Sans plan
    ├─ Tab: À QUALIFIER
    └─ Tab: Archivés
```

---

## FEATURES

### 2.1 Excel Import Module

**Input File:** ANM_COMD_TRAV_ER_6.xlsx

**Columns to Map:**
- COMN_NUM → order_number (key)
- COMD_DATE → order_date
- WNATURE → work_nature
- WNOTES → work_description
- ENTN_NUM → company_id (foreign key)
- UTIC_CODE → owner_user_id (chargé opérations)
- NAAC_CODE → budget_nature (for scope filtering)
- INTC_CODE → intervention_code
- WCOMMUNE → site_city_zip
- WADRESSE → site_address
- COMN_MT_DEVIS → amount_ttc

**Process:**
1. Upload .xlsx file
2. Preview mapping
3. Validate data
4. Detect duplicates
5. Apply scope filter
6. Perform reconciliation
7. Store in database

### 2.2 Scope Filtering (V6)

**Configuration:**
```sql
INSERT INTO pp_command_scope_rules (name, active, field_name, mode)
VALUES ('Active Orders', true, 'budget_nature', 'INCLUDE');

INSERT INTO pp_command_scope_rule_values (rule_id, value)
VALUES (rule_id, 'GT'), (rule_id, 'GE'), (rule_id, 'CP');
```

**Example:**
- Rule: GT + GE + CP only
- Order NAAC_CODE='GT' → IN_SCOPE ✓
- Order NAAC_CODE='XX' → OUT_OF_SCOPE

**Important:** Out-of-scope orders are NOT deleted!
- Stored in pp_orders
- Marked: scope_status = 'OUT_OF_SCOPE'
- Remain for future re-activation

### 2.3 Budget Tracking Reconciliation

**Source:** ANM_SUIVTRXSECT_7.xlsx

**Reconciliation:**
```
pp_orders.order_number ↔ ANM_SUIVTRXSECT column O (COMN_NUM)
```

**Matching Strategy:**
1. Extract unique order numbers from budget tracking
2. For each order in pp_orders:
   - Found in tracking → MATCHED
   - Not found → NOT_FOUND
3. For matched orders, extract trade hints:
   - Column D/J: Corps d'état (trade)
   - Column I: Nature budget
   - Store in pp_order_reconciliation

**Status Values:**
- MATCHED - Found in tracking
- NOT_FOUND - Missing from tracking (→ À QUALIFIER)
- MULTIPLE_MATCH - Potential duplicates
- NEEDS_REVIEW - Conflicts detected

### 2.4 Qualification Interface

**For Unmatched Orders ("À QUALIFIER" Tab):**

1. **Search Trade:**
   - Text search: "menuiserie"
   - Code search: "0301"
   - Multi-select enabled

2. **Propose Trade:**
   - Based on work_nature
   - Based on INTC_CODE
   - Based on similar orders
   - Show confidence score

3. **Manual Selection:**
   - Select one or multiple trades
   - Add comment
   - Validate

4. **Result:**
   - Save to pp_order_trades
   - Source: MANUAL
   - Confidence: null
   - Move order to active workflow

### 2.5 Dashboard Integration

**KPI Cards:**
- Sans plan: orders without prevention_plan
- À QUALIFIER: qualification_status = 'PENDING'
- Scope Filtered: count(scope_status = 'OUT_OF_SCOPE')

**Tabs:**
1. **Sans plan** - Orders needing plans
2. **À QUALIFIER** - Unmatched orders
3. **Filtrés** - Out-of-scope orders
4. **Archivés** - Archived orders

**Columns:**
- Numéro commande
- Date
- Descriptif/Nature
- Entreprise
- ISIS
- Statut matching
- Qualification status
- Scope status
- Actions

---

## IMPLEMENTATION PLAN

### Step 1: Excel Parser Service
```
app/src/lib/excel-parser.ts
- Parse .xlsx with SheetJS
- Extract columns
- Validate data
- Detect duplicates
```

### Step 2: Import Workflow Service
```
app/src/lib/import-service.ts
- Apply scope filtering
- Perform reconciliation
- Create order records
- Handle errors
```

### Step 3: Scope Filtering UI
```
app/src/pages/admin/ScopeFiltering.tsx
- Display current rules
- Add/edit rules
- Preview affected orders
- Apply changes
```

### Step 4: Import Interface
```
app/src/pages/Import.tsx
- File upload
- Mapping preview
- Validation report
- Progress tracking
```

### Step 5: Qualification UI
```
app/src/pages/Qualification.tsx
- List unmatched orders
- Trade search
- Multi-select
- Batch qualification
```

### Step 6: Dashboard Data Integration
```
Update app/src/pages/Dashboard.tsx
- Fetch from pp_orders
- Show KPI
- Implement tabs
- Add filters
```

---

## DATABASE OPERATIONS

### Create Order with Reconciliation

```typescript
// 1. Create order
const order = await supabase
  .from('pp_orders')
  .insert({
    order_number,
    work_nature,
    work_description,
    owner_user_id,
    company_id,
    budget_nature,
    scope_status: 'IN_SCOPE',
    qualification_status: 'PENDING',
  })
  .single();

// 2. If found in tracking
if (foundInTracking) {
  await supabase
    .from('pp_order_reconciliation')
    .insert({
      order_id: order.id,
      match_status: 'MATCHED',
      confidence: 1.0,
      tracking_import_id: trackingId,
    });
  
  // 3. Add proposed trade
  if (proposedTrade) {
    await supabase
      .from('pp_order_trades')
      .insert({
        order_id: order.id,
        trade_id: proposedTrade.id,
        source: 'BUDGET_TRACKING',
        confidence_score: 0.9,
      });
  }
}
```

### Qualify Order (Manual)

```typescript
// Update qualification status
await supabase
  .from('pp_orders')
  .update({
    qualification_status: 'QUALIFIED',
  })
  .eq('id', orderId);

// Add selected trades
for (const tradeId of selectedTrades) {
  await supabase
    .from('pp_order_trades')
    .insert({
      order_id: orderId,
      trade_id: tradeId,
      source: 'MANUAL',
      confidence_score: null,
      selected_by: userId,
      selected_at: new Date().toISOString(),
    });
}
```

---

## DEPENDENCIES TO ADD

```bash
npm install \
  xlsx \
  papaparse \
  @radix-ui/dialog \
  @radix-ui/progress
```

---

## TESTING STRATEGY

### Unit Tests
- Excel parsing
- Scope filter logic
- Reconciliation matching
- Validation rules

### Integration Tests
- Full import workflow
- Database constraints
- RLS policy enforcement
- Concurrent imports

### Manual Testing
- Upload sample Excel
- Apply scope filter
- Verify reconciliation
- Qualify orders
- Check dashboard

**Test Data:**
- Use files in reference/
- Expected: 867 orders
- Expected matches: ~186
- Expected to qualify: ~681

---

## PHASE 2 COMPLETION CHECKLIST

- [ ] Excel parser service
- [ ] Import workflow service
- [ ] Scope filtering rules UI
- [ ] Import interface with upload
- [ ] Reconciliation display
- [ ] Qualification interface
- [ ] Dashboard tab integration
- [ ] KPI calculations
- [ ] Error handling & validation
- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing complete
- [ ] Documentation updated

---

## NEXT PHASE

After Phase 2:
- **Phase 3:** Company Management
  - Company CRUD
  - Contact management
  - OS email setup
  - Alert system

---

## FILES TO CREATE

```
app/src/
├── lib/
│   ├── excel-parser.ts        # Excel parsing logic
│   ├── import-service.ts      # Import workflow
│   └── reconciliation.ts      # Reconciliation logic
├── pages/
│   ├── admin/
│   │   └── ScopeFiltering.tsx # Scope filter UI
│   ├── Import.tsx             # Import interface
│   └── Qualification.tsx       # Qualification UI
├── components/
│   ├── import/
│   │   ├── FileUpload.tsx
│   │   ├── MappingPreview.tsx
│   │   └── ValidationReport.tsx
│   ├── qualification/
│   │   ├── TradeSearch.tsx
│   │   └── QualificationForm.tsx
│   └── dashboard/
│       └── OrderTable.tsx
└── hooks/
    └── useOrders.ts           # Orders data fetching
```

---

**Ready to build Phase 2!** 🚀

Once migrations are done in Supabase, I'll implement all features.

