# 📋 Fonctionnalités Détaillées

## Vue d'Ensemble

L'application Plans de Prévention V6 est une solution **100% HTML/JS** pour:
- 📊 Importer les commandes Excel (ANM_COMD_TRAV_ER_6.xlsx)
- 🔍 Filtrer par opérateur, secteur, statut
- ✏️ Valider et éditer les détails
- ☑️ Sélectionner les mesures de sécurité
- 📄 Générer un aperçu PDF A4
- 📥 Exporter en PDF ou marquer comme envoyé

---

## Page 1: Accueil - Gestion des Commandes

### Import Données

**Deux méthodes**:

1. **Charger Excel** (fichier ANM_COMD_TRAV_ER_6.xlsx)
   - Sélectionnez le fichier via input file
   - Parsing avec SheetJS (XLSX.js)
   - Extraction colonnes: COMD_NUM, ENTN_NUM, UTIC_CODE, secteur, TRAV_LIBELLE, TRAV_MONTANT, etc.
   - Support jusqu'à 867+ commandes
   - Fusion avec données existantes
   - Statut affiché en temps réel

2. **Utiliser Données Test**
   - 20 commandes d'exemple pré-chargées
   - 3 opérateurs (CKO, DBM, AQL)
   - 3 secteurs (S11, S21, S31)
   - 14 risques et 27 mesures intégrées
   - Permet tester sans fichier Excel

### Filtres & Recherche

**3 filtres combinables**:

1. **Chargé d'opération** (dropdown)
   - Généré automatiquement à partir des données
   - Affiche opérateur code et nom
   - Filtre en temps réel
   
2. **Secteur** (dropdown)
   - Liste unique des secteurs
   - S11, S21, S31, etc.
   - Filtre cumulatif avec opérateur

3. **Statut** (dropdown)
   - "À envoyer" (pending)
   - "Envoyé" (sent)
   - Tous statuts par défaut

### Statistiques KPI

4 cartes affichant en temps réel:

1. **Total Commandes** - Nombre total filtré
2. **À envoyer** - Compte commandes avec statut pending
3. **Envoyés** - Compte commandes avec statut sent
4. **Montant Total** - Somme TTC des commandes filtrées

Mise à jour dynamique quand filtres changent.

### Tableau des Commandes

**Colonnes affichées**:
- N° Commande
- Nature des travaux
- Montant TTC (formaté en EUR)
- Entreprise
- Opérateur (UTIC_CODE)
- Statut (badge vert/orange)
- Action "Voir Détails"

**Fonctionnalités**:
- Tri: N/A (utiliser filtres)
- Pagination: N/A (scroll)
- Survol: surlignage gris
- Responsive: adapté mobile

---

## Page 2: Détails - Validation Commande

### Section 1: Information Commande

**Champs lecture seule**:
- N° Commande (auto depuis Excel)
- Chargé d'opération (UTIC_CODE auto)

**Autofill**: Automatiquement à partir des données Excel

### Section 2: Entreprise & Adresse

**Champs**:

1. **Entreprise** (lecture seule)
   - Auto-rempli depuis ENTR_LIBELLE
   - Code entreprise visible si nom manquant
   - Impossible à modifier

2. **Adresse** (modifiable)
   - Auto-rempli depuis TRAV_ADRESSE
   - Textbox éditable si détails manquants
   - Modifications sauvegardées dans localStorage
   - Persistent entre sessions

3. **Montant TTC** (lecture seule)
   - Auto-rempli depuis TRAV_MONTANT
   - Formaté en EUR (Intl.NumberFormat)

### Section 3: Description Travaux

**Champs**:

1. **Nature des Travaux** (lecture seule)
   - Auto-rempli depuis TRAV_LIBELLE
   - Ex: "Revêtement de façade"

2. **Description Détaillée** (modifiable)
   - Auto-rempli depuis TRAV_DESCRIPTIF
   - Textarea 4 lignes
   - Modifications sauvegardées
   - Utilisé dans aperçu PDF

