# CAHIER DES CHARGES — APPLICATION PLANS DE PRÉVENTION
Version 1.1 — 18/09/2026

## 1. Vision
Application interne qui transforme des exports Excel de commandes et de suivi travaux en workflow de plans de prévention : import → rapprochement → qualification corps d'état → préremplissage → risques/mesures → validation → aperçu → PDF → mailto → confirmation envoi → réception → relance → archivage.

Portail entreprise = V2 indépendante, hors périmètre V1.

## 2. Sources Excel
### ANM_COMD_TRAV_ER
WPATRIMOINE=code patrimoine; PERC_SECTEUR=ID secteur; INTC_CODE=code intervention; COMC_NOLIG=ligne budget/année; COMN_NUM=n° commande; W_COMD_AVENANT=ignoré V1; UTIC_CODE=ID chargé op; ENTN_NUM=ID fournisseur/entreprise/ISIS; COMD_DATE=date commande; BAIN_NUM=ignoré; NAAC_CODE=CP/GT/GE; FRAN_NUM=CF; FRAN_NUM_CPT=compte analytique; COMC_ETAT=source conservée/non bloquante; COMN_MT_DEVIS=montant TTC; W_MT_RAPPRO=rapproché; W_MT_ECART=écart; WINDCOL/B_MORE/B_IMP/W_SELECTION=ignorés; WNOM_ADRESSE=tranche; WADRESSE=adresse chantier; WCOMMUNE=CP/ville; WNATURE=nature travaux; WNOTES=description travaux.

### ANM_SUIVTRXSECT
D=corps d'état; J=corps d'état/libellé redondant; E=secteur; G=code source chargé/clientèle; H=adresse; I=CP/GT/GE; K=chargé op; L=nature/descriptif travaux; N=ligne budgétaire; O=n° commande; P=ID entreprise; Q=nom entreprise; R=engagé; S=payé; T=solde; U=statut travaux; V=début travaux; W=fin travaux; Z=date commande.

## 3. Rapprochement
Le Super Admin est le seul à importer les exports.
Pour chaque commande, rechercher COMN_NUM dans le suivi. Si trouvé, récupérer le(s) corps d'état et les données disponibles. Si absent, alerte `NOT_IN_BUDGET_TRACKING` + onglet `À QUALIFIER`. Le chargé sélectionne un ou plusieurs corps d'état via liste multi-sélection avec recherche et ajout. Le choix est enregistré et l'alerte est résolue. Une commande absente du suivi n'est jamais supprimée.

Le suivi contient des lignes sans COMN_NUM : ne pas les rattacher automatiquement à la commande précédente. Conserver la ligne brute et signaler les ambiguïtés.

## 4. Détection corps d'état
Ordre : suivi → table INTC_CODE si validée → WNATURE → WNOTES → combinaison. En cas de doute/ambiguïté, demander au chargé une sélection multiple. La qualification manuelle prime.

## 5. Référentiel corps d'état initial
0100 Aménagement logement; 0101 Maçonnerie; 0102 Réfection voirie et abords; 0103 Travaux divers, espaces extérieurs; 0201 Etanchéité terrasse, couverture; 0202 Etanchéité façade; 0203 Isolation thermique; 0204 Fenêtre, vasistas; 0301 Menuiserie; 0302 Serrurerie; 0303 Porte box; 0401 Revêtement de sol; 0501 Gouttières, descentes EP; 0503 Plomberie; 0601 Chauffage désembouage, TRX ANNE... (libellé à confirmer); 0802 Ascenseur; 0804 Divers communs; 0828 Sécurité et vidéo surveillance; 0829 Honoraires. Référentiel modifiable par Responsable/Super Admin.

## 6. Entreprises
ENTN_NUM = ISIS. Une entreprise peut avoir plusieurs contacts, emails et contacts OS. Une ou plusieurs adresses/emails peuvent être `CONTACT_OS`; un contact OS par défaut est utilisé pour les nouveaux envois. Si nom/email manque : alerte à côté de l'ISIS. Si nom présent : nom affiché en priorité, ISIS secondaire. Le chargé peut ajouter prénom/nom/rôle/email/téléphone et enregistrer dans la base commune.

## 7. Utilisateurs
SUPER_ADMIN : `superadmin / superadmin`, accès total, imports, utilisateurs, données, modèles, audit.
RESPONSABLE : accès global, agit à la place des chargés ; ses actions de substitution créent une notification.
CHARGE_OPERATIONS : `user / user`, accès à ses commandes et délégations ; renseigne corps d'état/date, plan, risques, aperçu, PDF, mailto et confirmations autorisées.
En production, forcer le changement des comptes bootstrap et utiliser Supabase Auth pour les mots de passe.

