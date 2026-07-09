# mon-app — Pilotage commercial d’agence

Application Next.js de suivi des opportunités commerciales et du CA prévisionnel,
**alimentée par import CSV depuis BoondManager** (export « Besoins »).

- Dashboard : pipeline pondéré (montant × probabilité) par **pôle / commercial / secteur**,
  avancement par étape, CA gagné, objectif agence.
- Données en **lecture seule** : la source de vérité est BoondManager. On réimporte pour mettre à jour.

## Démarrage rapide

```bash
npm install
npm run dev
```

Ouvrir http://localhost:3000. Sans base configurée, l’app utilise un **fichier local**
(`.data/opportunities.json`) ; au premier lancement, un petit jeu de démonstration s’affiche.

> La protection par compte est **désactivée** tant que `AUTH_SECRET` n'est pas défini (pratique
> en local). En production, définir cette variable active la protection : chacun crée son compte
> via `/signup` (email + mot de passe). L'inscription est réservée au domaine `@ippon.fr`
> (configurable via `ALLOWED_EMAIL_DOMAIN`). Mot de passe oublié : `/forgot-password` envoie un
> lien de réinitialisation par email (via Resend — voir `RESEND_API_KEY`, `RESEND_FROM`, `APP_URL`
> dans `.env.example`) ; sans ces variables, la demande est acceptée mais aucun email ne part.

## Importer ses données BoondManager

1. Dans BoondManager, exporter la liste **Besoins** au format CSV.
2. Dans l’app : menu **« Importer un CSV »**, choisir le fichier, valider.
3. L’import **remplace l’intégralité** des données. L’encodage Latin-1 de Boond est géré automatiquement.

Colonnes lues : Titre, Société - Nom, Pôle, Responsable manager, Domaine d’intervention,
CA Envisagé HT, Pondération, Date de clôture, État, Référence interne.

## Avec PostgreSQL (Supabase / Neon)

Pour des données partagées et persistantes en équipe, voir **[SETUP.md](./SETUP.md)**.
Définir `DATABASE_URL` suffit : l’app bascule automatiquement sur Postgres.

## Tests

```bash
npm test    # calculs de pondération, couche de données, et parsing de l’export Boond
```

## À venir

- CA réalisé par secteur / commercial et suivi agence vs objectifs.
- Suivi des impayés et des encours.
