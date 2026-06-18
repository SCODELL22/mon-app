# Déployer mon-app sur Railway (domaine ipponparis.com)

Railway héberge **l'application ET la base Postgres** dans le même projet.
Suivez les étapes dans l'ordre.

---

## Étape 1 — Envoyer le code sur GitHub

Depuis le Terminal :

```bash
cd ~/mon-app
git add -A
git commit -m "Pilotage commercial : import BoondManager + dashboard"
git push
```

---

## Étape 2 — Créer le projet sur Railway

1. Aller sur https://railway.app → **New Project**.
2. Choisir **Deploy from GitHub repo** et sélectionner `SCODELL22/mon-app`.
3. Railway détecte Next.js et lance le build automatiquement (`npm run build` puis `npm run start`).
   Le premier déploiement peut échouer faute de base/variables : c'est normal, on les ajoute aux étapes suivantes.

---

## Étape 3 — Ajouter la base de données Postgres

1. Dans le projet Railway : **New → Database → Add PostgreSQL**.
2. Railway crée un service **Postgres** avec ses identifiants. Rien d'autre à faire ici :
   la table `opportunities` est créée automatiquement par l'app au premier accès.

---

## Étape 4 — Configurer les variables de l'application

Ouvrir le service **mon-app** (pas le service Postgres) → onglet **Variables**, et ajouter :

| Variable        | Valeur                                  |
|-----------------|-----------------------------------------|
| `DATABASE_URL`  | `${{Postgres.DATABASE_URL}}`            |
| `AUTH_USER`     | l'identifiant de votre choix            |
| `AUTH_PASSWORD` | un mot de passe solide                  |

- `${{Postgres.DATABASE_URL}}` est une **référence** vers la base : tapez-la telle quelle,
  Railway la remplace par la vraie chaîne de connexion (réseau interne, sans SSL — c'est géré par l'app).
- Sans `AUTH_USER` / `AUTH_PASSWORD`, le site serait **public** : à ne pas faire avec des données commerciales.

Railway redéploie automatiquement après l'ajout des variables.

---

## Étape 5 — Mettre l'app en ligne et tester

1. Service **mon-app → Settings → Networking → Generate Domain**. Railway donne une URL en
   `https://mon-app-production-xxxx.up.railway.app`.
2. Ouvrir cette URL, se connecter avec vos identifiants, puis **Importer un CSV** avec l'export BoondManager.
3. Vérifier que le dashboard affiche bien vos opportunités. Si oui, la base fonctionne.

---

## Étape 6 — Brancher le domaine ipponparis.com

1. Service **mon-app → Settings → Networking → Custom Domain**, saisir `ipponparis.com`
   (et aussi `www.ipponparis.com`). Railway affiche une **cible CNAME** du type `xxxx.up.railway.app`.
2. Chez votre registrar (là où vous avez acheté ipponparis.com), créer les enregistrements DNS :
   - **`www.ipponparis.com`** → enregistrement **CNAME** vers la cible donnée par Railway. ✅ marche partout.
   - **`ipponparis.com` (racine)** : le DNS classique n'autorise pas de CNAME à la racine. Deux options :
     - **Recommandé** : déplacer les DNS du domaine vers **Cloudflare** (gratuit), qui fait du « CNAME flattening » — vous pouvez alors mettre un CNAME directement sur la racine vers la cible Railway.
     - **Sinon** : configurer chez votre registrar une **redirection** de `ipponparis.com` vers `https://www.ipponparis.com` (l'app vit alors sur le www).
3. Attendre la propagation DNS (quelques minutes à quelques heures). Railway émet le certificat HTTPS automatiquement.

> Dites-moi chez quel registrar le domaine est hébergé (OVH, Gandi, Cloudflare…) et je vous donne les écrans exacts pour la racine.

---

## Mises à jour ultérieures

Chaque `git push` redéploie l'app automatiquement. La base et le domaine restent en place.

## Mettre à jour les données

Ré-exporter les **Besoins** depuis BoondManager, puis **Importer un CSV** dans l'app
(l'import remplace l'intégralité des données).
