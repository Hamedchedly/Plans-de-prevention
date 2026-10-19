# Plans de prévention S11

Application interne de gestion des plans de prévention du secteur S11 : import des commandes, périmètre, qualification, fiche de prévention, export PDF, envoi, retour et archivage.

**Version stable : 2026-10-19** · Branche de développement : `claude/plans-prevention-s11` · Déploiement : `main` (Vercel)

## Fonctionnalités

- **Commandes** : liste avec regroupement (sans regroupement, par lot, par mots-clés), tri par colonne, barre d'avancement par chargé, couleurs selon l'ancienneté, corbeille.
- **Fiche de prévention** : assistant en trois étapes (natures et lots, risques et mesures, entreprise et date), éditeur avancé, prévisualisation, PDF une page au modèle, export ZIP groupé.
- **Suivi** : envoi par mailto, confirmation d'envoi, retour reçu (signée), archivage manuel ou automatique (6 mois).
- **Périmètre** : règles GT / GE / CP / AC, demandes d'exclusion avec décision, réaffectation journalisée.
- **Import** : commandes et suivi budgétaire (Excel) ; audit importé appliqué automatiquement ; analyse des doublons sur tous les imports.
- **Référentiel** : chargement, export et import (JSON) ; date du dernier chargement.
- **Administration** (responsables et Super Admin) : Données (import, base, périmètre, référentiels, entreprises), Contrôle (alertes, validations, entreprises, traçabilité), Paramétrage (modèles, noms de fichiers, utilisateurs et chargés). Pastilles pour les actions à traiter.
- **Indicateurs chargés** (responsables et Super Admin) : avancement par chargé, filtre de la barre.

## Rôles

| Rôle | Accès |
|---|---|
| Chargé d'opérations | Ses commandes ; fiches ; propositions d'entreprises |
| Responsable | Tout le périmètre ; administration (sauf comptes) ; indicateurs |
| Super Admin | Tout, dont utilisateurs, entreprises, traçabilité, impersonation (journalisée) |

## Stack

- Front : React 19, TypeScript, Vite 5, Tailwind CSS, lucide-react, TanStack Router (adresses), pdf-lib, xlsx, jszip
- Données : Supabase (PostgreSQL, schéma `plans_prevention`, RLS, fonctions SQL), authentification Supabase
- Fonctions Edge : `supabase/functions/invite-user`, `supabase/functions/impersonate`
- Hébergement : Vercel (réécriture SPA dans `app/vercel.json` et `vercel.json`)

## Démarrage

```bash
cd app
cp .env.example .env.local     # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (clé publishable uniquement)
npm install
npm run dev
```

Scripts :

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification de types puis build de production |
| `npm run lint` | Lint (0 erreur attendue) |
| `npm test` | Tests unitaires (règles de mesures) |

## Base de données

- Migrations de la base S11 : `supabase/s11/migrations/` (à appliquer dans l'ordre des dates). Le dossier `supabase/migrations/` contient l'historique du projet initial (V6) et ne décrit pas la base S11.
- Référentiel intégré : `app/src/data/referentiel_v4.json` (lots, risques, mesures, natures, vocabulaire, alertes).
- La clé `service_role` n'est utilisée que dans les fonctions Edge, jamais dans l'application.

## Documentation

- `docs/FEUILLE_DE_ROUTE_S11.md` : statut de chaque fonctionnalité, version stable, étapes restantes
- `docs/AUDIT_CODE_S11.md` : audit de code et de sécurité du 2026-10-19
- `docs/COMPILATION_FONCTIONNALITES.md` : liste détaillée des fonctionnalités (historique)
- `docs/DATA_MODEL.md`, `docs/ARCHITECTURE.md` : modèle de données et choix techniques (historiques, à relire avant modification du schéma)

## Versions stables

Les versions stables sont des branches figées, les tags étant refusés par le dépôt :
- `stable/s11-main-d56fcb8`, `stable/s11-b70aaaf` : versions précédentes
- `backup/s11-20261019-0030` : sauvegarde du 2026-10-19 (version stable annoncée)

## Limites connues

- Parcours connectés non couverts par des tests automatiques (vérifications manuelles dans le navigateur).
- Invitations des chargés sans compte et relances : à venir.
- Relances d'envoi, notifications et signature électronique : prévues en V2.
- Le portail entreprise est prévu en V2 ; l'envoi reste manuel par mailto.
