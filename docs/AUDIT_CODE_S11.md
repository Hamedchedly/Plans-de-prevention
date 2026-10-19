# Audit de code — Plans de prévention S11

Date : 2026-10-19 · Branche : `claude/plans-prevention-s11` · Périmètre : application React (`app/`), fonctions SQL du schéma `plans_prevention`, fonctions Edge (`supabase/functions/`).

## 1. Résultats des contrôles

| Contrôle | Résultat |
|---|---|
| Vérification de types (`tsc`) | OK |
| Build de production (`vite build`) | OK |
| Tests unitaires (`vitest`, règles de mesures) | 6 / 6 OK |
| Lint (`eslint`) | Avant audit : 12 erreurs, 15 avertissements. Après correction : **0 erreur**, 15 avertissements |
| Secrets dans le dépôt | Aucun. La clé `service_role` n'est utilisée que dans les fonctions Edge (variable d'environnement). `app/.env.local` est ignoré par git |
| Usage de `innerHTML` / `eval` | Aucun |
| Traces de débogage (`console.log`) | Aucune |

## 2. Corrections appliquées pendant l'audit

- Lint : imports et variables inutilisés supprimés (dialogues, administration, PDF) ; espace insécable dans des expressions régulières remplacée par son échappement ; expression régulière de nettoyage du PDF réécrite sans caractère de contrôle (même effet : les caractères hors Latin-1 restent remplacés par « ? ») ; point-virgule parasite supprimé ; paramètre inutilisé retiré de `fetchSavedLines`.
- ESLint : les plugins TypeScript manquants (qui empêchaient le lint de tourner) sont ajoutés en dépendances de développement.

## 3. Sécurité base de données (Supabase)

### Corrigé le 2026-10-19 (migration `20261019100000_s11_security_hardening`, appliquée)

| Constat | Gravité | Correction |
|---|---|---|
| `promote_super_admin(email)` sans aucun contrôle, appelable par tout utilisateur connecté : un chargé pouvait se donner le rôle Super Admin | **Critique** | Droits retirés à tous les rôles client. Non utilisée par l'application ; reste disponible depuis l'éditeur SQL |
| 10 fonctions SECURITY DEFINER du schéma exécutables par le rôle anonyme (`anon`), dont `admin_set_profile`, `set_scope_rules`, `decide_alert`, `set_order_scope` | Élevée | Exécution anonyme retirée sur toutes les fonctions du schéma. L'application n'appelle aucune fonction sans connexion |

Vérification après application : aucune fonction du schéma n'est exécutable par `anon` ; `promote_super_admin` n'est exécutable par aucun rôle client.

### À traiter

| Constat | Gravité | Action proposée |
|---|---|---|
| `apply_order_audit`, `apply_scope_rules`, `auto_archive_plans` n'ont pas de contrôle de rôle dans leur corps (exécutables par tout connecté) | Moyenne | Ajouter un contrôle `is_manager()` (import et audit) ; `auto_archive_plans` peut rester ouvert car idempotent |
| Protection des mots de passe compromis désactivée (Supabase Auth) | Moyenne | Activer dans les réglages Auth du projet |
| Vue `public.v_travaux_commandes_enrichies` en SECURITY DEFINER | Élevée (autre application du même projet) | Hors périmètre S11 : à corriger avec le projet concerné |
| Tables `public.psp_*`, `public.pp_*`, `travaux_import_details`, `villes_geo`… avec RLS activée sans politique | Information | Hors périmètre S11 (autres applications du même projet) |
| Fonctions `public.*` sans `search_path` figé | Faible | Hors périmètre S11 |
| Fonctions `plans_prevention.company_fields` sans `search_path` figé | Faible | Figer `search_path` à la prochaine migration |

## 4. Avertissements de lint restants (mise à jour 2026-10-19 : 11 avertissements, tous de rafraîchissement à chaud)

- `react-refresh/only-export-components` (fichiers qui exportent aussi des fonctions ou constantes : `ui.tsx`, `auth.tsx`, `router.tsx`, `AdminCompanies.tsx`, `AdminOps.tsx`) : impact uniquement sur le rafraîchissement à chaud en développement.
- `react-hooks/exhaustive-deps` : traité. Les effets concernés chargent une seule fois au montage (sections d'administration) ou quand le numéro de commande change (fiche) ; la dérogation est signalée dans le code.

## 5. Points non couverts par cet audit

- Parcours connectés dans un navigateur (création de fiche, export PDF, envoi, administration) : non testés automatiquement, faute de session de test dans l'environnement d'audit.
- Tests automatisés : seules les règles de mesures sont testées.
- Fonctions `apply_scope_rules` et `apply_order_audit` : contrôle de rôle ajouté le 2026-10-19 (migration `20261019110000`), appliquée.
- Performance : pas d'analyse des requêtes lentes (aucun avertissement de performance remonté par Supabase au moment de l'audit).
