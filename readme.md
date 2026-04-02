# 🖨️ Plotter Slicer

Web app pour convertir des fichiers SVG en G-code et les envoyés à un polargraph (Makelangelo 5).

[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://reactjs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.x-black.svg)](https://nextjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 🚀 Installation
```bash
# Cloner le repository
git clone https://github.com/votre-username/plotter-slicer.git
cd plotter-slicer

# Installer les dépendances
npm install
# ou
yarn install

# Lancer en développement
npm run dev
# ou
yarn dev
```

L'application sera accessible sur [http://localhost:3000](http://localhost:3000)

---

## 📖 Utilisation

### 1. Importer un SVG
- **Option 1** : Cliquer sur "Import SVG" dans le panneau de gauche
- **Option 2** : Glisser-déposer un fichier SVG dans la zone de prévisualisation

### 2. Configurer les paramètres
- **Speed** : Vitesse de déplacement en mm/s (1000-3000)
- **Point joining** : Rayon de simplification des points en mm (0-5)
- **Path Optimization** : Active/désactive l'optimisation des trajets
- **Paper** : Format (A5, A4, A3, A2, B2) ou dimensions personnalisées
- **Margins** : Marges en mm (top, right, bottom, left)

### 3. Générer le G-code
Le G-code est généré automatiquement dès le chargement du SVG.
Un fichier séparé est créé pour chaque couleur détectée.

### 4. Exporter ou Dessiner
- **Download** : Télécharge le fichier .gcode pour utilisation ultérieure
- **Draw** : Nécessite une connexion série active pour dessiner directement

### 5. Connexion série (optionnel)
1. Cliquer sur "Connect" dans le panneau de droite
2. Sélectionner le port série de votre plotter
3. Utiliser les boutons "⚡ Draw" pour lancer le dessin

### 6. Utiliser des outils génératifs (optionnel)
1. Ajouter un paramètre query de type ?url=mon-projet.com
2. par exemple ?url=https://plotobooth.vercel.app/
3. Si votre projet permet de télécharger un svg, il sera automatiquement inséré dans le slicer

---

## 🔧 Structure du projet
```
src/
├── components/
│   ├── PlotterApp.js          (~215 lignes) ✨ Orchestrateur principal
│   ├── ControlPanel.js        (~200 lignes) - Panneau de configuration
│   ├── PreviewCanvas.js       (~350 lignes) - Canvas de visualisation SVG
│   ├── GCodePanel.js          (~80 lignes)  - Panneau de gestion G-code
│   └── SerialConnection.js    - Gestion connexion série Web Serial API
├── utils/
│   ├── svgProcessing.js       (~700 lignes) - Parsing et normalisation SVG
│   └── gcodeGenerator.js      (~500 lignes) - Génération et optimisation G-code
├── hooks/
│   └── useDragAndDrop.js      (~60 lignes)  - Hook personnalisé drag & drop
└── constants/
    └── plotterConfig.js       (~20 lignes)  - Constantes (dimensions, formats)
```

---

## 🛠️ Dépendances

- **[Next.js](https://nextjs.org/)** - Framework React avec SSR
- **[React](https://reactjs.org/)** - Bibliothèque UI
- **[Tailwind CSS](https://tailwindcss.com/)** - Framework CSS utility-first
- **[Lucide React](https://lucide.dev/)** - Icônes modernes
- **[Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)** - Communication série navigateur

---

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## 👨‍💻 Auteur

**[sjvl](https://sjvl.notion.site/)**

Conçu pour [Makelangelo 5](https://www.marginallyclever.com/) by Marginally Clever Robots

---