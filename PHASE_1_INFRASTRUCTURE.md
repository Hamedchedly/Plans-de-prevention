# PHASE 1 — INFRASTRUCTURE & FOUNDATION SETUP

**Status:** Ready to start  
**Predecessor:** Phase 0 ✓ Complete  
**Duration:** Estimated 3-4 days  
**Deliverable:** Supabase project + React app scaffold with working auth

---

## OBJECTIVES

1. **Supabase Project** - PostgreSQL + Auth + Storage configured
2. **Database Schema** - All tables created per locked architecture
3. **RLS Policies** - Role-based access control enforced
4. **React + Vite App** - Scaffold with TypeScript, Tailwind, shadcn/ui
5. **Authentication** - Email/password with role assignment
6. **Test Bootstrap** - Sample users can log in and see dashboard

---

## STEP 1: SUPABASE PROJECT CREATION

### 1.1 Create Project

```bash
# Go to https://supabase.com and create new project
# Project name: plans-de-prevention-v6
# Database password: [use strong password]
# Region: eu-west-1 (or closest to France)
```

Save credentials:
- Project URL
- API Key (anon)
- Service Role Key
- Database password

### 1.2 Configure Auth

In Supabase dashboard:

**Settings > Authentication > Providers**
- Email enabled ✓
- Confirm email: Off (for testing, enable in prod)
- Auto confirm: On (for testing, disable in prod)

**Settings > Authentication > User Sessions**
- Session expiry: 7 days

**Settings > Authentication > Email Templates**
- Use defaults for now

### 1.3 Create Storage Buckets

```sql
-- In Supabase SQL editor:
-- Bucket 1: user_signatures
create policy "Users can upload own signature"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'user_signatures' and
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Bucket 2: pdf_exports
create policy "Users can read exported PDFs"
on storage.objects for select
to authenticated
with check (bucket_id = 'pdf_exports');
```

---

## STEP 2: DATABASE SCHEMA CREATION

### 2.1 Create Migration File

```bash
# Create migrations directory
mkdir -p supabase/migrations
```

### 2.2 Create Tables (sql file)

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Auth: Extend auth.users with profile info
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  heritage_code text unique,
  first_name text,
  last_name text,
  email text,
  phone text,
  function text,
  signature_storage_path text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Companies
create table public.companies (
  id uuid primary key default uuid_generate_v4(),
  code_isis text not null unique,
  name text,
  address text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Company Contacts
create table public.company_contacts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text,
  last_name text,
  role text,
  email text,
  phone text,
  is_active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Company OS Contacts (default OS contact marker)
create table public.company_os_contacts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.company_contacts(id) on delete cascade,
  is_default boolean default false,
  active_from timestamp default now(),
  active_to timestamp,
  created_at timestamp default now()
);

