// Compte rendu d'un entretien — la page qu'on relit, qu'on imprime, qu'on transmet.
//
// Deux vues du MÊME entretien selon le lecteur :
//   - manager   : tout, y compris la zone privée signalée en jaune ;
//   - commercial: uniquement la zone partagée et ses actions.
// Le filtrage est fait côté serveur par filtrerPourLecteur() : le contenu privé n'est pas
// simplement masqué en CSS, il n'est jamais envoyé au navigateur.
import { notFound } from 'next/navigation';
import { acces, filtrerPourLecteur, peutAccederAuModule, peutLireEntretien } from '@/lib/access';
import { getCommercial, getOneOnOne, listActions, listOneOnOnes } from '@/lib/one-on-one-store';
import { ACTION_STATUT_META, aujourdHui, isActionOuverte, isEnRetard } from '@/lib/one-on-one';
import { dateFr, euros } from '@/lib/format';
import { AccesRefuse, BandeauPrive, Badge, C, Card, Message, S, Shell } from '../../ui';

export const dynamic = 'force-dynamic';

const HUMEURS: Record<number, string> = {
  1: '1 / 5 — au plus bas',
  2: '2 / 5 — en difficulté',
  3: '3 / 5 — correct',
  4: '4 / 5 — bon',
  5: '5 / 5 — très bon',
};

