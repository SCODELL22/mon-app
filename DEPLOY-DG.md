# Instance « direction générale » (périmètre France)

Même code que l'app d'agence, **déploiement séparé avec sa propre base**. Une variable change le
comportement : `APP_PERIMETRE=france`.

## Pourquoi une instance séparée

- L'import CSV **remplace tout** : un export France dans l'instance d'agence écraserait l'export
  de l'agence, et inversement.
- Les OTO du DG portent sur les **directeurs d'agence eux-mêmes**. Dans l'instance d'agence, le
  DA est administrateur et lirait ces comptes rendus. Une base distincte supprime le risque.
- **Hébergement** : la personne qui détient le projet Railway et la base peut techniquement lire
  les OTO. Le projet doit donc appartenir au DG ou à la DSI, **pas à un directeur d'agence**.

## Ce que change `APP_PERIMETRE=france`

| Zone | Comportement |
|---|---|
| Dashboard | Sélecteur d'agence (filtre tous les onglets), onglet **Contrôle agences** : pipeline, gagné de l'année et anomalies par agence (démarrage dépassé, clôture dépassée, pôle « Business development »), DA rattaché. Onglets Performance, Recrutement et l'Évolution mensuelle (données Paris codées en dur) masqués. |
| Qualité saisie | KPI et liste « Date de démarrage dépassée » (aussi présents en mode agence). Les dates « Immédiate » sont ignorées. |
| `/1-1` | Devient « OTO des directeurs d'agence ». Une fiche = un DA, rattachée à la **colonne Agence** de l'export (valeur exacte, ex. `FRA - Ippon Technologies - Lyon`). Trame DA dédiée. Rappel du pipeline de l'agence et des 3 contrôles dans la saisie et la fiche. |
| Pré-remplissage | Même bouton qu'en agence (transcription Meet collée → trame), consigne adaptée à un OTO DG/DA. |
| Accès | **Seuls les emails de `MANAGER_EMAILS` (le DG) accèdent aux OTO.** Aucune fiche ne donne de droit, même avec un email : les champs email/manager ne sont ni affichés ni enregistrés. Pas de partage des comptes rendus. |

## Mise en place (Railway)

1. Dans le projet Railway **du DG / de la DSI** : New → Deploy from GitHub repo → ce dépôt.
   (Le dépôt doit être accessible à ce compte : l'inviter sur GitHub, ou forker dans l'organisation.)
2. New → Database → Add PostgreSQL (base **dédiée**, ne pas réutiliser celle de l'agence).
3. Variables du service :

| Variable | Valeur |
|---|---|
| `APP_PERIMETRE` | `france` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `AUTH_SECRET` | nouveau secret (`openssl rand -base64 32`), **différent** de l'instance d'agence |
| `ALLOWED_EMAILS` | email du DG uniquement (ex. `prenom.nom@ippon.fr`) |
| `MANAGER_EMAILS` | email du DG |
| `APP_URL` | URL publique de l'instance |
| `ANTHROPIC_API_KEY` **ou** config Vertex | pour le pré-remplissage depuis la transcription (voir `.env.example`) |
| `RESEND_API_KEY`, `RESEND_FROM` | optionnel, mot de passe oublié |

4. Le DG crée son compte via `/signup`, dépose l'export Boond « Besoins » **France** sur `/`.
5. `/1-1/commerciaux` : une fiche par DA, champ « Agence » choisi dans la liste proposée
   (valeurs de l'export). Un encart signale les agences sans fiche.

## Points d'attention

- L'export France doit contenir la colonne **Agence** et **Date de démarrage** (présentes dans
  l'export Besoins standard).
- `pipeline.html` embarque des données Paris codées en dur (objectifs, CA/marge par client,
  recrutement) : elles sont servies aussi par cette instance, même si les onglets sont masqués.
- Faire régulièrement la sauvegarde `/api/one-on-one/export` : c'est le seul filet des OTO.
