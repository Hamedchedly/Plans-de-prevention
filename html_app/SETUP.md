# 🚀 Configuration & Lancement

## Démarrage Rapide (< 1 minute)

### Option 1: Via Terminal (Recommandé)

```bash
cd /home/user/Plans-de-prevention/html_app

# Lancer un serveur web Python
python3 -m http.server 8888

# Ouvrir dans le navigateur
# → http://localhost:8888
```

**Avantages**:
- Pas de problèmes CORS
- Import Excel fonctionne parfaitement
- PDF génération fluide
- localStorage complètement fonctionnel

### Option 2: Via HTTP Node.js

```bash
cd /home/user/Plans-de-prevention/html_app

# Si http-server est installé
npx http-server -p 8888

# Sinon installer d'abord
npm install -g http-server
```

### Option 3: Fichier Local (Basique)

Ouvrez directement `index.html` dans le navigateur:
```
file:///home/user/Plans-de-prevention/html_app/index.html
```

⚠️ **Limitation**: Import Excel peut ne pas fonctionner à cause des restrictions CORS
→ Utilisez Option 1 (Python) pour la version complète

---

## Accès à l'Application

Une fois le serveur lancé, ouvrez dans le navigateur:

```
http://localhost:8888
```

**Vous verrez**:
1. En-tête bleu "Plans de Prévention"
2. Section import avec deux boutons:
   - "Charger Excel" (import fichier ANM_COMD_TRAV_ER_6.xlsx)
   - "Utiliser Données Test" (données fictives prédéfinies)
3. Filtres et statistiques
4. Tableau des commandes

---

## Premier Lancement

### Étape 1: Charger les données

**Option A: Données Test** (imm édiate, recommandée pour démo)
```
1. Cliquez "Utiliser Données Test"
2. Patientez 2-3 secondes
3. Tableau se remplira avec 20 commandes d'exemple
```

**Option B: Fichier Excel** (données réelles)
```
1. Cliquez "Charger Excel"
2. Sélectionnez: ANM_COMD_TRAV_ER_6.xlsx
3. Les 867 commandes seront chargées
```

### Étape 2: Filtrer une Commande

```
1. Dans "Chargé d'opération", sélectionnez "CKO"
2. Tableau se met à jour avec ~20 commandes CKO
3. Montant total se recalcule
```

### Étape 3: Voir Détails

```
1. Cliquez "Voir Détails" sur une commande
2. Page s'ouvre avec tous les champs pré-remplis
3. Vous pouvez modifier adresse et description
4. Sélectionnez des mesures de sécurité
```

### Étape 4: Aperçu PDF

```
1. Cliquez "Voir Aperçu PDF"
2. Une page A4 s'affiche avec le plan complet
3. Vous voyez tous les risques et mesures cochées
```

### Étape 5: Export

```
1. Cliquez "Télécharger PDF" → Fichier plan-prevention-XXXXX.pdf téléchargé
OU
2. Cliquez "Marquer comme Envoyé" → Statut change à "✓ Envoyé"
```

---

## Architecture Fichiers

```
html_app/
├── index.html              # Page accueil - POINT D'ENTRÉE
├── details.html            # Page détails commande
├── preview.html            # Page aperçu PDF
├── js/
│   ├── main.js             # Gestion état global
│   ├── import.js           # Import Excel
│   ├── filter.js           # Filtres tableau
│   ├── details.js          # Logique détails
│   └── preview.js          # Export PDF
├── css/
│   └── styles.css          # Styling
├── data/
│   └── sample-data.json    # Données test
├── README.md               # Documentation complète
└── SETUP.md                # Ce fichier
```

---

## Dépannage

### Problème: "Aucune donnée affichée"

**Solution**:
```
1. Ouvrir console: F12 → Console
2. Vérifier absence d'erreurs rouges
3. Si erreur CORS: relancer avec Python (Option 1)
4. Sinon: cliquer "Utiliser Données Test"
```

### Problème: Import Excel ne fonctionne pas

**Solution**:
```
1. Vérifier que XLSX.js est chargé (F12 → Network)
2. Vérifier format fichier: doit être .xlsx
3. Relancer serveur Python: python3 -m http.server 8888
```

### Problème: localStorage vide

**Solution**:
```
1. Ouvrir F12 → Application → Storage → Local Storage
2. Vérifier clé "appData" existe
3. Si non: cliquer "Utiliser Données Test"
4. Vérifier que localStorage n'est pas désactivé dans les paramètres du navigateur
```

### Problème: PDF ne télécharge pas

**Solution**:
```
1. Vérifier que html2pdf.js est chargé (F12 → Network)
2. Désactiver ad-blocker (peut bloquer html2pdf)
3. Vérifier que popups ne sont pas bloquées
4. Essayer avec un autre navigateur
```

### Problème: Modifications non sauvegardées

**Solution**:
```
1. localStorage peut être limité (5-10MB par domaine)
2. Vider d'autres données: F12 → Application → Clear All
3. Vérifier que navigateur ne ferme pas les onglets sans sauvegarder
```

---

## Commandes Utiles

### Vérifier que le serveur tourne
```bash
curl -I http://localhost:8888
# Doit répondre: HTTP/1.1 200 OK
```

### Voir les logs du serveur
```bash
tail -f /tmp/server.log
```

### Tuer le serveur
```bash
pkill -f "http.server"
```

### Lancer sur un autre port
```bash
python3 -m http.server 9999
# Accédez alors via: http://localhost:9999
```

---

## Limitations Connues

- ❌ Internet Explorer 11 non supporté
- ⚠️ Import Excel sur fichier:// (pas de serveur) ne fonctionne pas
- ⚠️ localStorage limité à ~5-10MB (suffisant pour ~5000 commandes)
- ⚠️ PDF très volumineux (>50 mesures) peut être lent à générer

---

## Fonctionnalités Complètes

✅ Import Excel (XLSX)  
✅ Filtrage dynamique  
✅ Édition adresse/description  
✅ Sélection mesures sécurité  
✅ Aperçu PDF A4  
✅ Export PDF téléchargement  
✅ Statut "Envoyé" persistent  
✅ localStorage persistence  
✅ Responsive design (mobile OK)  
✅ Données test intégrées  

---

## Performance

**Tailles de fichiers**:
- index.html: ~8 KB
- details.html: ~6 KB
- preview.html: ~7 KB
- main.js: ~5 KB
- import.js: ~2 KB
- filter.js: ~3 KB
- details.js: ~3 KB
- preview.js: ~2 KB
- styles.css: ~4 KB
- sample-data.json: ~10 KB

**Total**: ~50 KB (très léger)

**Temps de chargement**:
- Page index: <500ms
- Page détails: <200ms
- Aperçu PDF: <1s
- PDF export: <2s (selon complexité)

---

## Prêt? 

🎉 Lancez le serveur et accédez à http://localhost:8888 !
