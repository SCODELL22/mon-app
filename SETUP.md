# Installation & déploiement

## 1. Prérequis

- Node.js 20+ (testé avec Node 22)
- Un compte PostgreSQL hébergé pour la prod : **Supabase** ou **Neon** (offre gratuite suffisante)

## 2. Variables d’environnement

Copier `.env.example` vers `.env.local` et renseigner :

| Variable        | Rôle                                                                 |
|-----------------|----------------------------------------------------------------------|
| `DATABASE_URL`  | Chaîne de connexion Postgres. **Vide = mode démo en mémoire.**       |
| `AUTH_SECRET`   | Secret de signature des cookies de session (comptes email + mot de passe). Génération : `openssl rand -base64 32`. |
| `PGSSL`         | Optionnel. `disable` pour un Postgres local sans SSL.                |
| `APP_URL`       | Domaine public de l'app (ex: `https://ipponparis.com`), utilisé pour les liens de réinitialisation de mot de passe. |
| `RESEND_API_KEY`| Clé API [Resend](https://resend.com) pour l'envoi d'email « mot de passe oublié ». Optionnel : sans elle, `/forgot-password` n'envoie rien. |
| `RESEND_FROM`   | Expéditeur affiché (nécessite un domaine vérifié dans Resend, sinon utiliser `onboarding@resend.dev`). |

## 3. Récupérer une base PostgreSQL

### Supabase
1. Créer un projet sur https://supabase.com
2. Project Settings → Database → **Connection string (URI)**.
3. Coller la valeur dans `DATABASE_URL` (Supabase impose le SSL — laisser `PGSSL` non défini).

### Neon
1. Créer un projet sur https://neon.tech
2. Copier la **connection string** fournie dans `DATABASE_URL`.

## 4. Initialiser et lancer

```bash
npm install
npm run db:seed        # crée la table "opportunities" + insère les données de démo
npm run dev            # http://localhost:3000
```

Pour réinitialiser complètement les données de démo : `npm run db:seed -- --force`.

## 5. Déploiement (Vercel → ipponparis.com)

L’app est une app Next.js standard, déployable sur **Vercel** :

1. Pousser le code sur GitHub (voir ci-dessous).
2. Sur https://vercel.com → *New Project* → importer le dépôt `SCODELL22/mon-app`.
3. Renseigner les variables d’environnement (`DATABASE_URL`, `AUTH_SECRET`).
4. Déployer, puis rattacher le domaine **ipponparis.com** (ou un sous-domaine, ex. `pilotage.ipponparis.com`) dans *Project → Settings → Domains*.

## 6. Récupérer ces modifications dans votre dépôt git

Ce code a été produit hors de votre dépôt local. Pour l’intégrer dans `~/mon-app` :

```bash
cd ~/mon-app
# copier les fichiers livrés par-dessus, puis :
npm install
git add -A
git commit -m "Pilotage commercial : opportunités + dashboard CA prévisionnel pondéré"
git push
```

## Notes techniques

- **Données** : couche `lib/store.ts` — PostgreSQL via `pg` si `DATABASE_URL`, sinon mémoire.
- **Calculs** : `lib/aggregations.ts` (fonctions pures, testées dans `scripts/`).
- **Listes de référence** (pôles, secteurs, commerciaux, objectif agence) : éditables dans `lib/config.ts`.
- **Sécurité** : `proxy.ts` exige une session valide sur toutes les routes (sauf `/login`,
  `/signup`, `/api/auth/*`). Comptes individuels (email + mot de passe, PBKDF2 côté serveur,
  cookie de session signé HMAC) — voir `lib/auth.ts` et `lib/users.ts`. Tout le monde voit les
  mêmes données une fois connecté (pas de rôles/permissions différenciés à ce stade).