-- Trade Catalog
create table public.trades (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  description text,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Nature Catalog
create table public.nature_catalog (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  normalized_name text,
  trade_id uuid references public.trades(id),
  description text,
  status text default 'active',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Risk Catalog
create table public.risk_catalog (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  active boolean default true,
  created_at timestamp default now()
);

-- Measure Catalog
create table public.measure_catalog (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  active boolean default true,
  created_at timestamp default now()
);

-- Nature -> Risk Rules
create table public.nature_risk_rules (
  id uuid primary key default uuid_generate_v4(),
  nature_id uuid not null references public.nature_catalog(id) on delete cascade,
  risk_id uuid not null references public.risk_catalog(id) on delete cascade,
  priority int default 0,
  active boolean default true,
  created_at timestamp default now(),
  unique(nature_id, risk_id)
);

-- Nature -> Measure Rules
create table public.nature_measure_rules (
  id uuid primary key default uuid_generate_v4(),
  nature_id uuid not null references public.nature_catalog(id) on delete cascade,
  measure_id uuid not null references public.measure_catalog(id) on delete cascade,
  priority int default 0,
  active boolean default true,
  created_at timestamp default now(),
  unique(nature_id, measure_id)
);

-- Orders (Master Entity)
create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  order_number text not null unique,
  heritage_code text,
  sector_id text,
  intervention_code text,
  budget_line_year text,
  owner_user_id uuid references public.user_profiles(user_id),
  company_id uuid references public.companies(id),
  order_date date,
  budget_nature text,
  cf_code text,
  analytic_account text,
  source_status text,
  amount_ttc numeric(15,2),
  amount_reconciled numeric(15,2),
  amount_gap numeric(15,2),
  tranche_name text,
  site_address text,
  site_city_zip text,
  work_nature text,
  work_description text,
  tracking_match_status text default 'NOT_FOUND',
  qualification_status text default 'PENDING',
  scope_status text default 'IN_SCOPE',
  source_import_id uuid,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Order -> Trade Association
create table public.order_trades (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  trade_id uuid not null references public.trades(id),
  source text not null,
  confidence_score numeric(3,2),
  selected_by uuid references public.user_profiles(user_id),
  selected_at timestamp,
  created_at timestamp default now(),
  unique(order_id, trade_id)
);

-- Order Reconciliation with Budget Tracking
create table public.order_reconciliation (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tracking_import_id text,
  match_status text not null,
  confidence numeric(3,2),
  manually_confirmed boolean default false,
  confirmed_by uuid references public.user_profiles(user_id),
  confirmed_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Command Scope Rules (V6)
create table public.command_scope_rules (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  active boolean default true,
  field_name text not null,
  mode text not null check (mode in ('INCLUDE', 'EXCLUDE')),
  created_by uuid not null references public.user_profiles(user_id),
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Command Scope Rule Values
create table public.command_scope_rule_values (
  id uuid primary key default uuid_generate_v4(),
  rule_id uuid not null references public.command_scope_rules(id) on delete cascade,
  value text not null,
  created_at timestamp default now(),
  unique(rule_id, value)
);

-- Prevention Plans
create table public.prevention_plans (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  template_version_id uuid,
  status text default 'DRAFT',
  intervention_start date,
  intervention_end date,
  drafted_by uuid references public.user_profiles(user_id),
  validated_by uuid references public.user_profiles(user_id),
  sent_at timestamp,
  received_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Prevention Plan Risks
create table public.prevention_plan_risks (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.prevention_plans(id) on delete cascade,
  risk_id uuid not null references public.risk_catalog(id),
  selected boolean default true,
  source text,
  created_at timestamp default now(),
  unique(plan_id, risk_id)
);

-- Prevention Plan Measures
create table public.prevention_plan_measures (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.prevention_plans(id) on delete cascade,
  measure_id uuid not null references public.measure_catalog(id),
  selected boolean default true,
  source text,
  created_at timestamp default now(),
  unique(plan_id, measure_id)
);

-- Email Templates
create table public.email_templates (
  id uuid primary key default uuid_generate_v4(),
  type text not null,
  subject_template text,
  body_template text,
  version int default 1,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Plan Templates
create table public.plan_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  active boolean default true,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Plan Template Versions
create table public.plan_template_versions (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.plan_templates(id) on delete cascade,
  version int not null,
  status text default 'DRAFT',
  definition_json jsonb,
  created_by uuid references public.user_profiles(user_id),
  created_at timestamp default now(),
  unique(template_id, version)
);

-- Imports Log
create table public.imports (
  id uuid primary key default uuid_generate_v4(),
  filename text,
  source_type text,
  imported_by uuid references public.user_profiles(user_id),
  imported_at timestamp default now(),
  row_count int,
  created_count int,
  updated_count int,
  error_count int
);

-- Delegation Permissions
create table public.delegation_permissions (
  id uuid primary key default uuid_generate_v4(),
  delegate_user_id uuid not null references public.user_profiles(user_id),
  target_user_id uuid not null references public.user_profiles(user_id),
  can_read boolean default false,
  can_edit boolean default false,
  can_send boolean default false,
  start_at timestamp default now(),
  end_at timestamp,
  active boolean default true,
  created_at timestamp default now(),
  unique(delegate_user_id, target_user_id)
);

-- Workflow Events
create table public.workflow_events (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid references public.prevention_plans(id) on delete cascade,
  action text not null,
  actor_user_id uuid not null references public.user_profiles(user_id),
  subject_user_id uuid references public.user_profiles(user_id),
  metadata jsonb,
  created_at timestamp default now()
);

-- Notifications
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_user_id uuid not null references public.user_profiles(user_id),
  type text,
  title text,
  body text,
  read_at timestamp,
  created_at timestamp default now()
);

-- Audit Logs
create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_user_id uuid references public.user_profiles(user_id),
  subject_user_id uuid references public.user_profiles(user_id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamp default now()
);

-- Archive Records
create table public.archive_records (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null,
  entity_id text not null,
  archived_by uuid references public.user_profiles(user_id),
  archived_at timestamp default now(),
  reason text
);

-- Create indexes for performance
create index idx_orders_owner_user_id on public.orders(owner_user_id);
create index idx_orders_company_id on public.orders(company_id);
create index idx_orders_order_date on public.orders(order_date);
create index idx_orders_scope_status on public.orders(scope_status);
create index idx_orders_qualification_status on public.orders(qualification_status);
create index idx_order_trades_order_id on public.order_trades(order_id);
create index idx_prevention_plans_order_id on public.prevention_plans(order_id);
create index idx_prevention_plans_status on public.prevention_plans(status);
create index idx_audit_logs_created_at on public.audit_logs(created_at);
create index idx_notifications_recipient on public.notifications(recipient_user_id);

-- Enable RLS
alter table public.user_profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_contacts enable row level security;
alter table public.company_os_contacts enable row level security;
alter table public.orders enable row level security;
alter table public.order_trades enable row level security;
alter table public.prevention_plans enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.delegation_permissions enable row level security;
```

### 2.3 Apply Schema

```bash
# Option A: Using Supabase CLI (recommended)
supabase db push

# Option B: In Supabase Dashboard SQL Editor
# Copy-paste the migration file and execute
```

---

## STEP 3: RLS POLICIES

### 3.1 Create RLS Policy File

`supabase/migrations/002_rls_policies.sql`:

```sql
-- RLS Policies for Role-Based Access Control

-- Helper function for role checking
create or replace function get_user_role()
returns text as $$
declare
  role text;
begin
  select role into role from auth.users where id = auth.uid();
  return role;
end;
$$ language plpgsql security definer set search_path = public;

-- ORDERS RLS
-- CHARGE_OPERATIONS: Own orders + delegated
-- RESPONSABLE: All orders
-- SUPER_ADMIN: All orders
create policy "Orders: CHARGE_OPERATIONS own orders"
on public.orders for select
to authenticated
using (
  get_user_role() = 'CHARGE_OPERATIONS' and owner_user_id = auth.uid()
  or get_user_role() = 'RESPONSABLE'
  or get_user_role() = 'SUPER_ADMIN'
);

create policy "Orders: Users can insert"
on public.orders for insert
to authenticated
with check (get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'));

create policy "Orders: Users can update"
on public.orders for update
to authenticated
using (
  get_user_role() = 'RESPONSABLE' or get_user_role() = 'SUPER_ADMIN'
);

-- COMPANIES RLS
create policy "Companies: Authenticated users can read"
on public.companies for select
to authenticated
using (true);

create policy "Companies: SUPER_ADMIN can modify"
on public.companies for update
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- PREVENTION_PLANS RLS
create policy "Plans: Operators can see own"
on public.prevention_plans for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = prevention_plans.order_id
    and (o.owner_user_id = auth.uid() or get_user_role() in ('RESPONSABLE', 'SUPER_ADMIN'))
  )
);

-- AUDIT_LOGS RLS
create policy "Audit: SUPER_ADMIN only"
on public.audit_logs for select
to authenticated
using (get_user_role() = 'SUPER_ADMIN');

-- NOTIFICATIONS RLS
create policy "Notifications: Recipients only"
on public.notifications for select
to authenticated
using (recipient_user_id = auth.uid());
```

Apply: `supabase db push` or manual SQL execution.

---

## STEP 4: BOOTSTRAP DATA

### 4.1 Create Bootstrap Script

`supabase/migrations/003_bootstrap_data.sql`:

```sql
-- Bootstrap Users (for testing)
-- Note: In production, use secure password reset flow

-- These users are created in auth.users via Supabase Auth UI
-- Then link profiles here

-- Bootstrap will be handled in app initialization

-- Bootstrap Trades (from reference data)
insert into public.trades (code, name, description, active) values
('0100', 'Aménagement logement', null, true),
('0101', 'Maçonnerie', null, true),
('0102', 'Réfection voirie et abords', null, true),
('0103', 'Travaux divers, espaces extérieurs', null, true),
('0201', 'Etanchéité terrasse, couverture', null, true),
('0202', 'Etanchéité façade', null, true),
('0203', 'Isolation thermique', null, true),
('0204', 'Fenêtre, vasistas', null, true),
('0301', 'Menuiserie', null, true),
('0302', 'Serrurerie', null, true),
('0303', 'Porte box', null, true),
('0401', 'Revêtement de sol', null, true),
('0501', 'Gouttières, descentes EP', null, true),
('0503', 'Plomberie', null, true),
('0601', 'Chauffage / désembouage / travaux associés', null, true),
('0802', 'Ascenseur', null, true),
('0804', 'Divers communs', null, true),
('0828', 'Sécurité et vidéo surveillance', null, true),
('0829', 'Honoraires', null, true)
on conflict (code) do nothing;

-- Bootstrap Risk Catalog
insert into public.risk_catalog (code, name, active) values
('CHUTE', 'Chute de hauteur', true),
('ELECTROCUTION', 'Électrocution', true),
('ASPHYXIE', 'Asphyxie/Intoxication', true),
('INCENDIE', 'Incendie/Explosion', true),
('COLLISION', 'Collision véhicule', true),
('BLESSURE', 'Blessure/Écrasement', true),
('BRUIT', 'Bruit/Vibrations', true),
('POUSSIERE', 'Poussière/Pollution', true),
('RAYONNEMENT', 'Rayonnement', true),
('CHIMIQUE', 'Produit chimique', true),
('BIOLOGIQUE', 'Biologique', true),
('THERMIQUE', 'Brûlure thermique', true),
('ERGONOMIQUE', 'Trouble musculo-squelettique', true),
('PSYCHOSOCIAL', 'Risque psychosocial', true)
on conflict (code) do nothing;

-- Bootstrap Measure Catalog
insert into public.measure_catalog (code, name, active) values
('EPI_CASQUE', 'Port du casque obligatoire', true),
('EPI_HARNAIS', 'Harnais de sécurité obligatoire', true),
('EPI_GILET', 'Gilet de signalisation obligatoire', true),
('EPI_GANTS', 'Gants de protection obligatoires', true),
('EPI_CHAUSSURES', 'Chaussures de sécurité obligatoires', true),
('EPI_PROTEGE_TETE', 'Protection tête complète', true),
('BARRIERE', 'Mise en place de barrières', true),
('SIGNALISATION', 'Signalisation appropriée', true),
('ECLAIRAGE', 'Éclairage de secours', true),
('VENTILATION', 'Ventilation mécanique', true),
('EXTRACTION', 'Extraction/Aspiration', true),
('EQUIPEMENT_AUTONOME', 'Appareil respiratoire autonome', true),
('CONSIGNATION', 'Consignation/Cadenassage', true),
('ISOLATION', 'Isolation électrique', true),
('COUPURE_CIRCUIT', 'Mise en circuit court', true),
('TERRE_PROTECTION', 'Mise à la terre de protection', true),
('DISJONCTEUR_DIFFERENTIEL', 'Disjoncteur différentiel 30mA', true),
('CONTROLE_ELECTRIQUE', 'Contrôle régulier', true),
('EXTINCTION', 'Extincteurs disponibles', true),
('DETECTION', 'Détecteur de fumée', true),
('PLAN_EVACUATION', 'Plan d''évacuation affiché', true),
('SUPERVISION', 'Surveillance constante', true),
('LIMITATION_VITESSE', 'Limitation de vitesse', true),
('SIGNALEUR', 'Signaleur/Guetteur', true),
('PROTECTER_MACHINE', 'Protecteurs de machines', true),
('ARRET_URGENCE', 'Arrêt d''urgence accessible', true),
('FORMATION', 'Formation spécifique requise', true)
on conflict (code) do nothing;

-- Bootstrap Email Templates
insert into public.email_templates (type, subject_template, body_template, version, active) values
('INITIAL_SEND',
  'Fiche de prévention - {{order.order_number}}',
  'Madame, Monsieur {{company.os_contact.last_name}},\n\nVeuillez trouver ci-joint la fiche de prévention pour les travaux {{order.work_nature}}.\n\nDate: {{plan.drafted_at}}\nChargé: {{user.full_name}}\n\nVeuillez valider ou corriger les informations.\n\nCordialement,\n{{user.full_name}}\n{{user.phone}}',
  1,
  true),
('RESEND',
  'Relance fiche de prévention - {{order.order_number}}',
  'Madame, Monsieur {{company.os_contact.last_name}},\n\nNous n''avons pas reçu de retour concernant la fiche de prévention du {{plan.drafted_at|date}}.\n\nVeuillez trouver ci-joint un exemplaire.\n\nMerci de votre diligence.\n\n{{user.full_name}}\n{{user.phone}}',
  1,
  true)
on conflict do nothing;

-- Bootstrap Plan Template (v1)
insert into public.plan_templates (name, active) values
('Prevention Plan v1', true)
on conflict do nothing;
```

Apply: `supabase db push`

---

## STEP 5: REACT + VITE SCAFFOLD

### 5.1 Create Vite App

```bash
npm create vite@latest app -- --template react-ts
cd app
npm install

# Add core dependencies
npm install \
  @supabase/supabase-js \
  @tanstack/react-router \
  @tanstack/react-query \
  @tanstack/react-table \
  tailwindcss \
  postcss \
  autoprefixer \
  class-variance-authority \
  clsx \
  tailwind-merge \
  zod \
  react-hook-form \
  @hookform/resolvers

# shadcn/ui setup
npm install -D shadcn-ui
npx shadcn-ui@latest init
```

### 5.2 Configure Tailwind

`app/tailwind.config.ts`:
```typescript
import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
```

### 5.3 Supabase Client Setup

`app/src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
```

### 5.4 Environment Config

`app/.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## STEP 6: AUTHENTICATION SETUP

### 6.1 Auth Context

`app/src/context/AuthContext.tsx`:
```typescript
import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  role: string | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // Fetch role from user metadata or database
        setRole(session.user.user_metadata?.role || null)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setRole(session?.user?.user_metadata?.role || null)
      }
    )

    return () => subscription?.unsubscribe()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

### 6.2 Login Page

`app/src/pages/Login.tsx` - Basic template provided in Phase 1 setup

---

## STEP 7: TEST & DEPLOY

### 7.1 Local Testing

```bash
# Start dev server
npm run dev

# Visit http://localhost:5173
# Test login with bootstrap users
```

### 7.2 Build

```bash
npm run build

# Check dist folder is created
ls dist
```

### 7.3 Deploy to Railway

```bash
# Connect Railway to GitHub repo
# Push to branch: git push origin claude/prevention-plans-app-v6-liv6ji
# Railway auto-deploys

# Or manual deployment:
railway login
railway link
railway up --dist
```

---

## VERIFICATION CHECKLIST

- [ ] Supabase project created and accessible
- [ ] All tables created without errors
- [ ] RLS policies applied
- [ ] Storage buckets configured
- [ ] React app scaffolded
- [ ] Tailwind CSS working
- [ ] Supabase client configured
- [ ] Auth context implemented
- [ ] Login page accessible
- [ ] Bootstrap users can login
- [ ] Dashboard accessible after login
- [ ] Build succeeds without warnings
- [ ] Deployed to Railway

---

## NEXT PHASE

After Phase 1 completion:
- Phase 2: Import & Filtering
  - Excel upload UI
  - Import preview
  - Scope filtering rules
  - Reconciliation matching

---

## FILES TO COMMIT

```
app/                          # React project root
app/src/
  ├── lib/supabase.ts
  ├── context/AuthContext.tsx
  ├── pages/Login.tsx
  ├── App.tsx
  ├── main.tsx
  └── index.css              # Tailwind imports
supabase/migrations/
  ├── 001_initial_schema.sql
  ├── 002_rls_policies.sql
  └── 003_bootstrap_data.sql
.env.local                     # Keep secret!
PHASE_1_INFRASTRUCTURE.md      # This file
```

All changes committed to branch: `claude/prevention-plans-app-v6-liv6ji`