Délégation : X peut traiter Y/Z avec droits configurables. Toujours distinguer propriétaire métier et auteur réel.

## 8. Dashboard utilisateur
KPI : commandes sans plan, plans envoyés, retours reçus, à qualifier, à relancer.
Filtres : dernière semaine, dernier mois, personnalisé, entreprise, corps d'état, statut, commande, nature.
Regroupement : entreprise / corps d'état / aucun.
Onglets : À qualifier / Commandes sans plan / Plans envoyés / Plans reçus / Archives.
Table : sélection, n° commande, date commande, descriptif/nature, corps d'état, entreprise, ISIS, risques, mesures, alertes, statut, actions.
Actions : aperçu, modifier, valider/envoyer, confirmer envoi, confirmer réception, relancer, archiver.
Multisélection : générer plusieurs PDF, préparer plusieurs mailto, confirmations groupées, archivage.

## 9. Dashboard S11
Même structure, mais périmètre S11 du chargé. Exemple fourni dans `EXEMPLE_DASHBOARD_S11.xlsx`. Le fichier source analysé contient 1 379 lignes, 76 lignes S11 et 55 numéros de commande renseignés dans S11. Une partie des lignes n'a pas de numéro : ce sont des lignes sources à traiter avec prudence.

## 10. Plan
Le chargé renseigne au minimum corps d'état + date/période. Préremplir depuis commande/entreprise/profil/référentiel. Recherche de nature avec recherche, filtre, sélection, ajout.

## 11. Risques
Moteur : corps d'état + nature + description/contexte. Le référentiel initial est `REFERENTIEL_RISQUES_PLANS_PREVENTION.xlsx`. Les propositions peuvent être corrigées par l'utilisateur. Validation humaine avant envoi.

## 12. PDF
Source initiale : feuille `FICHE DE PREVENTION` de `PLAN_DE_PREVENTION.xlsx`. Conserver disposition, tableaux, cases et design. Le modèle est administrable par Super Admin via blocs versionnés : SECTION, TEXT, FIELD, CHECKBOX, RISK_TABLE, MEASURE_TABLE, TABLE, IMAGE, SIGNATURE, SPACER. Un PDF conserve la version du modèle utilisée.

## 13. Mailto
Super Admin édite le modèle de mail. Variables : entreprise, contact, commande, nature, corps d'état, secteur, plan, chargé, date intervention. V1 : mailto uniquement. Mailto préremplit destinataire/objet/corps mais ne garantit pas la pièce jointe. Workflow : PDF → disponibilité → mailto → utilisateur joint PDF → confirmation manuelle.

## 14. Envoi/réception/relance
Envoi : date, auteur, commentaire. Réception : date, auteur, commentaire/document éventuel. Relance individuelle ou multi-sélection via mailto. Ne jamais considérer l'ouverture de mailto comme preuve d'envoi.

## 15. Archivage
Archiver envois/retours antérieurs à une date. Archiver ≠ supprimer. Vue Archives et désarchivage selon droits.

## 16. Page Super Admin — contrôle corps d'état
Afficher code, désignation, commandes, natures, risques, mesures, complétude, alertes, dernière modification. Permettre contrôle et modification du référentiel et vérification des mesures de sécurité.

## 17. Notifications / audit
Toutes mutations sensibles sont auditables. Responsable agissant pour un chargé → notification. Super Admin agissant pour un chargé → pas de notification de substitution.

## 18. Architecture métier
Tables : users, profiles, companies, company_contacts, company_os_contacts, orders, order_source_records, order_reconciliation, order_trades, trade_catalog, nature_catalog, risk_catalog, measure_catalog, nature_risk_rules, nature_measure_rules, prevention_plans, prevention_plan_risks, prevention_plan_measures, delegation_permissions, email_templates, plan_templates, plan_template_versions, plan_template_blocks, imports, import_rows, workflow_events, notifications, audit_logs, archive_records.

## 19. V2
Portail entreprise indépendant : lien expirable, consultation, date intervention, validation/signature. Ne pas le développer en V1.

## 20. Phases
0 analyse Excel + modèle DB; 1 Auth/RLS; 2 imports/entreprises/commandes/rapprochement; 3 dashboard; 4 référentiels/moteur risques; 5 plan/PDF; 6 signature/mailto/envoi/réception/relance; 7 délégation/notifications/audit; 8 administration/éditeurs; 9 archivage/tests/sécurité.