function Bloc({ titre, texte }: { titre: string; texte: string }) {
  if (!texte) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <h3
        style={{
          fontSize: 11,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: C.gd,
          marginBottom: 6,
        }}
      >
        {titre}
      </h3>
      {/* whiteSpace: pre-wrap pour conserver les retours à la ligne saisis dans le textarea. */}
      <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{texte}</p>
    </div>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ partage?: string; retire?: string }>;
}) {
  const a = await acces();
  if (!peutAccederAuModule(a)) return <AccesRefuse />;

  const { id } = await params;
  const { partage: vientDEtrePartage, retire } = await searchParams;
  const brut = await getOneOnOne(id);
  if (!brut) notFound();
  // Refuse aussi un brouillon demandé par le commercial concerné : tant que le manager n'a pas
  // partagé, l'entretien est invisible pour lui.
  if (!peutLireEntretien(a, brut)) return <AccesRefuse />;

  // Même en ayant vérifié le droit de lecture, on repasse par le filtre : c'est lui qui retire
  // la zone privée. Ne pas court-circuiter cette étape.
  const [entretien] = filtrerPourLecteur([brut], a);

  const today = aujourdHui();
  const [commercial, actions, tousSes1a1] = await Promise.all([
    getCommercial(entretien.commercialId),
    listActions({ oneOnOneId: entretien.id }),
    listOneOnOnes(entretien.commercialId),
  ]);

  // Entretien précédent : permet d'afficher le rappel « ce qui avait été décidé la fois d'avant ».
  const precedent = tousSes1a1
    .filter((e) => e.date < entretien.date || (e.date === entretien.date && e.createdAt < entretien.createdAt))
    .sort((x, y) => y.date.localeCompare(x.date))[0];
  const actionsPrecedentes = precedent ? await listActions({ oneOnOneId: precedent.id }) : [];

  const c = entretien.chiffres;
  const aDesChiffres = c.caSigne || c.pipelinePondere || c.nbRdv || c.nbNouveauxComptes;

  return (
    <Shell titre="Compte rendu" estManager={a.estManager}>
      <header
        style={{
          marginBottom: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={S.h1}>
            Entretien du {dateFr(entretien.date)}{' '}
            {a.estManager &&
              (entretien.statut === 'PARTAGE' ? (
                <Badge ton="green">partagé</Badge>
              ) : (
                <Badge ton="yellow">brouillon</Badge>
              ))}
          </h1>
          <p style={S.sub}>
            {commercial ? (
              <a href={`/1-1/commercial/${commercial.id}`} style={S.link}>
                {commercial.nom}
              </a>
            ) : (
              'Commercial inconnu'
            )}
            {a.estManager && entretien.auteurEmail ? ` — mené par ${entretien.auteurEmail}` : ''}
          </p>
        </div>
        {a.estManager && (
          <a href={`/1-1/nouveau?id=${entretien.id}`} style={S.btn}>
            Modifier
          </a>
        )}
      </header>

      {vientDEtrePartage && (
        <Message ton="ok">
          Compte rendu partagé. {commercial?.nom ?? 'Le commercial'} peut désormais le lire — hors
          zone privée.
        </Message>
      )}
      {retire && <Message ton="info">Partage retiré. Le compte rendu est repassé en brouillon.</Message>}

      {/* Bandeau de partage : le seul endroit d'où un compte rendu devient lisible du commercial. */}
      {a.estManager && (
        <section
          style={{
            background: entretien.statut === 'PARTAGE' ? '#E0F8F3' : '#FFFDF5',
            border: `1px solid ${entretien.statut === 'PARTAGE' ? C.green : C.yellow}`,
            borderRadius: 2,
            padding: '1rem 1.2rem',
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 13, maxWidth: 620 }}>
            {entretien.statut === 'PARTAGE' ? (
              <>
                <strong>Partagé le {dateFr(entretien.partageLe ?? '')}.</strong>{' '}
                {commercial?.nom ?? 'Le commercial'} peut lire le compte rendu et les actions. Ta
                zone privée reste invisible.
              </>
            ) : (
              <>
                <strong>Brouillon — personne d’autre que toi ne le voit.</strong> En partageant, tu
                rends lisibles les chiffres, la trame et les actions ci-dessous. Le moral, les
                sujets RH et les notes brutes ne partent pas. Relis avant de cliquer.
              </>
            )}
          </div>
          <form action="/api/one-on-one/partage" method="POST">
            <input type="hidden" name="id" value={entretien.id} />
            <input
              type="hidden"
              name="partager"
              value={entretien.statut === 'PARTAGE' ? '0' : '1'}
            />
            <button
              type="submit"
              style={entretien.statut === 'PARTAGE' ? S.btnGhost : S.btn}
            >
              {entretien.statut === 'PARTAGE' ? 'Retirer le partage' : 'Partager avec le commercial'}
            </button>
          </form>
        </section>
      )}

      {!a.estManager && (
        <Message ton="info">
          Ce compte rendu t’est partagé par ton manager. Les actions ci-dessous sont le
          récapitulatif de ce qui a été décidé.
        </Message>
      )}

      {aDesChiffres ? (
        <Card titre="Chiffres de la période">
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 14 }}>
            {c.caSigne > 0 && (
              <span>
                CA signé <strong>{euros(c.caSigne)}</strong>
              </span>
            )}
            {c.pipelinePondere > 0 && (
              <span>
                Pipeline pondéré <strong>{euros(c.pipelinePondere)}</strong>
              </span>
            )}
            {c.nbRdv > 0 && (
              <span>
                RDV tenus <strong>{c.nbRdv}</strong>
              </span>
            )}
            {c.nbNouveauxComptes > 0 && (
              <span>
                Nouveaux comptes <strong>{c.nbNouveauxComptes}</strong>
              </span>
            )}
          </div>
        </Card>
      ) : null}

      {actionsPrecedentes.length > 0 && (
        <Card titre={`Rappel — actions du ${dateFr(precedent!.date)}`} accent={C.gm}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Action</th>
                <th style={S.th}>Échéance</th>
                <th style={S.th}>Où ça en est</th>
              </tr>
            </thead>
            <tbody>
              {actionsPrecedentes.map((act) => (
                <tr key={act.id}>
                  <td style={S.td}>{act.libelle}</td>
                  <td style={{ ...S.td, color: C.gd }}>
                    {act.echeance ? dateFr(act.echeance) : '—'}
                  </td>
                  <td style={S.td}>
                    <Badge
                      ton={
                        act.statut === 'FAITE'
                          ? 'green'
                          : act.statut === 'ABANDONNEE'
                            ? 'gray'
                            : isEnRetard(act, today)
                              ? 'red'
                              : 'blue'
                      }
                    >
                      {ACTION_STATUT_META[act.statut].label}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card titre="Compte rendu">
        <Bloc titre="Lecture des chiffres et du pipeline" texte={entretien.partage.pipelineCommentaire} />
        <Bloc titre="Deals à risque et blocages" texte={entretien.partage.dealsARisque} />
        <Bloc titre="Activité amont" texte={entretien.partage.activiteAmont} />
        <Bloc titre="Administratif" texte={entretien.partage.administratif} />
        <Bloc titre="Développement et montée en compétences" texte={entretien.partage.developpement} />
        <Bloc titre="Points clés et décisions" texte={entretien.partage.pointsCles} />
        {!Object.values(entretien.partage).some(Boolean) && (
          <p style={S.empty}>Aucun texte saisi pour cet entretien.</p>
        )}
      </Card>

      <Card titre="Actions décidées" accent={C.green}>
        {actions.length === 0 ? (
          <p style={S.empty}>Aucune action décidée pendant cet entretien.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Action</th>
                <th style={S.th}>Porteur</th>
                <th style={S.th}>Échéance</th>
                <th style={S.th}>Statut</th>
                {a.estManager && <th style={S.th}></th>}
              </tr>
            </thead>
            <tbody>
              {actions.map((act) => (
                <tr key={act.id}>
                  <td style={S.td}>{act.libelle}</td>
                  <td style={{ ...S.td, color: C.gd }}>
                    {act.porteur === 'MANAGER' ? 'Manager' : (commercial?.nom ?? 'Commercial')}
                  </td>
                  <td style={S.td}>
                    {act.echeance ? (
                      <Badge ton={isEnRetard(act, today) ? 'red' : 'gray'}>
                        {dateFr(act.echeance)}
                      </Badge>
                    ) : (
                      <span style={{ color: C.gm }}>sans date</span>
                    )}
                  </td>
                  <td style={S.td}>
                    <Badge
                      ton={
                        act.statut === 'FAITE'
                          ? 'green'
                          : act.statut === 'ABANDONNEE'
                            ? 'gray'
                            : act.statut === 'EN_COURS'
                              ? 'yellow'
                              : 'blue'
                      }
                    >
                      {ACTION_STATUT_META[act.statut].label}
                    </Badge>
                  </td>
                  {a.estManager && (
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      {isActionOuverte(act.statut) && (
                        <form action="/api/one-on-one/action" method="POST">
                          <input type="hidden" name="id" value={act.id} />
                          <input type="hidden" name="statut" value="FAITE" />
                          <input type="hidden" name="retour" value={`/1-1/entretien/${entretien.id}`} />
                          <button type="submit" style={S.btnGhost}>
                            Marquer faite
                          </button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Zone privée : rendue uniquement pour un manager. Pour un commercial, entretien.prive vaut
          null car filtrerPourLecteur() l'a retirée avant même le rendu. */}
      {/* Le bandeau s'affiche dès qu'il y a QUELQUE CHOSE de privé — zone manager ou verbatim.
          Tester `prive` seul masquerait la transcription d'un entretien sans note manager. */}
      {a.estManager && (entretien.prive || entretien.notesBrutes || entretien.transcription) && (
        <BandeauPrive>
          <Bloc titre="Moral et motivation" texte={entretien.prive?.moral ?? ''} />
          {entretien.prive && entretien.prive.humeur !== null && (
            <div style={{ marginBottom: 18 }}>
              <h3
                style={{
                  fontSize: 11,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: C.gd,
                  marginBottom: 6,
                }}
              >
                Niveau de moral perçu
              </h3>
              <Badge ton={entretien.prive.humeur <= 2 ? 'red' : entretien.prive.humeur >= 4 ? 'green' : 'yellow'}>
                {HUMEURS[entretien.prive.humeur]}
              </Badge>
            </div>
          )}
          <Bloc titre="Sujets RH" texte={entretien.prive?.notesRh ?? ''} />
          <Bloc titre="Notes brutes de séance" texte={entretien.notesBrutes} />

          {/* Verbatim replié par défaut : c'est long, et l'ouvrir doit rester un geste conscient
              — on ne laisse pas un enregistrement intégral à l'écran par inadvertance. */}
          {entretien.transcription && (
            <details style={{ marginTop: 6 }}>
              <summary
                style={{
                  fontSize: 11,
                  letterSpacing: '.1em',
                  textTransform: 'uppercase',
                  color: C.gd,
                  cursor: 'pointer',
                  marginBottom: 10,
                }}
              >
                Transcription Google Meet ({entretien.transcription.length.toLocaleString('fr-FR')}{' '}
                caractères)
              </summary>
              <div
                className="o3-verbatim"
                style={{
                  background: '#fff',
                  border: `1px solid ${C.gl}`,
                  borderRadius: 2,
                  padding: '10px 12px',
                  maxHeight: 420,
                  overflowY: 'auto',
                }}
              >
                {entretien.transcription}
              </div>
            </details>
          )}

          {!entretien.prive?.moral &&
            !entretien.prive?.notesRh &&
            !entretien.notesBrutes &&
            !entretien.transcription && (
              <p style={{ fontSize: 13, color: C.gd }}>Aucune note privée sur cet entretien.</p>
            )}
        </BandeauPrive>
      )}
    </Shell>
  );
}