### Section 4: Corps d'États (Métiers)

**Affichage**:
- Liste auto-générée basée sur nature de travail
- Exemple pour "Électricité": codes 0501
- Exemple pour "Toiture": codes 0701
- Checkboxes pour sélection

**Mapping automatique**:
```
Revêtement → 0201, 0301
Isolation → 0401, 0402
Électrique → 0501
Plomberie → 0601
Toiture → 0701
Maçonnerie → 0801
Charpente → 0901
Éclairage → 0501, 1001
```

**Sélection**:
- Optionnelle
- Sauvegardée par commande
- Affichée dans PDF

### Section 5: Mesures de Sécurité

**Liste complète**: 27 mesures (M001-M027)

**Exemples**:
- M001: Utiliser équipement de protection individuelle (EPI)
- M002: Mettre barrière de sécurité/garde-corps
- M003: Installer filet de protection anti-chute
- M004: Utiliser harnais de sécurité certifié
- M005: Respecter distance de sécurité électrique
- ...jusqu'à M027: Audit sécurité avant démarrage

**Interface**:
- 2 colonnes de checkboxes
- Hover effect (surlignage)
- Validations: Au minimum 1 mesure requise
- Sauvegarde automatique

**Persistance**:
- localStorage clé: `measures_{commandId}`
- Survive à fermeture navigateur

### Boutons Actions

1. **← Retour**
   - Revient à index.html
   - Conserve filtres URL
   
2. **👁️ Voir Aperçu PDF**
   - Valide: au moins 1 mesure sélectionnée
   - Sauvegarde adresse et description modifiées
   - Redirige vers preview.html?id=XXX

---

## Page 3: Aperçu - Visualisation PDF

### Format

**Dimensions**: A4 (210mm x 297mm)
**Orientation**: Portrait
**Marges**: 20mm partout
**Font**: Arial, 11pt

### Contenu

#### En-tête
```
═════════════════════════════════
        PLAN DE PRÉVENTION
  Document de prévention et sécurité
═════════════════════════════════
```

#### Section 1: Informations Commande
```
Numéro de Commande:      512001
Nature des Travaux:      Revêtement de façade
Entreprise:              Entreprise ABC SARL
Adresse du Chantier:     15 rue de la Paix, 75001 Paris
Montant:                 45 000,00 €
Description:             Travaux de ravalement et peinture...
```

#### Section 2: Corps d'États Impliqués
```
• 0201 - Métier correspondant
• 0301 - Métier correspondant
```

#### Section 3: Risques Identifiés
```
• R001 - Chute de hauteur
• R003 - Écrasement
• R005 - Brûlures
```

Détectés automatiquement basés sur nature de travail

#### Section 4: Mesures de Sécurité Cochées
```
✓ M001 - Utiliser équipement de protection individuelle
✓ M002 - Mettre barrière de sécurité/garde-corps
✓ M007 - Mise à la terre équipements
```

Affiche UNIQUEMENT les mesures sélectionnées avec ✓

#### Footer
```
Document généré le 30/09/2026
Plans de Prévention - Application de Gestion
```

### Responsive A4

- HTML exactement A4 dimensions
- Print-friendly CSS inclus
- Pas de coupes
- Pas de débordements
- Formattage table pour PDF

---

## Boutons Actions

### 📥 Télécharger PDF

**Action**:
- Utilise html2pdf.js
- Génère fichier: `plan-prevention-{order_number}.pdf`
- Formats: image JPEG, PDF A4, portrait
- Qualité: 0.98 (haute résolution)

**Résultat**:
- Fichier téléchargé dans Downloads
- Format PDF prêt à imprimer
- Taille: ~200-500 KB

### ✓ Marquer comme Envoyé

**Action**:
- Sauvegarde statut "sent" en localStorage
- Désactive le bouton
- Affiche message de confirmation
- Disparaît après 3s

