# Plans de Prévention - Application HTML Navigable

Application web simple et accessible pour gérer et exporter les plans de prévention en PDF.

## 🚀 Démarrage Rapide

1. **Ouvrez `index.html`** dans votre navigateur
2. **Chargez les données**:
   - Option A: Cliquez "Utiliser Données Test" (données fictives pré-chargées)
   - Option B: Importez un fichier Excel `ANM_COMD_TRAV_ER_6.xlsx` via le bouton "Charger Excel"
3. **Filtrez les commandes** par opérateur ou secteur
4. **Cliquez "Voir Détails"** sur une commande
5. **Remplissez/validez** les informations
6. **Cliquez "Voir Aperçu PDF"**
7. **Téléchargez le PDF** ou marquez comme envoyé

## 📁 Architecture

```
html_app/
├── index.html          # Page d'accueil - liste des commandes
├── details.html        # Page détails - validation et édition
├── preview.html        # Page aperçu - visualisation PDF avant export
├── css/
│   └── styles.css      # Styles Tailwind + custom
├── js/
│   ├── main.js         # Gestion d'état global et utilitaires
│   ├── import.js       # Import Excel avec SheetJS
│   ├── filter.js       # Filtrage et affichage tableau
│   ├── details.js      # Logique page détails
│   └── preview.js      # Génération PDF et export
├── data/
│   └── sample-data.json # Données fictives de fallback
└── README.md           # Ce fichier
```

## 🎯 Fonctionnalités Principales

### Page 1: Accueil (index.html)
- **Import Excel**: Charger `ANM_COMD_TRAV_ER_6.xlsx`
- **Données Test**: Utiliser 20 commandes d'exemple
- **Filtres**:
  - Par chargé d'opération (UTIC_CODE)
  - Par secteur
  - Par statut (À envoyer / Envoyé)
- **Statistiques**: Total, à envoyer, envoyés, montant total
- **Tableau**: Liste complète avec action "Voir Détails"

### Page 2: Détails Commande (details.html)
- **Champs auto-remplis** (lecture seule):
  - N° Commande
  - Opérateur
  - Entreprise
  - Montant
- **Champs modifiables**:
  - Adresse du chantier
  - Description des travaux
  - Corps d'états (métiers)
  - Mesures de sécurité (27 items à cocher)
- **Validation**: Au moins une mesure doit être sélectionnée
- **Sauvegarde**: Modifications stockées en localStorage

### Page 3: Aperçu PDF (preview.html)
- **Format A4**: Aperçu du document imprimable
- **Contenu**:
  - En-tête "Plan de Prévention"
  - Information commande (N°, nature, adresse, montant)
  - Corps d'états
  - Risques identifiés
  - Mesures cochées (avec ✓)
  - Date génération
- **Actions**:
  - 📥 Télécharger PDF
  - ✓ Marquer comme Envoyé
  - ✎ Retour Édition

## 📊 Données

### Import Excel
Supporte `ANM_COMD_TRAV_ER_6.xlsx` avec colonnes:
- `COMD_NUM` → N° Commande
- `ENTN_NUM` → Code Entreprise
- `ENTR_LIBELLE` → Nom Entreprise
- `UTIC_CODE` → Chargé d'opération
- `SECT_CODE` ou `secteur` → Secteur
- `TRAV_LIBELLE` → Nature des travaux
- `TRAV_DESCRIPTIF` → Description
- `TRAV_MONTANT` → Montant TTC
- `TRAV_ADRESSE` → Adresse

### Données de Fallback (sample-data.json)
```json
{
  "commands": [ /* 20 commandes d'exemple */ ],
  "operators": [ "CKO", "DBM", "AQL" ],
  "sectors": [ "S11", "S21", "S31" ],
  "risks": [ 14 risques R001-R014 ],
  "measures": [ 27 mesures M001-M027 ]
}
```

## 🔒 Stockage Données

**localStorage** utilisé pour:
- `appData` - Tous les commandes, opérateurs, secteurs, risques, mesures
- `measures_{commandId}` - Mesures sélectionnées par commande
- `trades_{commandId}` - Métiers/corps d'états par commande
- `address_{commandId}` - Adresse modifiée
- `description_{commandId}` - Description modifiée

**Aucune donnée n'est envoyée à un serveur** - tout reste en local.

## 🛠️ Technologies

- **HTML5** - Structure
- **CSS3 + Tailwind CDN** - Styling
- **Vanilla JavaScript** - Logique (pas de framework)
- **SheetJS (XLSX)** - Import Excel
- **html2pdf.js** - Export PDF côté client
- **localStorage** - Persistance données

## 📱 Compatibilité

- ✅ Chrome / Edge 88+
- ✅ Firefox 87+
- ✅ Safari 14+
- ✅ Mobile (responsive design)
- ⚠️ IE11 non supporté

## 🎓 Cas d'Usage

### Flux Complet
1. **Admin** charge `ANM_COMD_TRAV_ER_6.xlsx`
2. **Opérateur** filtre ses commandes (ex: CKO)
3. **Opérateur** ouvre une commande (ex: 512001)
4. **Opérateur** valide/complète les infos
5. **Opérateur** sélectionne mesures de sécurité
6. **Opérateur** génère PDF d'aperçu
7. **Opérateur** télécharge ou marque comme envoyé
8. **Dashboard** met à jour le statut

### Sans Internet
- Charge les données Excel une fois
- Toutes les opérations offline
- PDF généré entièrement côté client

## ⚙️ Configuration

### Ajouter Mesures Personnalisées
Modifier `data/sample-data.json`:
```json
{
  "code": "M028",
  "name": "Ma nouvelle mesure"
}
```

### Ajouter Risques
Même fichier:
```json
{
  "code": "R015",
  "name": "Nouveau risque"
}
```

## 🐛 Dépannage

### "Aucune donnée" affichée
→ Cliquez "Utiliser Données Test" ou chargez un Excel

### Les modifications ne persistent pas
→ Vérifiez que localStorage n'est pas désactivé

### PDF ne télécharge pas
→ Vérifiez que les popups ne sont pas bloquées

### Mesures non cochées
→ Sélectionnez au moins une mesure avant d'envoyer

## 📝 Notes

- Les données ne quittent jamais votre navigateur
- Chaque commande a ses mesures propres (localStorage)
- Statut "Envoyé" persiste même après fermeture
- Import Excel fusionne avec les données existantes
- Aucune suppression de données (marquer OUT_OF_SCOPE si nécessaire)

## 🔄 Mise à Jour

Pour mettre à jour les données:
1. Cliquez "Charger Excel" avec nouveau fichier
2. Les données existantes sont remplacées
3. Les mesures sélectionnées restent intactes

## 📧 Support

Pour questions ou bugs, vérifiez:
1. Console du navigateur (F12 → Console)
2. localStorage intact (F12 → Application → Storage)
3. JavaScript activé et XLSX/html2pdf.js chargés

---

**Version**: 1.0  
**Dernière mise à jour**: 2026-09-30  
**Licence**: Interne
