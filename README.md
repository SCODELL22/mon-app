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

## Suivi des entretiens 1:1 (`/1-1`)

Module de suivi managérial des commerciaux : un compte rendu par entretien, les actions décidées,
et leur suivi semaine après semaine. Contrairement aux opportunités, **ces données sont la source
de vérité** — rien ne permet de les reconstituer si elles sont perdues.

**Écrans**

| Chemin | Rôle |
|---|---|
| `/1-1` | Tableau de bord : qui n’a pas été vu depuis longtemps, actions en retard |
| `/1-1/commerciaux` | Fiches : rattachement à BoondManager et au compte applicatif |
| `/1-1/nouveau` | Saisie d’un entretien : trame structurée **et** notes brutes |
| `/1-1/commercial/[id]` | Fiche d’un commercial : pipeline, historique, actions |
| `/1-1/entretien/[id]` | Compte rendu d’un entretien |
| `/1-1/actions` | Vue transverse des actions, groupées par semaine ISO |

**Transcription Google Meet**

Ippon enregistre déjà ses réunions avec Meet, qui dépose une transcription dans le Drive de
l’organisateur (document `… - Transcript`). Inutile de payer un service de transcription : ouvrir
ce document, tout sélectionner, coller dans le champ prévu de l’écran de saisie. L’en-tête et le
pied de page ajoutés par Google sont retirés automatiquement.

La transcription s’affiche alors en panneau collant à gauche pendant qu’on remplit la trame à
droite. Elle est **privée au même titre que la zone manager** : c’est un verbatim intégral de
propos tenus par un salarié. Elle ne part jamais vers le commercial, même après partage, et son
existence ne lui est pas signalée.

**Pré-remplissage de la trame (Claude)**

Le bouton *« Enregistrer et pré-remplir la trame »* complète les rubriques laissées vides à partir
de la transcription, et propose les actions évoquées. Il n’apparaît que si un canal d’accès au
modèle est configuré.

Deux canaux possibles, au choix (cf. `.env.example`) :

| Canal | Configuration | Quand le choisir |
|---|---|---|
| **API Anthropic directe** | `ANTHROPIC_API_KEY` | Le plus simple : une clé, aucune infrastructure. Anthropic devient un sous-traitant distinct. |
| **Vertex AI (Model Garden)** | `VERTEX_PROJECT_ID` + compte de service | Quand un projet Google Cloud existe : rien ne sort de l’environnement déjà sous contrat. Activer Claude dans le Model Garden au préalable. |

Si les deux sont renseignés, **Vertex est prioritaire** — c’est le canal qui garde les données
dans le cloud contractualisé. Configurer les deux permet de garder une clé de secours pendant une
migration.

Le corps de requête est identique dans les deux cas (format Messages) : seuls l’URL et
l’authentification diffèrent. Basculer de canal ne demande donc que de changer des variables
d’environnement.

La sortie structurée passe par un **outil forcé** (`tool_choice`) plutôt que par un mode JSON :
c’est la méthode la plus stable et elle fonctionne à l’identique sur les deux canaux.

⚠️ Les identifiants de modèle **diffèrent selon le canal** : sans suffixe de date sur Vertex
(`claude-sonnet-4-5`), avec suffixe sur l’API directe (`claude-sonnet-4-5-20250929`). Utiliser
celui qu’affiche la console du canal retenu — un identifiant inconnu renvoie une 404 sans autre
explication.

Garanties, par ordre d’importance :

1. l’entretien **repasse en brouillon** — du texte produit par un modèle n’est jamais lisible sans
   relecture ;
2. seule la **zone partagée** est alimentée : le schéma envoyé au modèle ne comporte aucun champ
   où déposer une appréciation sur le moral ou un sujet RH ;
3. les rubriques **déjà rédigées à la main ne sont pas écrasées** ;
4. la réponse du modèle est validée par liste blanche stricte (`validerReponse`) : champs inconnus
   ignorés, types incorrects écartés, textes tronqués, actions plafonnées.

L’enregistrement a toujours lieu **avant** l’appel au modèle : si l’extraction échoue, la saisie
n’est pas perdue.

Choix de Vertex AI plutôt qu’un autre fournisseur : la transcription vient de Google Meet et
Google est déjà sous contrat Workspace chez Ippon — pas de nouveau responsable de traitement à
faire valider. Garder `VERTEX_LOCATION` sur une région européenne.

L’authentification passe par un compte de service (JWT RS256 signé en Web Crypto, aucune
dépendance npm ajoutée) : voir `lib/vertex.ts` et `scripts/test-vertex.ts`.

**Brouillon puis partage**

Un entretien enregistré est un **brouillon** : le commercial n’en voit rien, pas même son
existence, ni les actions qui en sont issues. Il devient lisible uniquement après un clic
« partager » sur le compte rendu. Le partage est réversible.

C’est délibérément une route distincte (`/api/one-on-one/partage`) de l’enregistrement du
formulaire : partager est un geste conscient, jamais l’effet de bord d’une sauvegarde. Les
entretiens créés avant l’introduction de ce champ restent en brouillon.

**Confidentialité — à lire avant de déployer**

Chaque entretien a deux zones :

- **zone partagée** (chiffres, deals à risque, activité, administratif, développement, décisions,
  actions) : lisible par le commercial concerné ;
- **zone manager** (moral, sujets RH, notes brutes de séance) : lisible des seuls managers. Elle
  n’est pas masquée en CSS, elle **n’est jamais envoyée au navigateur** du commercial.

Les rôles se configurent ainsi :

- `MANAGER_EMAILS` (variable d’environnement) liste les managers. **Non renseignée = aucun
  manager = module bloqué en écriture**, volontairement (fail-closed).
- Un commercial accède à ses propres comptes rendus dès que son adresse figure dans sa fiche
  (`/1-1/commerciaux`). Champ laissé vide = aucun accès.
- Tout autre compte connecté reçoit un écran « accès non autorisé ».

**Sauvegarde.** `GET /api/one-on-one/export` télécharge l’intégralité du module en JSON (zone
privée comprise, managers uniquement). À faire régulièrement : c’est le seul filet.

**Rattachement au pipeline.** Le champ *libellé BoondManager* d’une fiche doit reprendre **à
l’identique** (casse comprise) le « Responsable manager » de l’export. C’est ce qui permet
d’afficher automatiquement le pipeline du commercial dans l’écran de saisie. L’écran
`/1-1/commerciaux` signale les libellés présents dans l’import mais rattachés à aucune fiche.

## Avec PostgreSQL (Supabase / Neon)

Pour des données partagées et persistantes en équipe, voir **[SETUP.md](./SETUP.md)**.
Définir `DATABASE_URL` suffit : l’app bascule automatiquement sur Postgres.

## Tests

```bash
npm test    # pondération, couche de données, parsing de l’export Boond, et module 1:1
```

Test supplémentaire de **cloisonnement**, sur un serveur réel : il vérifie qu’un commercial
connecté ne reçoit aucune trace des notes privées dans le HTML qu’on lui sert.

```bash
npm run build
bash scripts/test-cloisonnement-e2e.sh
```

À relancer après toute modification de `lib/access.ts`, de `stripPrivate()` ou d’un écran de
`/1-1`. Un échec ici n’est pas une régression fonctionnelle, c’est une fuite de données
personnelles.

## À venir

- CA réalisé par secteur / commercial et suivi agence vs objectifs.
- Suivi des impayés et des encours.
