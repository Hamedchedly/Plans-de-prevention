# COMPILATION FONCTIONNELLE — APPLICATION PLANS DE PRÉVENTION

Version : V6 — 18/09/2026
Périmètre : V1 interne
Portail entreprise : V2 indépendante

## 0. Principe directeur

L'application est un outil interne de gestion des plans de prévention basé sur les commandes de travaux.

Source maître des commandes :
`ANM_COMD_TRAV_ER`

Source de qualification/contrôle :
`ANM_SUIVTRXSECT`

Référentiel corps d'état :
`REFERENTIEL_CORPS_ETAT`

Référentiel initial risques/mesures/natures :
`REFERENTIEL_RISQUES_PLANS_PREVENTION`

Workflow :
Import Excel → filtrage métier → rapprochement suivi budgétaire → qualification corps d'état → enrichissement entreprise/contact → préremplissage → analyse risques → validation humaine → aperçu → PDF → mailto → confirmation envoi → confirmation retour → relances → archivage.

---

# 1. Filtrage des commandes administrable par Super Admin

## PAGE-21 — Règles de visibilité des commandes

Le Super Admin doit pouvoir définir les types de commandes que l'application conserve dans son périmètre opérationnel.

Exemple :
- inclure `GT`
- inclure `GE`
- inclure `CP`
- exclure les autres valeurs

La valeur de référence est principalement `NAAC_CODE` / nature budget.

### Configuration

Interface :

`Super Admin > Paramètres > Filtrage des commandes`

Options :
- liste des valeurs autorisées ;
- liste des valeurs exclues ;
- mode inclusif/exclusif ;
- activation/désactivation de la règle ;
- aperçu du nombre de commandes concernées ;
- date d'application ;
- auteur ;
- historique des changements.

### Comportement recommandé

Le filtrage doit être appliqué lors de l'import et/ou lors de la construction du périmètre métier, mais ne doit pas supprimer physiquement les lignes de la source importée.

Conserver :
- ligne source ;
- valeur originale ;
- règle appliquée ;
- statut `IN_SCOPE` ou `OUT_OF_SCOPE`.

Ainsi le Super Admin peut modifier ultérieurement la règle et réintégrer des commandes sans refaire nécessairement l'import source.

### Exemple

Si le Super Admin configure :

`GT + GE + CP`

alors :

| Commande | NAAC_CODE | Périmètre |
|---|---|---|
| 512001 | GT | ✓ |
| 512002 | GE | ✓ |
| 512003 | CP | ✓ |
| 512004 | AUTRE | Hors périmètre |

L'interface doit afficher éventuellement le nombre de commandes hors périmètre mais ne pas les mélanger aux commandes actives.

---

# 2. Import commandes

## PAGE-18

Colonnes source connues :

- WPATRIMOINE.ANA_COMD_TRAV_ER → Code patrimoine
- PERC_SECTEUR.ANA_COMD_TRAV_ER → ID secteur
- INTC_CODE.ANA_COMD_TRAV_ER → Code intervention
- COMC_NOLIG.ANA_COMD_TRAV_ER → Ligne budget / année
- COMN_NUM.ANA_COMD_TRAV_ER → N° commande
- W_COMD_AVENANT.ANA_COMD_TRAV_ER → hors périmètre V1
- UTIC_CODE.ANA_COMD_TRAV_ER → ID chargé op
- ENTN_NUM.ANA_COMD_TRAV_ER → ID entreprise/fournisseur
- COMD_DATE.ANA_COMD_TRAV_ER → Date commande
- BAIN_NUM.ANA_COMD_TRAV_ER → hors périmètre V1
- NAAC_CODE.ANA_COMD_TRAV_ER → Nature budget
- FRAN_NUM.ANA_COMD_TRAV_ER → CF
- FRAN_NUM_CPT.ANA_COMD_TRAV_ER → Compte analytique
- COMC_ETAT.ANA_COMD_TRAV_ER → hors périmètre V1
- COMN_MT_DEVIS.ANA_COMD_TRAV_ER → Montant TTC
- W_MT_RAPPRO.ANA_COMD_TRAV_ER → Montant rapproché
- W_MT_ECART.ANA_COMD_TRAV_ER → Écart
- WINDCOL.ANA_COMD_TRAV_ER → hors périmètre V1
- B_MORE.ANA_COMD_TRAV_ER → hors périmètre V1
- WNOM_ADRESSE.ANA_COMD_TRAV_ER → Nom tranche
- B_IMP.ANA_COMD_TRAV_ER → hors périmètre V1
- WADRESSE.ANA_COMD_TRAV_ER → Adresse chantier
- W_SELECTION.ANA_COMD_TRAV_ER → hors périmètre V1
- WCOMMUNE.ANA_COMD_TRAV_ER → CP + ville
- WNATURE.ANA_COMD_TRAV_ER → Nature travaux
- WNOTES.ANA_COMD_TRAV_ER → Description travaux