**Mise à jour**:
- Dashboard index.html montre commande avec badge vert "✓ Envoyé"
- Statut persiste même après fermeture navigateur
- Les filtres mettent à jour automatiquement

### ✎ Retour Édition

**Action**:
- Revient à details.html?id=XXX
- Restaure tous les champs éditables
- Les modifications précédentes restent (localStorage)

---

## Gestion des Données

### localStorage

**Clés utilisées**:

1. `appData` (principal)
   ```json
   {
     "commands": [...867 items],
     "operators": ["CKO", "DBM", "AQL"],
     "sectors": ["S11", "S21", "S31"],
     "risks": [...14 items],
     "measures": [...27 items]
   }
   ```

2. `measures_{commandId}` - Mesures sélectionnées
   ```json
   ["M001", "M002", "M007"]
   ```

3. `trades_{commandId}` - Corps d'états sélectionnés
   ```json
   ["0201", "0301"]
   ```

4. `address_{commandId}` - Adresse modifiée
   ```
   "15 rue de la Paix, 75001 Paris (modifiée)"
   ```

5. `description_{commandId}` - Description modifiée
   ```
   "Description personnalisée du travail"
   ```

### Taille Limite

- localStorage: ~5-10MB par domaine
- Commandes: ~10 KB par commande
- Permet: ~500-1000 commandes complètes

### Sauvegarde Automatique

- Mesures: Au changement checkbox
- Adresse: Au changement input
- Description: Au changement textarea
- Statut: Au clic "Marquer comme Envoyé"

---

## Flux Complet d'Utilisation

```
1. ACCUEIL (index.html)
   ↓ Charger Excel ou Données Test
   ↓ Filtrer par opérateur
   ↓ Tableau met à jour
   ↓ Stats KPI mises à jour
   
2. CLIQUER "Voir Détails"
   ↓ DÉTAILS (details.html?id=XXX)
   ↓ Tous champs auto-remplis
   ↓ Valider/modifier adresse
   ↓ Valider/modifier description
   ↓ Sélectionner mesures (obligatoire)
   ↓ Mesures sauvegardées localStorage
   
3. CLIQUER "Voir Aperçu PDF"
   ↓ APERÇU (preview.html?id=XXX)
   ↓ Rendu PDF A4 complet
   ↓ Affiche infos + risques + mesures
   ↓ Prêt à télécharger ou envoyer
   
4. TÉLÉCHARGER ou ENVOYER
   ↓ PDF: Fichier téléchargé sur machine
   ↓ OU
   ↓ Envoyé: Statut changé, retour accueil
   ↓ Commande affiche "✓ Envoyé"
```

---

## Formats de Données

### Import Excel (ANM_COMD_TRAV_ER_6.xlsx)

Colonnes reconnues:
- COMD_NUM | N° Commande | Commande
- ENTN_NUM | Code Entreprise | Company_ID
- ENTR_LIBELLE | Nom Entreprise | Company_Name
- UTIC_CODE | Opérateur | Operator
- SECT_CODE | Secteur | Sector
- TRAV_LIBELLE | Nature | Work_Nature
- TRAV_DESCRIPTIF | Description | Work_Description
- TRAV_MONTANT | Montant | Amount_TTC
- TRAV_ADRESSE | Adresse | Address

### Export PDF

Format: PDF standard, printable A4

---

## Cas d'Usages Supportés

✅ 1 opérateur = 1 secteur  
✅ 1 opérateur = plusieurs secteurs  
✅ Plusieurs opérateurs = 1 secteur  
✅ Commande sans description (modifiable)  
✅ Commande sans adresse (modifiable)  
✅ Corps d'état auto-détecté  
✅ Risques auto-détectés  
✅ 27 mesures à sélectionner  
✅ Offline complet (pas d'API)  
✅ Statut persistent  

---

**Version**: 1.0  
**Dernière MAJ**: 2026-09-30
