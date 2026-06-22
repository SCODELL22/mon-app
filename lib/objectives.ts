// Objectifs & couverture par commercial — fonctions pures (aucune I/O), testables isolément.
// Le ratio de couverture répond à la question d'un DC : « ce commercial a-t-il assez de
// pipeline pour sécuriser son objectif ? » Couverture = pipeline brut ouvert ÷ reste à faire.
import { Opportunity, statutOf, ponderation } from './domain';

export interface CommercialObjective {
  commercial: string;
  quota: number; // objectif annuel
  gagne: number; // CA déjà réalisé
  brut: number; // pipeline brut ouvert
  pondere: number; // pipeline pondéré ouvert
  resteAFaire: number; // max(0, quota - gagné)
  atterrissage: number; // gagné + pondéré
  ecartObjectif: number; // atterrissage - quota (négatif = sous l'objectif)
  progression: number; // gagné / quota en %
  couverture: number | null; // brut / reste à faire ; null si objectif déjà atteint
}

export interface ObjectivesSummary {
  rows: CommercialObjective[];
  total: CommercialObjective; // ligne agrégée « toute l'agence »
}

function derive(
  commercial: string,
  quota: number,
  v: { gagne: number; brut: number; pondere: number },
): CommercialObjective {
  const resteAFaire = Math.max(0, quota - v.gagne);
  const atterrissage = v.gagne + v.pondere;
  return {
    commercial,
    quota,
    gagne: v.gagne,
    brut: v.brut,
    pondere: v.pondere,
    resteAFaire,
    atterrissage,
    ecartObjectif: atterrissage - quota,
    progression: quota > 0 ? (v.gagne / quota) * 100 : 0,
    couverture: resteAFaire > 0 ? v.brut / resteAFaire : null,
  };
}

export function objectivesByCommercial(
  opps: Opportunity[],
  quotas: Record<string, number>,
  defaultQuota: number,
): ObjectivesSummary {
  const map = new Map<string, { gagne: number; brut: number; pondere: number }>();
  const ensure = (k: string) => {
    let v = map.get(k);
    if (!v) {
      v = { gagne: 0, brut: 0, pondere: 0 };
      map.set(k, v);
    }
    return v;
  };

  for (const o of opps) {
    const v = ensure(o.commercial || '(non renseigné)');
    const st = statutOf(o.etape);
    if (st === 'open') {
      v.brut += o.montant;
      v.pondere += ponderation(o);
    } else if (st === 'won') {
      v.gagne += o.montant;
    }
  }
  // Un commercial avec un objectif mais aucune opportunité doit apparaître (couverture nulle).
  for (const k of Object.keys(quotas)) ensure(k);

  const rows = [...map.entries()]
    .map(([commercial, v]) => derive(commercial, quotas[commercial] ?? defaultQuota, v))
    .sort((a, b) => b.quota - a.quota || b.atterrissage - a.atterrissage);

  const agg = rows.reduce(
    (acc, r) => {
      acc.quota += r.quota;
      acc.gagne += r.gagne;
      acc.brut += r.brut;
      acc.pondere += r.pondere;
      return acc;
    },
    { quota: 0, gagne: 0, brut: 0, pondere: 0 },
  );
  const total = derive('Agence', agg.quota, { gagne: agg.gagne, brut: agg.brut, pondere: agg.pondere });

  return { rows, total };
}
