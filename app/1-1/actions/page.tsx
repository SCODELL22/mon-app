// Vue transverse des actions, organisée semaine par semaine — c'est l'écran de pilotage
// hebdomadaire : ce qui est en retard, ce qui tombe cette semaine, ce qui arrive.
import { acces, filtrerActionsPourLecteur, peutAccederAuModule, peutEcrire } from '@/lib/access';
import { listActions, listCommerciaux, listOneOnOnes } from '@/lib/one-on-one-store';
import {
  ACTION_STATUT_META,
  actionsParUrgence,
  aujourdHui,
  grouperParSemaine,
  isEnRetard,
  semaineIso,
  type Action,
} from '@/lib/one-on-one';
import { dateFr } from '@/lib/format';
import { AccesRefuse, Badge, C, Card, Kpi, S, Shell } from '../ui';

export const dynamic = 'force-dynamic';

function LigneAction({
  act,
  nomCommercial,
  today,
  editable,
}: {
  act: Action;
  nomCommercial: string;
  today: string;
  editable: boolean;
}) {
  const retard = isEnRetard(act, today);
  return (
    <tr>
      <td style={S.td}>
        <a href={`/1-1/entretien/${act.oneOnOneId}`} style={{ ...S.link, fontWeight: 400, color: C.deep }}>
          {act.libelle}
        </a>
      </td>
      <td style={{ ...S.td, color: C.gd }}>{nomCommercial}</td>
      <td style={{ ...S.td, color: C.gd }}>{act.porteur === 'MANAGER' ? 'Manager' : 'Commercial'}</td>
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
      {editable && (
        <td style={{ ...S.td, textAlign: 'right' }}>
          <form action="/api/one-on-one/action" method="POST" style={{ display: 'inline' }}>
            <input type="hidden" name="id" value={act.id} />
            <input type="hidden" name="statut" value="FAITE" />
            <input type="hidden" name="retour" value="/1-1/actions" />
            <button type="submit" style={S.btnGhost}>
              Faite
            </button>
          </form>
        </td>
      )}
    </tr>
  );
}

export default async function Page() {
  const a = await acces();
  if (!peutAccederAuModule(a)) return <AccesRefuse />;

  const today = aujourdHui();
  const semaineCourante = semaineIso(today);
  const editable = peutEcrire(a);

  const [commerciaux, toutes, entretiens] = await Promise.all([
    listCommerciaux(true),
    listActions(),
    listOneOnOnes(),
  ]);
  // Cloisonnement : un commercial ne voit que ses propres actions, et uniquement celles issues
  // d'entretiens PARTAGÉS. Filtrer sur le seul commercialId laisserait fuiter le contenu des
  // brouillons.
  const actions = filtrerActionsPourLecteur(toutes, entretiens, a);

  const nomDe = new Map(commerciaux.map((c) => [c.id, c.nom]));
  const ouvertes = actionsParUrgence(actions, today);
  const enRetard = ouvertes.filter((x) => isEnRetard(x, today));
  const parSemaine = grouperParSemaine(ouvertes.filter((x) => !isEnRetard(x, today)));

  // Semaines triées : les datées d'abord, chronologiquement, puis le groupe « sans échéance ».
  const semaines = [...parSemaine.keys()].sort((x, y) => {
    if (x === '') return 1;
    if (y === '') return -1;
    return x.localeCompare(y);
  });

  const enTete: Record<string, string> = { '': 'Sans échéance' };

  return (
    <Shell titre="Actions" estManager={a.estManager}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={S.h1}>Actions à suivre</h1>
        <p style={S.sub}>
          Semaine {semaineCourante.replace('-S', ' — semaine ')}. Les actions closes disparaissent
          de cette vue ; elles restent visibles dans le compte rendu d’origine.
        </p>
      </header>

      <div style={S.kpiGrid}>
        <Kpi label="Ouvertes" valeur={String(ouvertes.length)} />
        <Kpi
          label="En retard"
          valeur={String(enRetard.length)}
          accent={enRetard.length ? C.orange : C.green}
        />
        <Kpi
          label="Cette semaine"
          valeur={String((parSemaine.get(semaineCourante) ?? []).length)}
          accent={C.yellow}
        />
        <Kpi label="Sans échéance" valeur={String((parSemaine.get('') ?? []).length)} accent={C.gm} />
      </div>

      {enRetard.length > 0 && (
        <Card titre="En retard" accent={C.orange}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Action</th>
                <th style={S.th}>Commercial</th>
                <th style={S.th}>Porteur</th>
                <th style={S.th}>Échéance</th>
                <th style={S.th}>Statut</th>
                {editable && <th style={S.th}></th>}
              </tr>
            </thead>
            <tbody>
              {enRetard.map((act) => (
                <LigneAction
                  key={act.id}
                  act={act}
                  nomCommercial={nomDe.get(act.commercialId) ?? '—'}
                  today={today}
                  editable={editable}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {semaines.length === 0 && enRetard.length === 0 ? (
        <Card>
          <p style={S.empty}>Aucune action ouverte. Tout est traité.</p>
        </Card>
      ) : (
        semaines.map((sem) => {
          const liste = parSemaine.get(sem) ?? [];
          const courante = sem === semaineCourante;
          return (
            <Card
              key={sem || 'sans'}
              titre={
                enTete[sem] ??
                `${sem.replace('-S', ' — semaine ')}${courante ? ' (en cours)' : ''}`
              }
              accent={courante ? C.yellow : sem === '' ? C.gm : C.klein}
            >
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Action</th>
                    <th style={S.th}>Commercial</th>
                    <th style={S.th}>Porteur</th>
                    <th style={S.th}>Échéance</th>
                    <th style={S.th}>Statut</th>
                    {editable && <th style={S.th}></th>}
                  </tr>
                </thead>
                <tbody>
                  {liste.map((act) => (
                    <LigneAction
                      key={act.id}
                      act={act}
                      nomCommercial={nomDe.get(act.commercialId) ?? '—'}
                      today={today}
                      editable={editable}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })
      )}
    </Shell>
  );
}
