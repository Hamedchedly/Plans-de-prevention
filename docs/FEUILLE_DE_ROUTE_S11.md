# Feuille de route — Plans de prévention S11

Dernière mise à jour : 2026-10-19. Statut : **Fait** (codé et poussé sur `main`), **Partiel**, **À faire**.
Les mentions « non testé en navigateur » signifient que le code a été vérifié (types, build) mais pas parcouru connecté.

## Version stable — 2026-10-19

- Branche de référence : `main` (copie figée : `stable/s11-<commit>`, sauvegarde : `backup/s11-20261019-0030`).
- Contenu : parcours complet d'une commande (import, périmètre, qualification, fiche, PDF, envoi, retour, archivage), administration sur trois groupes, indicateurs chargés, audit importé, analyse des doublons, référentiel exportable et rechargeable.
- Correctifs de sécurité de la veille : voir `docs/AUDIT_CODE_S11.md`.
- Limites connues : parcours connectés non testés automatiquement ; invitations des chargés sans compte et relances non disponibles ; logique de risques et mesures pour les commandes sans fiche non disponible.

## Parcours d'une commande

| Étape | Statut | Où |
|---|---|---|
| Import des commandes (Excel), mise à jour des données source sans toucher aux décisions | Fait | Administration › Import Excel |
| Application de l'audit importé (envoyé / signé) aux commandes nouvelles ou non qualifiées | Fait, non testé en navigateur | Import des commandes (automatique) |
| Analyse des doublons sur tous les imports (répétés dans un fichier, présents dans plusieurs imports) | Fait, non testé en navigateur | Administration › Import Excel, en bas de page |
| Périmètre (IN_SCOPE / OUT_OF_SCOPE), demande d'exclusion et décision | Fait | Commandes → « Demander l’exclusion » |
| Périmètre GT, GE, CP, AC (HO exclu) ; commandes exclues à la main réintégrables | Fait | Commandes → menu « ⋯ » |
| Réaffectation à un autre chargé (journalisée) | Fait | Commandes → panneau d'actions |
| Corbeille (aucune suppression physique), restauration | Fait | Commandes → Corbeille |
| Qualification : natures multiples par lot, recherche de lots, vocabulaire métier | Fait, non testé en navigateur | Assistant de fiche, étape 1 |
| Risques et mesures (proposés, modifiables, recherche et ajout) | Fait, non testé en navigateur | Assistant de fiche, étape 2 |
| Entreprise (nom obligatoire) et date d'intervention | Fait, non testé en navigateur | Assistant de fiche, étape 3 |
| Corrections d'entreprise saisies par un chargé : envoyées au Super Admin, valider / modifier / refuser | Fait, non testé en navigateur | Administration › Entreprises (Contrôle) |
| Validation : la fiche est créée (statut « Fiche créée ») | Fait | Assistant → « Valider et créer » |
| Prévisualisation, modification, téléchargement PDF d'une fiche créée | Fait | Commandes → icônes |
| Fiche PDF au modèle (une page, logo, risques et mesures cochés, bas de page) | Fait, à valider en impression | Export PDF et ZIP |
| Export ZIP groupé (nom selon le modèle défini par le Super Admin) | Fait | Commandes → sélection → ZIP |
| Éditeur avancé (natures, lots, mesures détaillées) | Fait | Commandes → « Éditeur avancé » |
| Regroupement de la liste (sans regroupement, par lot, par mots-clés), tri par colonne, groupes repliés | Fait, non testé en navigateur | Commandes |
| Envoi par mailto (objet et corps modifiables, PDF joint à la main) | Fait, non testé en navigateur | Commandes → « Envoyer par mail » |
| Confirmation d'envoi (statut « Envoyée ») | Fait, non testé en navigateur | Commandes → icônes de la ligne |
| Retour reçu : fiche « Signée », puis archivage manuel ou automatique après 6 mois | Fait, non testé en navigateur | Commandes → onglet « Signées » |
| Archivage automatique : sans action après 6 mois (obsolète, gris), envoyée sans retour (orange), signée (vert) | Fait | Automatique à l'ouverture de la liste |
| Couleurs de ligne : rouge après 1 mois sans action | Fait | Commandes |
| Barre d'avancement empilée (attente, plan fait, envoyé, signé) par chargé, ou pour l'ensemble en vue responsable | Fait, non testé en navigateur | Commandes, en haut de la liste |
| Relances d'envoi | À faire (v2) | — |
| Notifications | À faire (v2) | — |
| Délégation à un autre chargé | Fait | Action « Réaffecter » sur ses propres commandes |
| Signature électronique | À faire (v2) | — |
| Risques et mesures des commandes sans fiche (natures à correspondance sûre) | À faire | Décision prise : natures sûres pré-remplies, le reste laissé au chargé |

## Navigation et interface

