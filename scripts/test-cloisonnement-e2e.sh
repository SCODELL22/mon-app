#!/usr/bin/env bash
# Test de bout en bout du cloisonnement du module 1:1, sur un serveur RÉEL.
#
# Pourquoi ce test en plus des tests unitaires : stripPrivate() peut être parfaitement correct et
# le contenu privé fuiter quand même, si une page oublie d'appeler filtrerPourLecteur(). Seul un
# test qui interroge le serveur et inspecte le HTML reçu le prouve.
#
# Scénario :
#   1. un manager crée une fiche commercial et un entretien contenant des notes privées ;
#   2. le commercial se connecte avec son propre compte ;
#   3. on vérifie que le HTML qu'il reçoit ne contient AUCUN mot des notes privées ;
#   4. on vérifie qu'un tiers connecté n'a accès à rien.
#
# Usage : bash scripts/test-cloisonnement-e2e.sh   (nécessite un build préalable : npm run build)
set -uo pipefail

PORT="${PORT:-3123}"
BASE="http://127.0.0.1:${PORT}"
TMP="$(mktemp -d)"
ECHECS=0

ok() { if [ "$1" = "0" ]; then echo "OK $2"; else echo "XX $2"; ECHECS=$((ECHECS + 1)); fi; }

export AUTH_SECRET="test-secret-cloisonnement-$(date +%s)"
export MANAGER_EMAILS="manager@ippon.fr"
export ALLOWED_EMAIL_DOMAIN="ippon.fr"
export NODE_ENV=production
export PORT

# Base de données isolée : backend fichier dans un répertoire jetable.
WORK="$TMP/app"
mkdir -p "$WORK"
unset DATABASE_URL

npx next start -p "$PORT" >"$TMP/serveur.log" 2>&1 &
SERVEUR=$!
trap 'kill $SERVEUR 2>/dev/null; rm -rf "$TMP"' EXIT

for _ in $(seq 1 40); do
  curl -sf -o /dev/null "$BASE/login" && break
  sleep 0.5
done

MOT_PRIVE_1="Fatiguedepuisdeuxmois"
MOT_PRIVE_2="Demandeaugmentationsalaire"
MOT_PRIVE_3="Notesbrutesnonrelues"
MOT_PRIVE_4="Jenensplusdecettesituation"
MOT_PARTAGE="Relancerlecompteclient"

inscrire() { # email -> cookie jar
  curl -s -c "$2" -o /dev/null -X POST "$BASE/api/auth/signup" \
    --data-urlencode "email=$1" --data-urlencode 'password=motdepasse123' \
    --data-urlencode 'confirm=motdepasse123'
}

J_MANAGER="$TMP/manager.txt"
J_COMMERCIAL="$TMP/commercial.txt"
J_TIERS="$TMP/tiers.txt"

inscrire 'manager@ippon.fr' "$J_MANAGER"
inscrire 'alex.martin@ippon.fr' "$J_COMMERCIAL"
inscrire 'quelquun.dautre@ippon.fr' "$J_TIERS"

# --- Le manager crée la fiche du commercial -----------------------------------
curl -s -b "$J_MANAGER" -o /dev/null -X POST "$BASE/api/one-on-one/commercial" \
  --data-urlencode 'nom=Alex Martin' \
  --data-urlencode 'email=alex.martin@ippon.fr' \
  --data-urlencode 'libelleBoond=Alex MARTIN' \
  --data-urlencode 'pole=Data & IA' \
  --data-urlencode 'objectifAnnuel=1000000' \
  --data-urlencode 'actif=on'

COMMERCIAL_ID=$(curl -s -b "$J_MANAGER" "$BASE/api/one-on-one/export" \
  | grep -o '"id": "com_[a-z0-9]*"' | head -1 | grep -o 'com_[a-z0-9]*')
[ -n "$COMMERCIAL_ID" ]
ok $? "fiche commercial créée ($COMMERCIAL_ID)"

