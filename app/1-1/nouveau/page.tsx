// Saisie d'un entretien 1:1 (création et édition).
//
// Deux modes de saisie coexistent volontairement :
//   - la TRAME structurée, à remplir pendant ou après l'entretien ;
//   - le champ NOTES BRUTES, pour jeter ce qui a été dit sans mise en forme.
// Les notes brutes sont traitées comme privées : ce sont des notes de séance non relues.
//
// Le formulaire est un <form> HTML natif, sans JavaScript client : c'est la convention des
// formulaires existants (login, signup) et c'est compatible avec la CSP de next.config.ts.
// Conséquence assumée : le nombre de lignes d'actions vides est fixe (LIGNES_ACTIONS).
import { acces, peutEcrire } from '@/lib/access';
import { getCommercial, getOneOnOne, listActions, listCommerciaux } from '@/lib/one-on-one-store';
import { pipelineDuCommercial } from '@/lib/one-on-one-pipeline';
import { ACTION_STATUTS, actionsParUrgence, aujourdHui, isEnRetard } from '@/lib/one-on-one';
import { extractionDisponible } from '@/lib/extraction-trame';
import { dateFr, euros } from '@/lib/format';
import { AccesRefuse, BandeauPrive, Badge, C, Card, Message, S, Shell } from '../ui';

export const dynamic = 'force-dynamic';

/** Lignes d'actions vides proposées par défaut. Au-delà, enregistrer puis rouvrir l'entretien. */
const LIGNES_ACTIONS = 5;

