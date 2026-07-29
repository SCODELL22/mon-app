// Fiche d'un commercial : pipeline courant, historique des entretiens, actions en cours.
import { notFound } from 'next/navigation';
import {
  acces,
  filtrerActionsPourLecteur,
  filtrerPourLecteur,
  peutAccederAuModule,
  peutVoirCommercial,
} from '@/lib/access';
import { getCommercial, listActions, listOneOnOnes } from '@/lib/one-on-one-store';
import { pipelineDuCommercial } from '@/lib/one-on-one-pipeline';
import {
  ACTION_STATUT_META,
  actionsParUrgence,
  aujourdHui,
  isEnRetard,
  joursEntre,
} from '@/lib/one-on-one';
import { dateFr, euros, pct } from '@/lib/format';
import { AccesRefuse, Badge, C, Card, Kpi, Message, S, Shell } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const a = await acces();
  if (!peutAccederAuModule(a)) return <AccesRefuse />;

  const { id } = await params;
  const commercial = await getCommercial(id);
  if (!commercial) notFound();

  // Un commercial ne consulte que sa propre fiche. Les entretiens qu'elle liste sont ensuite
  // filtrés un par un par filtrerPourLecteur() : les brouillons n'y apparaissent pas.
  if (!peutVoirCommercial(a, commercial.id)) return <AccesRefuse />;

  const today = aujourdHui();
  const [brutEntretiens, brutActions, pipeline] = await Promise.all([
    listOneOnOnes(commercial.id),
    listActions({ commercialId: commercial.id }),
    pipelineDuCommercial(commercial, today),
  ]);
  const entretiens = filtrerPourLecteur(brutEntretiens, a);
  // Idem : on part des entretiens NON filtrés pour décider, puis on ne garde que les actions
  // issues d'un entretien lisible par ce lecteur.
  const actions = filtrerActionsPourLecteur(brutActions, brutEntretiens, a);
  const ouvertes = actionsParUrgence(actions, today);

  const dernier = entretiens[0] ?? null;
  const atteinte = commercial.objectifAnnuel
    ? (pipeline.gagne / commercial.objectifAnnuel) * 100
    : null;

  return (
    <Shell titre={commercial.nom} estManager={a.estManager}>
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
          <h1 style={S.h1}>{commercial.nom}</h1>
          <p style={S.sub}>
            {commercial.pole || 'Pôle non renseigné'}
            {dernier ? ` — dernier 1:1 le ${dateFr(dernier.date)} (${joursEntre(dernier.date, today)} j)` : ' — aucun entretien enregistré'}
          </p>
        </div>
        {a.estManager && (
          <a href={`/1-1/nouveau?commercial=${commercial.id}`} style={S.btn}>
            Nouveau 1:1
          </a>
        )}
      </header>

      <div style={S.kpiGrid}>
        <Kpi label="Pipeline pondéré" valeur={euros(pipeline.pondere)} sousTitre={`${pipeline.nbOuvertes} affaire${pipeline.nbOuvertes > 1 ? 's' : ''} ouverte${pipeline.nbOuvertes > 1 ? 's' : ''}`} />
        <Kpi label="Pipeline brut" valeur={euros(pipeline.brut)} accent={C.gm} />
        <Kpi label="CA gagné" valeur={euros(pipeline.gagne)} accent={C.green} sousTitre={atteinte !== null ? `${pct(atteinte)} de l’objectif` : undefined} />
        <Kpi
          label="Actions ouvertes"
          valeur={String(ouvertes.length)}
          accent={ouvertes.some((x) => isEnRetard(x, today)) ? C.orange : C.yellow}
        />
      </div>

      {!pipeline.rattache && (
        <Message ton="info">
          Aucune opportunité BoondManager rattachée à cette fiche. Vérifie le champ{' '}
          <strong>libellé BoondManager</strong> dans{' '}
          <a href={`/1-1/commerciaux?edit=${commercial.id}`} style={S.link}>
            la fiche
          </a>{' '}
          : il doit reprendre à l’identique le « Responsable manager » de l’export.
        </Message>
      )}

      {ouvertes.length > 0 && (
        <Card titre="Actions en cours" accent={C.yellow}>
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
              {ouvertes.map((act) => {
                const retard = isEnRetard(act, today);
                return (
                  <tr key={act.id}>
                    <td style={S.td}>{act.libelle}</td>
                    <td style={{ ...S.td, color: C.gd }}>
                      {act.porteur === 'MANAGER' ? 'Manager' : commercial.nom}
                    </td>
                    <td style={S.td}>
                      {act.echeance ? (
                        <Badge ton={retard ? 'red' : 'gray'}>{dateFr(act.echeance)}</Badge>
                      ) : (
                        <span style={{ color: C.gm }}>sans date</span>
                      )}
                    </td>
                    <td style={S.td}>
                      <Badge ton={act.statut === 'EN_COURS' ? 'yellow' : 'blue'}>
                        {ACTION_STATUT_META[act.statut].label}
                      </Badge>
                    </td>
                    {a.estManager && (
                      <td style={{ ...S.td, textAlign: 'right' }}>
                        <form action="/api/one-on-one/action" method="POST">
                          <input type="hidden" name="id" value={act.id} />
                          <input type="hidden" name="statut" value="FAITE" />
                          <input
                            type="hidden"
                            name="retour"
                            value={`/1-1/commercial/${commercial.id}`}
                          />
                          <button type="submit" style={S.btnGhost}>
                            Marquer faite
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {pipeline.rattache && pipeline.principales.length > 0 && (
        <Card titre="Affaires les plus significatives">
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Affaire</th>
                <th style={S.th}>Client</th>
                <th style={S.th}>Montant</th>
                <th style={S.th}>Proba</th>
                <th style={S.th}>Clôture prévue</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.principales.map((o) => (
                <tr key={o.id}>
                  <td style={S.td}>{o.nom}</td>
                  <td style={{ ...S.td, color: C.gd }}>{o.client}</td>
                  <td style={S.td}>{euros(o.montant)}</td>
                  <td style={S.td}>{pct(o.probabilite)}</td>
                  <td style={S.td}>
                    {o.dateCloturePrev && o.dateCloturePrev < today ? (
                      <Badge ton="red">{dateFr(o.dateCloturePrev)}</Badge>
                    ) : (
                      dateFr(o.dateCloturePrev)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pipeline.enRetard.length > 0 && (
            <p style={{ fontSize: 12, color: C.orange, marginTop: 10 }}>
              {pipeline.enRetard.length} affaire{pipeline.enRetard.length > 1 ? 's' : ''} ouverte
              {pipeline.enRetard.length > 1 ? 's' : ''} au-delà de la date de clôture prévue — à
              passer en revue pendant l’entretien.
            </p>
          )}
        </Card>
      )}

      <Card titre="Historique des entretiens">
        {entretiens.length === 0 ? (
          <p style={S.empty}>Aucun entretien enregistré.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Date</th>
                <th style={S.th}>CA signé</th>
                <th style={S.th}>RDV</th>
                <th style={S.th}>Points clés</th>
              </tr>
            </thead>
            <tbody>
              {entretiens.map((e) => (
                <tr key={e.id}>
                  <td style={S.td}>
                    <a href={`/1-1/entretien/${e.id}`} style={S.link}>
                      {dateFr(e.date)}
                    </a>{' '}
                    {a.estManager && e.statut === 'BROUILLON' && (
                      <Badge ton="yellow">brouillon</Badge>
                    )}
                  </td>
                  <td style={S.td}>{e.chiffres.caSigne ? euros(e.chiffres.caSigne) : '—'}</td>
                  <td style={S.td}>{e.chiffres.nbRdv || '—'}</td>
                  <td style={{ ...S.td, color: C.gd }}>
                    {e.partage.pointsCles
                      ? e.partage.pointsCles.slice(0, 90) +
                        (e.partage.pointsCles.length > 90 ? '…' : '')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}
