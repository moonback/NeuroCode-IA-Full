#!/bin/bash

# Quitter en cas d'erreur
set -e

echo "Démarrage du processus de mise à jour de NeuroCode..."

# Obtenir le répertoire courant
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Stocker la version actuelle
CURRENT_VERSION=$(cat "$PROJECT_ROOT/package.json" | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]')

echo "Version actuelle : $CURRENT_VERSION"
echo "Récupération de la dernière version..."

# Créer un répertoire temporaire
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# Télécharger la dernière version
LATEST_RELEASE_URL=$(curl -s https://api.github.com/repos/moonback/NeuroCodeFull/releases/latest | grep "browser_download_url.*zip" | cut -d : -f 2,3 | tr -d \")
if [ -z "$LATEST_RELEASE_URL" ]; then
    echo "Erreur : Impossible de trouver l'URL de téléchargement de la dernière version"
    exit 1
fi

echo "Téléchargement de la dernière version..."
curl -L -o latest.zip "$LATEST_RELEASE_URL"

echo "Extraction de la mise à jour..."
unzip -q latest.zip

# Sauvegarder l'installation actuelle
echo "Création de la sauvegarde..."
BACKUP_DIR="$PROJECT_ROOT/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r "$PROJECT_ROOT"/* "$BACKUP_DIR/"

# Installer la mise à jour
echo "Installation de la mise à jour..."
cp -r ./* "$PROJECT_ROOT/"

# Nettoyer
cd "$PROJECT_ROOT"
rm -rf "$TMP_DIR"

echo "Mise à jour terminée avec succès !"
echo "Veuillez redémarrer l'application pour appliquer les modifications."

exit 0