const ERREURS_EXTRACTION: Record<string, string> = {
  'extraction-indisponible':
    "Le pré-remplissage n'est pas configuré sur cet environnement (identifiants Vertex AI manquants).",
  'pas-de-transcription': 'Colle d’abord la transcription, puis enregistre, avant de pré-remplir.',
  'extraction-echec':
    'Le pré-remplissage a échoué. Le détail est dans les journaux du serveur. La trame est inchangée.',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    commercial?: string;
    id?: string;
    erreur?: string;
    extrait?: string;
    actions?: string;
  }>;
}) {
  const a = await acces();
  if (!peutEcrire(a)) return <AccesRefuse />;

  const {
    commercial: commercialParam,
    id,
    erreur,
    extrait,
    actions: actionsAjoutees,
  } = await searchParams;
  const commerciaux = await listCommerciaux();
  const entretien = id ? await getOneOnOne(id) : null;

  const commercialId = entretien?.commercialId ?? commercialParam ?? commerciaux[0]?.id ?? '';
  const commercial = commercialId ? await getCommercial(commercialId) : null;

  const today = aujourdHui();
  // Le bouton de pré-remplissage n'apparaît que si Vertex AI est configuré sur cet environnement.
  const extractionPossible = extractionDisponible();

  if (commerciaux.length === 0) {
    return (
      <Shell titre="Nouveau 1:1" estManager>
        <h1 style={S.h1}>Nouvel entretien</h1>
        <Message ton="info">
          Aucun commercial enregistré. Crée d’abord les fiches dans{' '}
          <a href="/1-1/commerciaux" style={S.link}>
            Commerciaux
          </a>
          .
        </Message>
      </Shell>
    );
  }

  const pipeline = commercial
    ? await pipelineDuCommercial(commercial, today)
    : null;

  // Actions encore ouvertes issues des séances PRÉCÉDENTES : c'est le point de départ du 1:1.
  const toutesActions = commercialId ? await listActions({ commercialId }) : [];
  const aReporter = actionsParUrgence(
    toutesActions.filter((x) => x.oneOnOneId !== entretien?.id),
    today,
  );
  // Actions déjà rattachées à CET entretien (mode édition) : éditables en place.
  const actionsDeCetEntretien = entretien
    ? toutesActions.filter((x) => x.oneOnOneId === entretien.id)
    : [];

  const lignesVides = Math.max(0, LIGNES_ACTIONS - actionsDeCetEntretien.length);

  return (
    <Shell titre={entretien ? 'Modifier le 1:1' : 'Nouveau 1:1'} estManager>
      <header style={{ marginBottom: 18 }}>
        <h1 style={S.h1}>{entretien ? 'Modifier l’entretien' : 'Nouvel entretien'}</h1>
        <p style={S.sub}>
          Tout ce qui est saisi hors de la zone jaune est lisible par le commercial concerné.
        </p>
      </header>

      {erreur && (
        <Message ton="erreur">{ERREURS_EXTRACTION[erreur] ?? 'Une erreur est survenue.'}</Message>
      )}
      {extrait !== undefined && (
        <Message ton="ok">
          Pré-remplissage terminé : {extrait} rubrique{Number(extrait) > 1 ? 's' : ''} complétée
          {Number(extrait) > 1 ? 's' : ''}, {actionsAjoutees ?? 0} action
          {Number(actionsAjoutees) > 1 ? 's' : ''} proposée{Number(actionsAjoutees) > 1 ? 's' : ''}.{' '}
          <strong>Relis tout avant de partager</strong> — le texte a été produit par un modèle, pas
          par toi.
        </Message>
      )}

      {/* Sélecteur de commercial hors du formulaire principal : changer de personne recharge la
          page pour rafraîchir le pipeline et les actions à reporter. */}
      {!entretien && (
        <Card titre="Commercial">
          <form method="GET" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ ...S.label, minWidth: 260 }}>
              Personne concernée
              <select name="commercial" defaultValue={commercialId} style={S.input}>
                {commerciaux.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" style={S.btnGhost}>
              Changer
            </button>
          </form>
        </Card>
      )}

      {pipeline && pipeline.rattache && (
        <Card titre="Rappel du pipeline (BoondManager)">
          <p style={{ fontSize: 13, color: C.gd, marginBottom: 10 }}>
            Chiffres issus du dernier import, non modifiables ici. Ils servent de référence pour
            commenter l’écart avec le déclaratif.
          </p>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13 }}>
            <span>
              Pondéré <strong>{euros(pipeline.pondere)}</strong>
            </span>
            <span>
              Brut <strong>{euros(pipeline.brut)}</strong>
            </span>
            <span>
              Gagné <strong>{euros(pipeline.gagne)}</strong>
            </span>
            <span>
              Affaires ouvertes <strong>{pipeline.nbOuvertes}</strong>
            </span>
            {pipeline.enRetard.length > 0 && (
              <Badge ton="red">{pipeline.enRetard.length} au-delà de la date de clôture</Badge>
            )}
          </div>
        </Card>
      )}

      <form action="/api/one-on-one/entretien" method="POST">
        <input type="hidden" name="id" value={entretien?.id ?? ''} />
        <input type="hidden" name="commercialId" value={commercialId} />

        {aReporter.length > 0 && (
          <Card titre="Actions de la séance précédente" accent={C.yellow}>
            <p style={{ fontSize: 13, color: C.gd, marginBottom: 12 }}>
              Point de départ de l’entretien : où en est-on ? Modifie le statut, laisse tel quel
              sinon.
            </p>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Action</th>
                  <th style={S.th}>Échéance</th>
                  <th style={S.th}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {aReporter.map((act) => (
                  <tr key={act.id}>
                    <td style={S.td}>
                      {act.libelle}
                      {isEnRetard(act, today) && (
                        <>
                          {' '}
                          <Badge ton="red">en retard</Badge>
                        </>
                      )}
                    </td>
                    <td style={{ ...S.td, color: C.gd }}>
                      {act.echeance ? dateFr(act.echeance) : 'sans date'}
                    </td>
                    <td style={{ ...S.td, width: 170 }}>
                      <select
                        name={`report_${act.id}`}
                        defaultValue={act.statut}
                        style={{ ...S.input, padding: '6px 8px' }}
                      >
                        {ACTION_STATUTS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card titre="Chiffres de la période">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
              gap: 12,
            }}
          >
            <label style={S.label}>
              Date de l’entretien
              <input
                type="date"
                name="date"
                defaultValue={entretien?.date ?? today}
                style={S.input}
                required
              />
            </label>
            <label style={S.label}>
              CA signé (€ HT)
              <input
                name="caSigne"
                inputMode="decimal"
                defaultValue={entretien?.chiffres.caSigne ?? ''}
                style={S.input}
              />
            </label>
            <label style={S.label}>
              Pipeline pondéré déclaré (€)
              <input
                name="pipelinePondere"
                inputMode="decimal"
                defaultValue={entretien?.chiffres.pipelinePondere ?? ''}
                style={S.input}
                placeholder={pipeline?.rattache ? String(pipeline.pondere) : ''}
              />
            </label>
            <label style={S.label}>
              RDV tenus
              <input
                name="nbRdv"
                inputMode="numeric"
                defaultValue={entretien?.chiffres.nbRdv ?? ''}
                style={S.input}
              />
            </label>
            <label style={S.label}>
              Nouveaux comptes ouverts
              <input
                name="nbNouveauxComptes"
                inputMode="numeric"
                defaultValue={entretien?.chiffres.nbNouveauxComptes ?? ''}
                style={S.input}
              />
            </label>
          </div>
        </Card>

        {/* Saisie assistée : la transcription reste sous les yeux (panneau collant à gauche)
            pendant qu'on remplit la trame à droite. Voir .o3-cote-a-cote dans globals.css. */}
        <div className="o3-cote-a-cote">
          <div className="o3-collant">
            <Card titre="Transcription Google Meet" accent={C.gm}>
              <p style={{ fontSize: 12, color: C.gd, marginBottom: 10 }}>
                Ouvre le document <em>« … - Transcript »</em> dans ton Drive, sélectionne tout,
                colle ici. L’en-tête et le pied de page ajoutés par Google sont retirés
                automatiquement.
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: '#7a5800',
                  background: '#FFF9E0',
                  borderRadius: 2,
                  padding: '8px 10px',
                  marginBottom: 12,
                }}
              >
                <strong>Traité comme privé.</strong> Le verbatim ne part jamais vers le commercial,
                même une fois l’entretien partagé. Ne recopie pas de propos personnels dans la
                trame à droite.
              </p>
              <textarea
                name="transcription"
                defaultValue={entretien?.transcription ?? ''}
                style={{
                  ...S.textarea,
                  minHeight: 420,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
                placeholder="Colle ici la transcription de la réunion…"
              />

              {/* Second bouton de soumission du MÊME formulaire, redirigé par `formaction` vers
                  la route d'extraction. Tout est donc enregistré avant d'appeler le modèle : la
                  saisie du manager ne peut pas être perdue si l'extraction échoue. */}
              {extractionPossible && (
                <div style={{ marginTop: 12 }}>
                  <button
                    type="submit"
                    formAction="/api/one-on-one/extraction"
                    style={{ ...S.btnGhost, borderColor: C.klein, color: C.klein }}
                  >
                    Enregistrer et pré-remplir la trame
                  </button>
                  <p style={{ fontSize: 11, color: C.gd, marginTop: 8, lineHeight: 1.5 }}>
                    Complète uniquement les rubriques laissées vides, à partir de la transcription.
                    Ne touche jamais à la zone privée. L’entretien reste en brouillon :{' '}
                    <strong>relis avant de partager</strong>.
                  </p>
                </div>
              )}
            </Card>
          </div>

          <Card titre="Trame de l’entretien">
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={S.label}>
              Lecture des chiffres et du pipeline
              <textarea
                name="pipelineCommentaire"
                defaultValue={entretien?.partage.pipelineCommentaire ?? ''}
                style={S.textarea}
                placeholder="Écart vs objectif, qualité du pipeline, prévisions de signature…"
              />
            </label>
            <label style={S.label}>
              Deals à risque et blocages
              <textarea
                name="dealsARisque"
                defaultValue={entretien?.partage.dealsARisque ?? ''}
                style={S.textarea}
                placeholder="Affaires bloquées, comptes à relancer, aide attendue du manager…"
              />
            </label>
            <label style={S.label}>
              Activité amont
              <textarea
                name="activiteAmont"
                defaultValue={entretien?.partage.activiteAmont ?? ''}
                style={S.textarea}
                placeholder="Prospection, RDV pris, ouverture de comptes — les indicateurs avancés."
              />
            </label>
            <label style={S.label}>
              Administratif
              <textarea
                name="administratif"
                defaultValue={entretien?.partage.administratif ?? ''}
                style={S.textarea}
                placeholder="Saisie Boond, CRA, notes de frais, congés…"
              />
            </label>
            <label style={S.label}>
              Développement et montée en compétences
              <textarea
                name="developpement"
                defaultValue={entretien?.partage.developpement ?? ''}
                style={S.textarea}
                placeholder="Plan de progression, formation, accompagnement terrain."
              />
            </label>
            <label style={S.label}>
              Points clés et décisions
              <textarea
                name="pointsCles"
                defaultValue={entretien?.partage.pointsCles ?? ''}
                style={S.textarea}
                placeholder="Ce qui est décidé, à retenir de la séance."
              />
            </label>
          </div>
          </Card>
        </div>

        <Card titre="Actions décidées" accent={C.green}>
          <p style={{ fontSize: 13, color: C.gd, marginBottom: 12 }}>
            {LIGNES_ACTIONS} lignes disponibles. Les lignes vides sont ignorées. Pour en ajouter
            davantage, enregistre puis rouvre l’entretien.
          </p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: '50%' }}>Action</th>
                <th style={S.th}>Porteur</th>
                <th style={S.th}>Échéance</th>
                <th style={S.th}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {actionsDeCetEntretien.map((act) => (
                <tr key={act.id}>
                  <td style={S.td}>
                    <input type="hidden" name="action_id" value={act.id} />
                    <input name="action_libelle" defaultValue={act.libelle} style={S.input} />
                  </td>
                  <td style={S.td}>
                    <select name="action_porteur" defaultValue={act.porteur} style={S.input}>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="MANAGER">Manager</option>
                    </select>
                  </td>
                  <td style={S.td}>
                    <input
                      type="date"
                      name="action_echeance"
                      defaultValue={act.echeance ?? ''}
                      style={S.input}
                    />
                  </td>
                  <td style={S.td}>
                    <select name="action_statut" defaultValue={act.statut} style={S.input}>
                      {ACTION_STATUTS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {Array.from({ length: lignesVides }).map((_, i) => (
                <tr key={`vide-${i}`}>
                  <td style={S.td}>
                    <input type="hidden" name="action_id" value="" />
                    <input
                      name="action_libelle"
                      style={S.input}
                      placeholder="Ce qui doit être fait…"
                    />
                  </td>
                  <td style={S.td}>
                    <select name="action_porteur" defaultValue="COMMERCIAL" style={S.input}>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="MANAGER">Manager</option>
                    </select>
                  </td>
                  <td style={S.td}>
                    <input type="date" name="action_echeance" style={S.input} />
                  </td>
                  <td style={S.td}>
                    <select name="action_statut" defaultValue="OUVERTE" style={S.input}>
                      {ACTION_STATUTS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <BandeauPrive>
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={S.label}>
              Moral et motivation
              <textarea
                name="moral"
                defaultValue={entretien?.prive?.moral ?? ''}
                style={S.textarea}
                placeholder="Ton ressenti, l’ambiance, ce qui t’inquiète ou te rassure."
              />
            </label>
            <label style={{ ...S.label, maxWidth: 260 }}>
              Niveau de moral perçu
              <select
                name="humeur"
                defaultValue={entretien?.prive?.humeur ?? ''}
                style={S.input}
              >
                <option value="">Non évalué</option>
                <option value="1">1 — au plus bas</option>
                <option value="2">2 — en difficulté</option>
                <option value="3">3 — correct</option>
                <option value="4">4 — bon</option>
                <option value="5">5 — très bon</option>
              </select>
            </label>
            <label style={S.label}>
              Sujets RH
              <textarea
                name="notesRh"
                defaultValue={entretien?.prive?.notesRh ?? ''}
                style={S.textarea}
                placeholder="Rémunération, évolution, situation personnelle, alertes."
              />
            </label>
            <label style={S.label}>
              Notes brutes de séance
              <textarea
                name="notesBrutes"
                defaultValue={entretien?.notesBrutes ?? ''}
                style={{ ...S.textarea, minHeight: 140 }}
                placeholder="Jette ici ce qui a été dit, sans mise en forme. Traité comme privé : ces notes ne sont ni relues ni transmises."
              />
            </label>
          </div>
        </BandeauPrive>

        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button type="submit" style={S.btn}>
            Enregistrer l’entretien
          </button>
          <a href={commercialId ? `/1-1/commercial/${commercialId}` : '/1-1'} style={S.btnGhost}>
            Annuler
          </a>
        </div>
      </form>
    </Shell>
  );
}
