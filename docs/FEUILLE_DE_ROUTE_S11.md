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
| Fiche PDF au modèle : logo du bailleur, couleurs, tableaux, risques et mesures cochés, bas de page (entreprise, signature) | Fait, à valider en impression | Export PDF et ZIP |
| Export ZIP groupé (nom selon le modèle défini par le Super Admin) | Fait | Commandes → sélection → ZIP |
| Éditeur avancé (natures, lots, mesures détaillées) | Fait | Commandes → icône « Éditeur avancé » |
| Envoi par mailto (objet et corps modifiables, PDF joint à la main) | Fait, non testé en navigateur | Commandes → « Envoyer par mail » |
| Confirmation d'envoi (statut « Envoyée ») et retour de l'entreprise (archivage) | Fait, non testé en navigateur | Commandes → icônes de la ligne |
| Relances | À faire (v2) | — |
| Archivage de la fiche terminée | Partiel | Onglet « Archivées » existant, flux à compléter |
| Notifications | À faire (v2) | — |
| Délégation à un autre chargé | Fait | Le chargé clique sur l'action puis « Réaffecter » sur ses propres commandes |
| Signature | À faire (v2) | — |

## Données et référentiels

| Sujet | Statut |
|---|---|
| Entreprises : modification directe par le Super Admin (journalisée) et propositions validées | Fait |
| Identité des utilisateurs (nom, prénom, téléphone, mail), saisie par le Super Admin ou à l'inscription | Fait |
| « Personne à alerter » du PDF = chargé ayant créé la commande ; liste des chargés groupée (actif complet, actif incomplet, inactif, non inscrit) | Fait |
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
| Modèles de mail et de PDF modifiables (Super Admin) | Fait, non testé en navigateur |
| Tableaux de bord KPI (responsable, Super Admin) | Fait, non testé en navigateur |
| Journal des connexions (une entrée par session de navigateur) | Fait pour les connexions futures ; historique antérieur absent |
| Périodes prédéfinies (2 semaines, 1 mois … 1 an, tout) | Fait |

## Qualité

| Sujet | Statut |
|---|---|
| Vérification de type et build à chaque livraison | Fait |
| Tests de parcours (navigateur) : création, modification, export, impersonation, invitation | À faire (aucun parcours vérifié à l'écran) |
| Stabilisation et tests automatisés | À faire |
| Version V2 : portail entreprise | À faire |

## Questions ouvertes
- Contact « Personne à alerter » du PDF : c'est le chargé qui a créé la commande. Vingt chargés créateurs ne sont pas encore inscrits : tant qu'ils ne le sont pas, le PDF affiche « Responsable d’intervention ».
- Périmètre : cinq commandes (dont 5132524 et 5132234 exclues manuellement) sont hors périmètre depuis la règle GT/GE/CP du 18/10 ; décision à prendre.
- Arbre NAAC : validation du verdict (une même famille de corps d'état, la famille de la commande décide).