# --- Le manager saisit un entretien avec des notes privées --------------------
curl -s -b "$J_MANAGER" -o /dev/null -X POST "$BASE/api/one-on-one/entretien" \
  --data-urlencode "commercialId=$COMMERCIAL_ID" \
  --data-urlencode 'date=2026-07-28' \
  --data-urlencode "pointsCles=$MOT_PARTAGE" \
  --data-urlencode "moral=$MOT_PRIVE_1" \
  --data-urlencode 'humeur=2' \
  --data-urlencode "notesRh=$MOT_PRIVE_2" \
  --data-urlencode "notesBrutes=$MOT_PRIVE_3" \
  --data-urlencode "transcription=Pascal: on commence.
Alex: $MOT_PRIVE_4 franchement.
Pascal: on en reparle." \
  --data-urlencode 'action_id=' \
  --data-urlencode 'action_libelle=Rappeler le client' \
  --data-urlencode 'action_porteur=COMMERCIAL' \
  --data-urlencode 'action_echeance=2026-08-10' \
  --data-urlencode 'action_statut=OUVERTE'

ENTRETIEN_ID=$(curl -s -b "$J_MANAGER" "$BASE/api/one-on-one/export" \
  | grep -o '"id": "o3_[a-z0-9]*"' | head -1 | grep -o 'o3_[a-z0-9]*')
[ -n "$ENTRETIEN_ID" ]
ok $? "entretien créé ($ENTRETIEN_ID)"

# --- Étape brouillon : rien ne doit être visible avant partage explicite -------
# Un entretien fraîchement enregistré est un BROUILLON. Le commercial ne doit rien en voir,
# pas même le fait qu'il existe.
HTML_AVANT=$(curl -s -b "$J_COMMERCIAL" "$BASE/1-1/entretien/$ENTRETIEN_ID")
echo "$HTML_AVANT" | grep -qi 'Acc.s non autoris'
ok $? "brouillon : le commercial reçoit 'accès refusé' sur son propre entretien"
! echo "$HTML_AVANT" | grep -q "$MOT_PARTAGE"
ok $? "brouillon : aucun contenu partagé ne fuit avant le partage"

# Les ACTIONS d'un brouillon ne doivent pas non plus apparaître dans la vue transverse.
ACTIONS_AVANT=$(curl -s -b "$J_COMMERCIAL" "$BASE/1-1/actions")
! echo "$ACTIONS_AVANT" | grep -q 'Rappeler le client'
ok $? "brouillon : les actions n'apparaissent pas dans la vue transverse du commercial"

# --- Le manager partage explicitement -----------------------------------------
curl -s -b "$J_MANAGER" -o /dev/null -X POST "$BASE/api/one-on-one/partage" \
  --data-urlencode "id=$ENTRETIEN_ID" --data-urlencode 'partager=1'

