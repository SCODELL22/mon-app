// Agrégations de pilotage — fonctions pures (aucune I/O), testables isolément.
import { Etape, Opportunity, ETAPES, statutOf, ponderation } from './domain';

export interface GroupStat {
  key: string;
  count: number; // nb d'opportunités ouvertes
  brut: number; // somme des montants ouverts
  pondere: number; // somme pondérée des montants ouverts
  gagne: number; // CA déjà gagné sur ce groupe
}

export interface EtapeStat {
  etape: Etape;
  label: string;
  color: string;
  count: number;
  montant: number; // somme brute à cette étape
  pondere: number; // somme pondérée à cette étape
}

export interface Summary {
  total: {
    count: number; // toutes opportunités
    ouvertes: number; // nb ouvertes
    brut: number; // pipeline brut (ouvert)
    pondere: number; // pipeline pondéré (ouvert)
    gagne: number; // CA gagné
    perdu: number; // montant perdu + abandonné
  };
  byPole: GroupStat[];
  byCommercial: GroupStat[];
  bySecteur: GroupStat[];
  byEtape: EtapeStat[];
}

function group(opps: Opportunity[], keyFn: (o: Opportunity) => string): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const o of opps) {
    const key = keyFn(o) || '(non renseigné)';
    let g = map.get(key);
    if (!g) {
      g = { key, count: 0, brut: 0, pondere: 0, gagne: 0 };
      map.set(key, g);
    }
    const st = statutOf(o.etape);
    if (st === 'open') {
      g.count += 1;
      g.brut += o.montant;
      g.pondere += ponderation(o);
    } else if (st === 'won') {
      g.gagne += o.montant;
    }
  }
  return [...map.values()].sort((a, b) => b.pondere - a.pondere || b.gagne - a.gagne);
}

export function summarize(opps: Opportunity[]): Summary {
  const total = { count: opps.length, ouvertes: 0, brut: 0, pondere: 0, gagne: 0, perdu: 0 };
  for (const o of opps) {
    const st = statutOf(o.etape);
    if (st === 'open') {
      total.ouvertes += 1;
      total.brut += o.montant;
      total.pondere += ponderation(o);
    } else if (st === 'won') {
      total.gagne += o.montant;
    } else {
      total.perdu += o.montant;
    }
  }

  const byEtape: EtapeStat[] = ETAPES.map((meta) => {
    const subset = opps.filter((o) => o.etape === meta.value);
    return {
      etape: meta.value,
      label: meta.label,
      color: meta.color,
      count: subset.length,
      montant: subset.reduce((s, o) => s + o.montant, 0),
      pondere: subset.reduce((s, o) => s + ponderation(o), 0),
    };
  });

  return {
    total,
    byPole: group(opps, (o) => o.pole),
    byCommercial: group(opps, (o) => o.commercial),
    bySecteur: group(opps, (o) => o.secteur),
    byEtape,
  };
}
