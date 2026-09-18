# Quick Setup: Run Migrations on Supabase

**Ton projet Supabase est prêt!** Voici comment exécuter les migrations en 5 minutes.

## 📋 Étapes

### 1. **Va sur Supabase Dashboard**
```
https://app.supabase.com
→ Sélectionne ton projet
→ Va dans SQL Editor
```

### 2. **Exécute Migration 1: Schéma Initial**
```
Fichier: supabase/migrations/001_initial_schema.sql
- Copy tout le contenu
- Paste dans SQL Editor
- Clique "Run"
```

**Résultat attendu:** 23 tables créées ✓

### 3. **Exécute Migration 2: RLS Policies**
```
Fichier: supabase/migrations/002_rls_policies.sql
- Copy tout le contenu
- Paste dans SQL Editor
- Clique "Run"
```

**Résultat attendu:** Policies créées, fonction get_user_role ✓

### 4. **Exécute Migration 3: Bootstrap Data**
```
Fichier: supabase/migrations/003_bootstrap_data.sql
- Copy tout le contenu
- Paste dans SQL Editor
- Clique "Run"
```

**Résultat attendu:** 19 trades, 14 risks, 27 measures insérés ✓

### 5. **Crée Bootstrap Users** (en Supabase Auth)
```
- Va dans Authentication → Users
- Clique "Add user"

Utilisateur 1:
  Email: super_admin@example.com
  Password: superadmin
  
Utilisateur 2:
  Email: user@example.com
  Password: user
```

### 6. **Ajoute les Rôles** (User Metadata)
```
Pour chaque utilisateur:
- Clique sur l'utilisateur
- Onglet "User Metadata"
- Ajoute JSON:

super_admin:
  {"role": "SUPER_ADMIN"}

user:
  {"role": "CHARGE_OPERATIONS"}
```

## ✅ Vérification

**Dans Supabase SQL Editor, exécute:**
```sql
select count(*) from public.pp_orders;
select count(*) from public.pp_trades;
select count(*) from public.pp_risk_catalog;
```

**Résultats attendus:**
- pp_orders: 0 (aucune donnée pour le moment)
- pp_trades: 19
- pp_risk_catalog: 14

## 🚀 Démarre l'App

```bash
cd app
npm install
npm run dev

# Ouvre http://localhost:5173
# Connecte-toi avec:
#   Email: user@example.com
#   Password: user
```

## 🎯 Si tu as des erreurs:

1. **"Table not found"** → Vérifie les migrations (elles ont bien exécuté?)
2. **"RLS policy violation"** → C'est normal si user n'est pas créé; crée-le d'abord
3. **Connection refused** → Vérifie le VITE_SUPABASE_URL dans .env.local

---

**Une fois les migrations exécutées, je continue avec Phase 2!** 🚀

Dis-moi quand c'est prêt!
