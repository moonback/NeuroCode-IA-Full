
# NeuroCode - Plateforme de Développement Web Assistée par IA

[![Version](https://img.shields.io/badge/version-2.0.0-important)]()
[![License](https://img.shields.io/badge/license-MIT-success)](LICENSE)

NeuroCode est une plateforme de développement web full-stack de nouvelle génération, propulsée par l'IA, conçue pour accélérer et optimiser le processus de développement. Elle s'exécute entièrement dans le navigateur grâce à [WebContainers](https://webcontainers.io/), offrant une expérience de développement intégrée et performante, sans nécessiter d'installation locale complexe.

## Aperçu du Projet

NeuroCode combine un éditeur de code, un terminal, une prévisualisation en direct, une gestion de projet, et une interface de chat avec des modèles de langage (LLM).  L'IA assiste l'utilisateur dans la rédaction de code, la génération de prompts, l'explication de code, et l'automatisation de tâches.

---

## ⚡ Fonctionnalités principales  

✅ Développement full-stack pour applications **Node.js** directement dans votre navigateur  
✅ **Compatibilité multi-LLM** avec une architecture extensible pour l'intégration de nouveaux modèles  
✅ **Ajout d’images aux prompts** pour une meilleure compréhension contextuelle  
✅ **Terminal intégré** pour visualiser la sortie des commandes exécutées par l’IA  
✅ **Système de versioning du code** permettant de restaurer une version précédente  
✅ **Téléchargement des projets en ZIP** pour une portabilité facile  
✅ **Synchronisation avec un dossier local** sur l’hôte  
✅ **Support Docker** prêt à l'intégration pour une installation simplifiée  
✅ **Déploiement direct sur Netlify ou Vercel**
✅ **Intégration de Supabase pour la gestion des bases de données**


---

## ✅ Fonctionnalités récemment ajoutées  

- **IA & Modèles**  
  - ✅ Intégration OpenRouter, Gemini, DeepSeek, Mistral, Cohere, HuggingFace, Together, xAI Grok  
  - ✅ Génération automatique des modèles Ollama à partir des téléchargements  
  - ✅ Définition dynamique de la longueur maximale des tokens  
  - ✅ Amélioration du prompt pour des réponses plus pertinentes  
  - ✅ Instructions personnalisées pour les modèles LLM
  - ✅ Notifications sonores pour les réponses du chat
  - ✅ Processeur de messages pour les commandes de configuration de projet
  - ✅ Extraction et analyse de texte à partir de documents

- **Expérience utilisateur & Interface**  
  - ✅ Interface optimisée pour mobile  
  - ✅ Ajout de la possibilité d'attacher des images aux prompts 
  - ✅ Ajout d'un bouton "Cibler le fichier" pour demander au LLM de modifier le fichier en priorité
  - ✅ Ajout d'une bibliothèque de prompts avec variations selon les cas d'usage  
  - ✅ Fenêtre pop-up pour Web Container avec ajustement de taille  
  - ✅ Mode de sélection multiple pour l'historique
  - ✅ Masquage des variables d'environnement pour les fichiers .env
  - ✅ Modal d'accueil pour les nouveaux utilisateurs
  - ✅ Amélioration de l'onglet des fournisseurs locaux

- **Gestion de projet & Code**  
  - ✅ Téléchargement des projets sous forme de fichier ZIP  
  - ✅ Importation Git via une URL & bouton "Git Clone"  
  - ✅ Détection et installation automatique des dépendances (`package.json`)  
  - ✅ Ajout d'une vue "Diff" pour comparer les modifications  
  - ✅ Support pour la création de dépôts privés GitHub
  - ✅ Fonctionnalité de téléversement de fichiers dans l'espace de travail

- **Déploiement & Intégration** 
  - ✅ Déploiement sur Vercel 
  - ✅ Déploiement direct sur Netlify  
  - ✅ Containerisation complète avec Docker  
  - ✅ Publication directe des projets sur GitHub  
  - ✅ Intégration de Supabase pour la gestion des bases de données
  - ✅ Système d'alertes pour le suivi des builds et déploiements
  - ✅ Logique de déploiement modulaire pour Netlify et Vercel

---

## 🔥 Priorités actuelles  

- ⬜ Réduction des réécritures de fichiers par Neurocode (gestion avancée des diffs & verrouillage des fichiers)  
- ⬜ Optimisation des prompts pour les petits modèles LLM  
- ⬜ Exécution des agents en arrière-plan pour plus d'efficacité  

---

## 🛠️ Fonctionnalités en développement  

- ⬜ **Génération automatique d'un plan de projet en Markdown**  
- ⬜ **Intégration VSCode avec validations Git-like**  
- ⬜ **Ajout d’un espace de téléversement pour les documents de référence**  
- ⬜ **Commande vocale pour les prompts**  
- ⬜ **Intégration des API Azure OpenAI, Vertex AI et Granite**  

---

## Technologies Utilisées

*   **Framework principal**: [Remix](https://remix.run/)
*   **Interface utilisateur**: [React](https://react.dev/)
*   **Éditeur de code**: [CodeMirror 6](https://codemirror.net/6/)
*   **Terminal**: [xterm.js](https://xtermjs.org/)
*   **WebContainers**: [@webcontainer/api](https://www.npmjs.com/package/@webcontainer/api)
*   **Git**: [isomorphic-git](https://isomorphic-git.org/)
*   **Gestion de l'état**: [nanostores](https://github.com/nanostores/nanostores)
*   **Persistance**: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), [js-cookie](https://www.npmjs.com/package/js-cookie)
*   **Styling**: [SCSS](https://sass-lang.com/), [Tailwind CSS](https://tailwindcss.com/)
*   **Animations**: [Framer Motion](https://www.framer.com/motion/)
*   **UI components**:  [@radix-ui](https://www.radix-ui.com/)
*   **Diff**: [diff](https://www.npmjs.com/package/diff)
*   **PDF**: [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist)
*   **Tests**: [Vitest](https://vitest.dev/)
*   **Autres**: node-fetch, classnames, lodash, react-toastify, etc.

---

## 🚀 Installation  

Si vous n’êtes pas familier avec l’installation de logiciels via GitHub, pas d’inquiétude ! 🚀  
En cas de problème, vous pouvez :  
- **Soumettre un "issue"** via les liens fournis  
- **Améliorer cette documentation** en forknant le repo, en éditant les instructions et en soumettant un pull request  

Suivez les instructions ci-dessous pour installer la **version stable** de Neurocode sur votre machine locale en quelques minutes.  

> 📖 **Consultez la documentation complète pour une installation détaillée !**  

---

🎯 **Prêt à coder plus intelligemment avec l'IA ? Rejoignez Neurocode dès aujourd’hui !** 🚀