## Règles

- `COMN_NUM` est la clé métier commande.
- Les UUID restent les clés techniques DB.
- Les imports sont historisés.
- Les doublons sont détectés.
- Une réimportation doit être idempotente autant que possible.
- Les commandes hors périmètre restent historisées mais ne sont pas visibles dans le workflow actif.

---

# 3. Rapprochement avec le suivi budgétaire

## PAGE-19 — Contrôle suivi budgétaire

Source :
`ANM_SUIVTRXSECT`

Colonnes utiles :
- I : Nature budget CP/GT/GE
- D/J : Corps d'état
- E : Code secteur
- G : Code chargé clientèle
- H : Adresse
- K : Chargé clientèle
- L : Nature travaux
- N : Ligne budgétaire
- O : N° commande
- P : ID entreprise
- Q : Nom entreprise
- R/S/T : engagé/payé/restant
- U : Statut commande
- V/W : début/fin travaux
- Z : date commande

## Règle

Le fichier de suivi est une source de qualification/contrôle, pas la source maître.

Rapprochement prioritaire :
`COMN_NUM ↔ O`

Si trouvé :
- proposer corps d'état ;
- récupérer les informations complémentaires disponibles.

Si absent :
- placer la commande dans `À QUALIFIER` ;
- ne pas supprimer la commande.

## Onglet À QUALIFIER

Le chargé doit pouvoir :
- ouvrir la commande ;
- voir nature et description ;
- rechercher un corps d'état ;
- sélectionner plusieurs corps d'état ;
- ajouter un nouveau corps d'état si ses droits le permettent ;
- valider la qualification.

Après validation :
- enregistrer la source `MANUAL` ;
- retirer la commande de l'onglet À QUALIFIER ;
- intégrer la commande au workflow normal.

---

# 4. Détection automatique du corps d'état

## PAGE-08A

Sources de signal :
1. suivi budgétaire ;
2. INTC_CODE ;
3. nature travaux ;
4. description WNOTES ;
5. référentiel natures ;
6. historique des qualifications manuelles.

Le système produit une ou plusieurs propositions.

Exemple :

`Nature : remplacement de garde-corps`
`Description : dépose et pose de garde-corps métalliques`

Propositions :
- Serrurerie — confiance élevée
- Menuiserie — confiance moyenne

Si confiance insuffisante :
`⚠ Choix requis`

Le chargé sélectionne un ou plusieurs corps d'état.

Important : une commande peut avoir plusieurs corps d'état.

---

# 5. Référentiel corps d'état

## PAGE-20

Le référentiel contient notamment les codes fournis :

0100 Aménagement logement
0101 Maçonnerie
0102 Réfection voirie et abords
0103 Travaux divers, espaces extérieurs
0201 Etanchéité terrasse, couverture
0202 Etanchéité façade
0203 Isolation thermique
0204 Fenêtre, vasistas
0301 Menuiserie
0302 Serrurerie
0303 Porte box
0401 Revêtement de sol
0501 Gouttières, descentes EP
0503 Plomberie
0601 Chauffage / désembouage / travaux associés
0802 Ascenseur
0804 Divers communs
0828 Sécurité et vidéo surveillance
0829 Honoraires

Les libellés définitifs doivent rester modifiables.

## Super Admin

Peut :
- ajouter ;
- modifier ;
- désactiver ;
- gérer les risques ;
- gérer les mesures ;
- voir les natures associées ;
- voir le nombre de commandes ;
- vérifier la qualité du référentiel.

Vue recommandée :
Code | Corps d'état | Natures | Risques | Mesures | Commandes | Alertes | Complétude

---

# 6. Entreprises

## PAGE-14

Source :
`ENTN_NUM`

Chaque entreprise possède :
- code ISIS ;
- nom ;
- adresse ;
- contacts ;
- contacts OS ;
- adresses OS.

