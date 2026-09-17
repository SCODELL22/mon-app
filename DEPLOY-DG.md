# Espace direction générale (même application)

L'outil du DG vit dans l'application existante, **à côté** du suivi de l'agence, sans le
toucher :

| Écran | Rôle |
|---|---|
| `/france` | Dashboard France : même page que `/`, avec un **import CSV distinct**, un filtre par agence et l'onglet **Contrôle agences** (pipeline, gagné de l'année, besoins à date de démarrage dépassée, à date de clôture dépassée, en pôle « Business development », DA rattaché). Onglets Performance, Recrutement et Évolution mensuelle (données Paris codées en dur) masqués. |
| `/oto-da` | OTO des directeurs d'agence : une fiche par DA rattachée à la **colonne Agence** de l'export France, trame DA, rappel du pipeline de l'agence et des 3 contrôles, copier-coller de la transcription Meet pour pré-remplir la trame. Pas de partage : les DA n'ont aucun accès. |

## Étanchéité

- **Stockage séparé** : tables `opportunities_direction`, `direction_fiches`, `direction_otos`,
  `direction_oto_actions` (fichiers `.data/direction-*` sans base). L'import France n'écrase
  jamais l'import de l'agence, et inversement.
- **Droits séparés** : seuls les emails de `DG_EMAILS` entrent dans l'espace direction.
  `MANAGER_EMAILS` (administrateurs de l'agence) n'y donne **aucun** droit, et le DG n'a aucun droit
  sur les 1:1 de l'agence.
- Les liens « Vue France » et « OTO des DA » n'apparaissent sur `/` que pour un compte DG.
- **Limite assumée** : qui administre Railway et la base peut techniquement lire toutes les
  tables. L'étanchéité vaut dans l'application.

## Mise en place (Railway, service existant)

Variables à ajouter :

| Variable | Valeur |
|---|---|
| `DG_EMAILS` | email du DG, ex. `prenom.nom@ippon.fr` |
| `ALLOWED_EMAILS` | ajouter l'email du DG à la liste existante (sinon il ne peut pas créer son compte) |
| `ANTHROPIC_API_KEY` ou config Vertex | déjà nécessaire pour le pré-remplissage côté agence ; sert aussi aux OTO |

Puis :

1. Le DG crée son compte (`/signup`), ouvre `/france` et dépose l'export Boond « Besoins » France.
2. `/oto-da/commerciaux` : une fiche par DA, champ « Agence » choisi dans la liste proposée
   (valeurs exactes de la colonne Agence). Un encart signale les agences sans fiche.
3. Sauvegarde régulière : lien « Sauvegarde » dans `/oto-da` (fichier `oto-da-AAAA-MM-JJ.json`).

## Points d'attention

- L'export France doit contenir les colonnes **Agence** et **Date de démarrage**.
- `pipeline.html` embarque des données Paris codées en dur (objectifs, CA/marge par client,
  recrutement) : le DG, comme tout compte connecté, peut les recevoir via `/`.
- Tout compte connecté peut toujours ouvrir `/` et y importer un CSV agence (comportement
  historique, inchangé).
