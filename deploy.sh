#!/usr/bin/env bash
# Déploie mon-app : commit + push sur GitHub. Railway redéploie automatiquement.
# Usage :  ./deploy.sh            (message daté automatique)
#          ./deploy.sh "mon message de commit"
set -e
cd "$(dirname "$0")"

echo "→ Ajout des modifications…"
git add -A

MSG="${1:-Mise à jour $(date '+%Y-%m-%d %H:%M')}"
if git diff --cached --quiet; then
  echo "Rien de nouveau à committer."
else
  git commit -m "$MSG"
fi

echo "→ Envoi sur GitHub…"
git push

echo "✅ Poussé. Railway redéploie automatiquement — suis l'avancement dans l'onglet Deployments."