## Alertes

Si nom absent :
`⚠ Nom entreprise manquant`

Si email OS absent :
`⚠ Email OS manquant`

Le code ISIS reste toujours visible.

Dès que le nom existe :
le tableau affiche le nom en priorité.

## Contacts

Une entreprise peut avoir plusieurs contacts.

Chaque contact :
- prénom ;
- nom ;
- rôle ;
- email ;
- téléphone ;
- actif.

## Contacts OS

Une entreprise peut avoir une ou plusieurs adresses/contacts OS.

Plusieurs peuvent être marqués `OS_DEFAULT`.

Lors de l'envoi :
- proposer les contacts OS par défaut ;
- permettre une sélection ;
- permettre l'ajout d'un contact.

---

# 7. Chargés d'opérations

Chaque commande est rattachée à un `UTIC_CODE`.

Lors de la première connexion :
- le chargé crée son mot de passe ;
- renseigne son profil ;
- nom/prénom ;
- email ;
- téléphone ;
- fonction ;
- signature image.

Le Super Admin peut modifier toutes ces informations.

Audit :
- création compte ;
- première connexion ;
- dernière connexion ;
- modifications ;
- auteur des modifications.

---

# 8. Rôles

## SUPER_ADMIN

Tout accès.

## RESPONSABLE

Accès à toutes les commandes et KPI.
Peut agir à la place de n'importe quel chargé.

## CHARGE_OPERATIONS

Accès à ses commandes et commandes déléguées.

## Délégation

Un chargé X peut être autorisé à traiter Y/Z.

Distinguer :
- propriétaire métier ;
- auteur réel de l'action.

---

# 9. Dashboard chargé

## PAGE-02

### KPI

- commandes sans plan ;
- plans envoyés ;
- retours reçus ;
- à qualifier ;
- à relancer.

### Filtres

- 7 derniers jours ;
- 30 derniers jours ;
- période personnalisée ;
- entreprise ;
- corps d'état ;
- statut ;
- secteur.

La date de référence est `COMD_DATE` pour les commandes.

### Regroupements

- entreprise ;
- corps d'état ;
- aucun.

### Onglets

- Commandes sans plan ;
- Plans envoyés ;
- Plans reçus ;
- À qualifier ;
- Archives selon droits.

### Multisélection

- activer ;
- sélectionner tout ;
- sélectionner groupe ;
- actions groupées.

### Tableau

- Num commande
- Date commande
- Descriptif/Nature
- Corps d'état
- Entreprise
- ISIS
- Risques
- Mesures
- Alertes
- Source corps d'état
- Statut
- Actions

---

# 10. Plan de prévention

## PAGE-06

Le chargé renseigne :
- corps d'état ;
- date/période d'intervention.

Le système préremplit :
- commande ;
- entreprise ;
- ISIS ;
- nature ;
- descriptif ;
- chantier ;
- rédacteur ;
- téléphone ;
- email ;
- date rédaction.

Une commande multi-corps d'état peut produire une analyse combinée.

---

# 11. Recherche et ajout de natures

## PAGE-07

Recherche :
- texte ;
- corps d'état ;
- code ;
- correspondance partielle.

Ajout :
- nom ;
- description ;
- corps d'état ;
- risques ;
- mesures.

Les nouvelles natures peuvent être soumises à validation selon rôle.

---

# 12. Analyse risques

## PAGE-08

Entrées :
- corps d'état ;
- nature ;
- WNOTES ;
- contexte.

Sorties :
- risques ;
- mesures.

Le moteur doit proposer et jamais masquer la possibilité de correction humaine.

Un niveau de confiance doit être disponible.

Chaque proposition possède une source :
- référentiel ;
- règle ;
- analyse ;
- utilisateur.

---

# 13. Aperçu

## PAGE-09

Aperçu avant export.

L'utilisateur peut :
- cocher/décocher risques ;
- cocher/décocher mesures ;
- modifier champs autorisés ;
- visualiser le rendu réel.

Le rendu aperçu doit être le même moteur que le PDF final.

---

# 14. Export PDF

Le modèle initial vient de `FICHE DE PREVENTION`.

Le rendu doit conserver :
- disposition ;
- design ;
- tableaux ;
- cases ;
- typographie autant que possible ;
- zones ;
- signature.

Le modèle est versionné.

---