| Sujet | Statut |
|---|---|
| Navigation par adresses (`/commandes`, `/commandes/:numéro`, `/indicateurs`, `/administration/:page`) conservée à l'actualisation | Fait ; rafraîchissement corrigé en production par une réécriture SPA (`app/vercel.json`), à confirmer après déploiement |
| Barre de navigation en haut ; utilisateur et déconnexion à droite | Fait, non testé en navigateur |
| Administration en trois groupes (Données, Contrôle, Paramétrage) ; pages du groupe en seconde ligne | Fait, non testé en navigateur |
| Pastilles des pages et groupes ayant des actions à traiter (alertes, validations) | Fait, non testé en navigateur |
| Titre de l'onglet « PN - Plans de prévention » | Fait |
| Filtres de la liste (secteur, recherche, période, chargé) dans l'adresse | À faire |

## Données et référentiels

| Sujet | Statut |
|---|---|
| Entreprises : modification directe par le Super Admin (journalisée) et propositions validées ; page dans Contrôle | Fait |
| Identité des utilisateurs (nom, prénom, téléphone, mail) | Fait |
| Pré-remplissage des chargés sans compte (identité déduite du code, à corriger dans Utilisateurs) | Fait ; codes proposés à vérifier : DBOGNI, CCARON, LCHARBONNIER, QTRIBAULT, SHERAULT |
| Invitation des chargés sans compte : saisie du mail, envoi du lien, relances (nouvelle fonction Edge, car l'invitation existante refuse un compte déjà créé) | À faire |
| Référentiel : date du dernier chargement, export JSON, import d'un fichier au même format | Fait, non testé en navigateur |
| Référentiel : chargement lit le référentiel intégré, relançable sans doublon | Fait |
| Périodes d'intervention par défaut (date de commande + 2 mois), modifiables | Fait |
| Correspondance corps d'état → lots NAAC, alerte pour les corps non rattachés | Fait |
| Arbre des lots NAAC (GT / GE / CP) : verdict donné | En attente de validation |
| Synonymes métier pour la recherche de natures | Partiel |

## Administration

| Sujet | Statut |
|---|---|
| Se connecter à la place d'un utilisateur (Super Admin, journalisé) | Fait, non testé en navigateur |
| Utilisateurs et chargés fusionnés ; filtre de la barre par chargé dans les indicateurs | Fait, non testé en navigateur |
| Modèle du nom de fichier PDF ; modèles de mail et de PDF | Fait |
| Journal des connexions | Fait pour les connexions futures |
| Indicateurs chargés (responsables et Super Admin), exports CSV | Fait, non testé en navigateur |

## Qualité et sécurité

| Sujet | Statut |
|---|---|
| Vérification de type, build, tests unitaires (6) | Fait |
| Lint : 0 erreur, 15 avertissements à traiter | Partiel (voir audit) |
| Audit de code et de sécurité de la base | Fait le 2026-10-19 (`docs/AUDIT_CODE_S11.md`) |
| Fonctions sensibles non appelables anonymement ; `promote_super_admin` retirée des droits client | Fait le 2026-10-19 |
| Protection des mots de passe compromis (réglage Supabase Auth) | À faire |
| Contrôles de rôle dans `apply_order_audit`, `apply_scope_rules` | À faire |
| Tests de parcours connectés (navigateur) | À faire |
| Tests automatisés des parcours et des fonctions SQL | À faire |

## Étapes et phases restantes

1. **Immédiat (avant diffusion large)** : confirmer le déploiement Vercel (rafraîchissement, titre) ; activer la protection des mots de passe compromis ; ajouter le contrôle de rôle à `apply_order_audit` et `apply_scope_rules`.
2. **Parcours connecté à valider** : création et validation de fiche, export PDF et ZIP, envoi, retour et archivage, administration, indicateurs, import et doublons, référentiel export / import.
3. **Invitations des chargés** : mail d'invitation, date d'envoi, relance tant que le compte n'est pas finalisé.
4. **Commandes sans fiche** : pré-remplissage des natures à correspondance sûre ; le reste reste à la main du chargé.
5. **Filtres dans l'adresse** de la liste (secteur, recherche, période, chargé).
6. **Qualité** : traiter les avertissements de lint (chargement dans les effets), tests automatisés des fonctions SQL et des parcours.
7. **V2** : relances d'envoi, notifications, signature électronique, portail entreprise.

## Questions ouvertes
- Périmètre : cinq commandes (dont 5132524 et 5132234 exclues manuellement) sont hors périmètre depuis la règle GT/GE/CP du 18/10 ; décision à prendre.
- Arbre NAAC : validation du verdict (une même famille de corps d'état, la famille de la commande décide).
- Contact « Personne à alerter » du PDF : tant que les vingt chargés créateurs ne sont pas inscrits, le PDF affiche « Responsable d’intervention ».