# Un commercial ne doit pas pouvoir partager lui-même.
CODE=$(curl -s -b "$J_COMMERCIAL" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/one-on-one/partage" \
  --data-urlencode "id=$ENTRETIEN_ID" --data-urlencode 'partager=1')
[ "$CODE" = "403" ]
ok $? "le commercial ne peut pas partager un entretien (403, reçu $CODE)"

# --- Ce que voit le MANAGER ---------------------------------------------------
HTML_MANAGER=$(curl -s -b "$J_MANAGER" "$BASE/1-1/entretien/$ENTRETIEN_ID")
echo "$HTML_MANAGER" | grep -q "$MOT_PRIVE_1"
ok $? "le manager voit bien ses notes privées (sinon le test ne prouverait rien)"
echo "$HTML_MANAGER" | grep -q "$MOT_PRIVE_4"
ok $? "le manager retrouve bien le verbatim de la transcription"
echo "$HTML_MANAGER" | grep -q "$MOT_PARTAGE"
ok $? "le manager voit la zone partagée"

# --- Ce que voit le COMMERCIAL : le cœur du test ------------------------------
HTML_COMMERCIAL=$(curl -s -b "$J_COMMERCIAL" "$BASE/1-1/entretien/$ENTRETIEN_ID")

echo "$HTML_COMMERCIAL" | grep -q "$MOT_PARTAGE"
ok $? "le commercial reçoit bien la zone partagée"

! echo "$HTML_COMMERCIAL" | grep -q "$MOT_PRIVE_1"
ok $? "FUITE ? le moral n'est PAS dans le HTML du commercial"

! echo "$HTML_COMMERCIAL" | grep -q "$MOT_PRIVE_2"
ok $? "FUITE ? les notes RH ne sont PAS dans le HTML du commercial"

! echo "$HTML_COMMERCIAL" | grep -q "$MOT_PRIVE_3"
ok $? "FUITE ? les notes brutes ne sont PAS dans le HTML du commercial"

! echo "$HTML_COMMERCIAL" | grep -q "$MOT_PRIVE_4"
ok $? "FUITE ? la transcription Google Meet n'est PAS dans le HTML du commercial"

! echo "$HTML_COMMERCIAL" | grep -qi 'Zone manager'
ok $? "le bandeau de zone privée n'est pas rendu pour le commercial"

! echo "$HTML_COMMERCIAL" | grep -qi 'Transcription Google Meet'
ok $? "l'existence même d'une transcription n'est pas signalée au commercial"

# --- Écriture interdite au commercial -----------------------------------------
CODE=$(curl -s -b "$J_COMMERCIAL" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/one-on-one/entretien" \
  --data-urlencode "commercialId=$COMMERCIAL_ID" --data-urlencode 'date=2026-07-29')
[ "$CODE" = "403" ]
ok $? "le commercial ne peut pas créer d'entretien (403, reçu $CODE)"

CODE=$(curl -s -b "$J_COMMERCIAL" -o /dev/null -w '%{http_code}' "$BASE/api/one-on-one/export")
[ "$CODE" = "403" ]
ok $? "le commercial ne peut pas télécharger la sauvegarde (403, reçu $CODE)"

# --- Retrait du partage : le contenu redevient invisible ----------------------
curl -s -b "$J_MANAGER" -o /dev/null -X POST "$BASE/api/one-on-one/partage" \
  --data-urlencode "id=$ENTRETIEN_ID" --data-urlencode 'partager=0'
HTML_RETIRE=$(curl -s -b "$J_COMMERCIAL" "$BASE/1-1/entretien/$ENTRETIEN_ID")
! echo "$HTML_RETIRE" | grep -q "$MOT_PARTAGE"
ok $? "retrait du partage : le commercial reperd l'accès au compte rendu"

# On repartage pour la suite des vérifications.
curl -s -b "$J_MANAGER" -o /dev/null -X POST "$BASE/api/one-on-one/partage" \
  --data-urlencode "id=$ENTRETIEN_ID" --data-urlencode 'partager=1'

# --- Un tiers connecté n'a accès à rien ---------------------------------------
HTML_TIERS=$(curl -s -b "$J_TIERS" "$BASE/1-1/entretien/$ENTRETIEN_ID")
! echo "$HTML_TIERS" | grep -q "$MOT_PARTAGE"
ok $? "un collègue non concerné ne voit pas le compte rendu"
echo "$HTML_TIERS" | grep -qi 'Acc.s non autoris'
ok $? "un collègue non concerné reçoit l'écran d'accès refusé"

# --- Un visiteur non connecté --------------------------------------------------
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/1-1")
[ "$CODE" = "307" ] || [ "$CODE" = "303" ] || [ "$CODE" = "302" ]
ok $? "non connecté : redirection vers /login (reçu $CODE)"

echo
if [ "$ECHECS" = "0" ]; then
  echo "✅ CLOISONNEMENT OK"
  exit 0
fi
echo "❌ $ECHECS échec(s) — NE PAS DÉPLOYER"
exit 1