# 15. Editeur modèle PDF

## PAGE-17 — Super Admin uniquement

Blocs :
- SECTION
- TEXT
- FIELD
- CHECKBOX
- RISK_TABLE
- MEASURE_TABLE
- TABLE
- IMAGE
- SIGNATURE
- SPACER

Le Super Admin peut :
- ajouter ;
- supprimer ;
- déplacer ;
- redimensionner ;
- modifier libellés ;
- modifier source ;
- définir conditions ;
- prévisualiser ;
- publier une version.

Aucun code arbitraire.

Un plan généré conserve la version de modèle utilisée.

---

# 16. Signature chargé

Profil :
- importer signature ;
- aperçu ;
- remplacer ;
- supprimer.

Le PDF injecte automatiquement la signature dans la zone prévue.

---

# 17. Modèle de mail

## PAGE-16 — Super Admin

Variables :
- entreprise ;
- contact ;
- commande ;
- nature ;
- corps d'état ;
- secteur ;
- plan ;
- chargé ;
- date intervention.

Templates :
- premier envoi ;
- relance.

---

# 18. Envoi

## PAGE-10

V1 uniquement `mailto:`.

Le système :
1. génère le PDF ;
2. met le PDF à disposition ;
3. ouvre un mailto prérempli ;
4. l'utilisateur joint le PDF dans son client mail ;
5. l'utilisateur confirme ensuite l'envoi dans l'application.

Ne jamais déclarer automatiquement l'envoi comme effectué.

---

# 19. Confirmation d'envoi

Le chargé peut :
- confirmer après mailto ;
- confirmer un envoi réalisé en dehors de l'application ;
- saisir date d'envoi.

Historiser :
- auteur ;
- date ;
- plan ;
- commande.

---

# 20. Réception

Le chargé peut :
- confirmer reçu ;
- saisir date de réception ;
- commentaire.

Le statut devient `RECEIVED`.

Pas de lecture automatique des boîtes mail en V1.

---

# 21. Relances

## PAGE-13

- relance individuelle ;
- relance multiple ;
- date dernière relance ;
- compteur ;
- modèle mail ;
- mailto.

---

# 22. Archivage

## PAGE-12B

Permettre :
- archive avant une date ;
- sélection ;
- prévisualisation ;
- archivage ;
- consultation ;
- désarchivage selon droits.

Aucune suppression physique.

---

# 23. Notifications

Responsable agissant pour un chargé :
→ notification au chargé.

Super Admin agissant :
→ pas de notification de substitution.

Notifications :
- modification ;
- remplissage ;
- envoi ;
- retour ;
- alerte entreprise ;
- relance.

---

# 24. Dashboard Responsable

## PAGE-03

Accès :
- toutes commandes ;
- tous chargés ;
- tous KPI ;
- filtres ;
- regroupements ;
- actions à la place des chargés.

---

# 25. Dashboard Super Admin

## PAGE-04

Modules :
- KPI globaux ;
- utilisateurs ;
- entreprises ;
- contacts ;
- commandes ;
- imports ;
- référentiel corps d'état ;
- natures ;
- risques ;
- mesures ;
- règles ;
- modèle mail ;
- modèle PDF ;
- filtrage des commandes ;
- délégations ;
- notifications ;
- audit ;
- archivage.

---

# 26. Audit

Toutes les mutations sensibles :
- utilisateur ;
- commande ;
- entreprise ;
- contact ;
- plan ;
- risque ;
- mesure ;
- nature ;
- modèle ;
- règle de filtrage ;
- envoi ;
- réception ;
- archivage.

Conserver :
- auteur réel ;
- sujet/propriétaire ;
- avant ;
- après ;
- date ;
- action.

---

# 27. V2 indépendante

Portail entreprise hors V1.

V2 prévue :
- lien sécurisé ;
- expiration ;
- accès entreprise ;
- date intervention ;
- validation ;
- signature entreprise ;
- retour document.

La V1 ne doit pas dépendre techniquement du portail.

---

# 28. Règle de conception fondamentale

Les données importées ne doivent jamais être détruites pour appliquer une règle métier.

Exemple :
un Super Admin masque toutes les commandes hors GT/GE/CP.

Le système doit conserver la source et marquer :
`OUT_OF_SCOPE`.

Si demain le Super Admin ajoute `X` :
les commandes correspondantes peuvent redevenir actives.

