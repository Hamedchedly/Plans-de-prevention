# Feuille de route — Plans de prévention S11

Dernière mise à jour : 2026-10-18. Statut : **Fait** (codé et poussé sur `main`, pas toujours testé en navigateur), **Partiel**, **À faire**.

## Parcours d'une commande

| Étape | Statut | Où |
|---|---|---|
| Import des commandes (Excel) | Fait | Import |
| Périmètre (IN_SCOPE / OUT_OF_SCOPE), demande d'exclusion et décision | Fait | Commandes → « Demander l’exclusion » |
| Réaffectation à un autre chargé (journalisée) | Fait | Commandes → panneau d'actions |
| Corbeille (aucune suppression physique), restauration | Fait | Commandes → Corbeille |
| Qualification : nature (moteur de recherche + vocabulaire métier) et lots | Partiel | Assistant de fiche ; vocabulaire à enrichir |
| Risques et mesures (proposés, modifiables) | Fait | Assistant de fiche, étape 2 |
| Entreprise et date d'intervention (case « à renseigner par l’entreprise ») | Fait | Assistant de fiche, étape 3 |
| Validation : la fiche est créée (statut « Fiche créée ») même sans export | Fait | Assistant → « Valider et créer » |
| Prévisualisation, modification, téléchargement PDF d'une fiche créée | Fait | Commandes → icônes |
| Export ZIP groupé (nom selon le modèle défini par le Super Admin) | Fait | Commandes → sélection → ZIP |
| Éditeur avancé (natures, lots, mesures détaillées) | Fait | Commandes → icône « Éditeur avancé » |
| Envoi par mailto | À faire | — |
| Confirmation d'envoi et retour de l'entreprise | À faire | — |
| Relances | À faire | — |
| Archivage de la fiche terminée | Partiel | Onglet « Archivées » existant, flux à compléter |
| Notifications | À faire | — |
| Délégation à un autre chargé | Partiel | Réaffectation de la commande ; délégation de fiche à faire |
| Signature | À faire | — |

## Données et référentiels

| Sujet | Statut |
|---|---|
| Entreprises : modification directe par le Super Admin (journalisée) et propositions validées | Fait |
| Identité des utilisateurs (nom, prénom, téléphone, mail) | Fait |
| Période d'intervention par défaut (date de commande + 2 mois), modifiable | Fait |
| Correspondance corps d'état → lots NAAC, alerte pour les corps non rattachés | Fait |
| Arbre des lots NAAC (GT / GE / CP) : verdict donné | En attente de validation |
| Synonymes métier pour la recherche de natures | Partiel (quelques entrées ajoutées) |

## Administration

| Sujet | Statut |
|---|---|
| Se connecter à la place d'un utilisateur (Super Admin, journalisé) | Fait, non testé en navigateur |
| Inviter un utilisateur (lien à envoyer, premier accès avec mot de passe et identité) | Fait, non testé en navigateur |
| Modèle du nom de fichier PDF | Fait |
| Modèle de mail et de PDF modifiable par l'administrateur | À faire |
| Tableaux de bord KPI (responsable, Super Admin) | À faire |
| Complétude du journal d'audit (connexions) | Partiel |
| Périodes prédéfinies (2 semaines, 1 mois … 1 an, tout) | Fait |

## Qualité

| Sujet | Statut |
|---|---|
| Vérification de type et build à chaque livraison | Fait |
| Tests de parcours (navigateur) : création, modification, export, impersonation, invitation | À faire |
| Stabilisation et tests automatisés | À faire |
| Version V2 : portail entreprise | À faire |

## Questions ouvertes
- Contact « Personne à alerter » du PDF : rédacteur courant ou contact fixe du secteur ?
- Arbre NAAC : validation du verdict (une même famille de corps d'état, la famille de la commande décide).
