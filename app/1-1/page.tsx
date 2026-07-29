// Tableau de bord du suivi 1:1 : où en est chaque commercial, qui n'a pas été vu depuis
// longtemps, combien d'actions traînent.
import {
  acces,
  filtrerActionsPourLecteur,
  filtrerPourLecteur,
  peutAccederAuModule,
} from '@/lib/access';
import { listActions, listCommerciaux, listOneOnOnes } from '@/lib/one-on-one-store';
import { aujourdHui, construireSuivi, isActionOuverte, isEnRetard } from '@/lib/one-on-one';
import { dateFr } from '@/lib/format';
import { AccesRefuse, Badge, C, Card, Kpi, Message, S, Shell } from './ui';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const a = await acces();
  if (!peutAccederAuModule(a)) return <AccesRefuse />;

  const today = aujourdHui();
  const [tousCommerciaux, tousEntretiens, toutesActions] = await Promise.all([
    listCommerciaux(),
    listOneOnOnes(),
    listActions(),
  ]);

  // Cloisonnement : un commercial ne voit que sa propre ligne et ses propres actions.
  const commerciaux = a.estManager
    ? tousCommerciaux
    : tousCommerciaux.filter((c) => c.id === a.commercial?.id);
  const entretiens = filtrerPourLecteur(tousEntretiens, a);
  // Actions restreintes aux entretiens que le lecteur a le droit de voir : sans ça, un commercial
  // verrait les actions d'un brouillon le concernant.
  const actions = filtrerActionsPourLecteur(toutesActions, tousEntretiens, a);

  const suivi = construireSuivi(commerciaux, entretiens, actions, today);
  const ouvertes = actions.filter((x) => isActionOuverte(x.statut));
  const enRetard = actions.filter((x) => isEnRetard(x, today));

  // Seuil d'alerte : un commercial vu il y a plus de 14 jours sort du rythme bimensuel.
  const SEUIL_JOURS = 14;
  const aVoir = suivi.filter(
    (s) => s.joursDepuisDernier === null || s.joursDepuisDernier > SEUIL_JOURS,
  );

  return (
    <Shell titre="Suivi des 1:1" estManager={a.estManager}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={S.h1}>Suivi des entretiens</h1>
        <p style={S.sub}>
          {a.estManager
            ? `${commerciaux.length} commercial${commerciaux.length > 1 ? 'aux' : ''} suivi${commerciaux.length > 1 ? 's' : ''}.`
            : 'Tes comptes rendus d’entretien et les actions qui te concernent.'}
        </p>
      </header>

      <div style={S.kpiGrid}>
        <Kpi label="Entretiens" valeur={String(entretiens.length)} sousTitre="depuis le début" />
        {a.estManager && (
          <Kpi
            label="Brouillons"
            valeur={String(entretiens.filter((e) => e.statut === 'BROUILLON').length)}
            accent={C.gm}
            sousTitre="non partagés"
          />
        )}
        <Kpi label="Actions ouvertes" valeur={String(ouvertes.length)} accent={C.yellow} />
        <Kpi
          label="Actions en retard"
          valeur={String(enRetard.length)}
          accent={enRetard.length ? C.orange : C.green}
          sousTitre={enRetard.length ? 'échéance dépassée' : 'rien en retard'}
        />
        {a.estManager && (
          <Kpi
            label="À revoir"
            valeur={String(aVoir.length)}
            accent={aVoir.length ? C.orange : C.green}
            sousTitre={`sans 1:1 depuis ${SEUIL_JOURS} j`}
          />
        )}
      </div>

      {a.estManager && commerciaux.length === 0 && (
        <Message ton="info">
          Aucun commercial enregistré. Commence par créer les fiches dans{' '}
          <a href="/1-1/commerciaux" style={S.link}>
            Commerciaux
          </a>{' '}
          — le rattachement au libellé BoondManager s’y fait aussi.
        </Message>
      )}

      <Card titre="Par commercial">
        {suivi.length === 0 ? (
          <p style={S.empty}>Rien à afficher.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Commercial</th>
                <th style={S.th}>Pôle</th>
                <th style={S.th}>Dernier 1:1</th>
                <th style={S.th}>Ancienneté</th>
                <th style={S.th}>Actions</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {suivi.map((s) => {
                const retard =
                  s.joursDepuisDernier === null || s.joursDepuisDernier > SEUIL_JOURS;
                return (
                  <tr key={s.commercial.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      <a href={`/1-1/commercial/${s.commercial.id}`} style={S.link}>
                        {s.commercial.nom}
                      </a>
                    </td>
                    <td style={{ ...S.td, color: C.gd }}>{s.commercial.pole || '—'}</td>
                    <td style={S.td}>
                      {s.dernierEntretien ? dateFr(s.dernierEntretien.date) : '—'}
                    </td>
                    <td style={S.td}>
                      {s.joursDepuisDernier === null ? (
                        <Badge ton="gray">jamais</Badge>
                      ) : (
                        <Badge ton={retard ? 'orange' : 'green'}>
                          {s.joursDepuisDernier} j
                        </Badge>
                      )}
                    </td>
                    <td style={S.td}>
                      {s.actionsOuvertes === 0 ? (
                        <span style={{ color: C.gm }}>—</span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <Badge ton="blue">{s.actionsOuvertes} ouverte{s.actionsOuvertes > 1 ? 's' : ''}</Badge>
                          {s.actionsEnRetard > 0 && (
                            <Badge ton="red">{s.actionsEnRetard} en retard</Badge>
                          )}
                        </span>
                      )}
                    </td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      {a.estManager && (
                        <a
                          href={`/1-1/nouveau?commercial=${s.commercial.id}`}
                          style={S.btnGhost}
                        >
                          Nouveau 1:1
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card titre="Derniers entretiens">
        {entretiens.length === 0 ? (
          <p style={S.empty}>Aucun entretien enregistré.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Date</th>
                <th style={S.th}>Commercial</th>
                <th style={S.th}>Points clés</th>
              </tr>
            </thead>
            <tbody>
              {entretiens.slice(0, 12).map((e) => {
                const c = tousCommerciaux.find((x) => x.id === e.commercialId);
                return (
                  <tr key={e.id}>
                    <td style={S.td}>
                      <a href={`/1-1/entretien/${e.id}`} style={S.link}>
                        {dateFr(e.date)}
                      </a>{' '}
                      {a.estManager && e.statut === 'BROUILLON' && (
                        <Badge ton="yellow">brouillon</Badge>
                      )}
                    </td>
                    <td style={S.td}>{c?.nom ?? '—'}</td>
                    <td style={{ ...S.td, color: C.gd }}>
                      {e.partage.pointsCles
                        ? e.partage.pointsCles.slice(0, 110) +
                          (e.partage.pointsCles.length > 110 ? '…' : '')
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}
