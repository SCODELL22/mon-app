// Historisation des imports — fonctions pures (aucune I/O), testables isolément.
// Chaque import BoondManager produit un "snapshot" daté. Comparer deux snapshots
// donne l'évolution du pipeline, les deals gagnés/perdus et la dynamique d'agence.
import { Opportunity, statutOf } from './domain';
import { summarize } from './aggregations';

/** Agrégats d'un snapshot, suffisants pour lister l'historique sans charger le détail. */
export interface SnapshotMeta {
  id: string; // dérivé de takenAt, sûr pour un nom de fichier
  takenAt: string; // ISO 8601
  count: number; // toutes opportunités
  ouvertes: number; // nb ouvertes
  brut: number; // pipeline brut (ouvert)
  pondere: number; // pipeline pondéré (ouvert)
  gagne: number; // CA gagné cumulé
  perdu: number; // montant perdu + abandonné
}

/** Snapshot complet : les agrégats + le détail des opportunités au moment de l'import. */
export interface Snapshot extends SnapshotMeta {
  opportunities: Opportunity[];
}

/** Construit un snapshot à partir des opportunités importées. */
export function makeSnapshot(opps: Opportunity[], takenAt: Date = new Date()): Snapshot {
  const { total } = summarize(opps);
  const iso = takenAt.toISOString();
  return {
    id: iso.replace(/[:.]/g, '-'),
    takenAt: iso,
    count: total.count,
    ouvertes: total.ouvertes,
    brut: total.brut,
    pondere: total.pondere,
    gagne: total.gagne,
    perdu: total.perdu,
    opportunities: opps,
  };
}

/** Sépare les métadonnées d'un snapshot de son détail (pour le listing). */
export function metaOf(s: SnapshotMeta): SnapshotMeta {
  return {
    id: s.id,
    takenAt: s.takenAt,
    count: s.count,
    ouvertes: s.ouvertes,
    brut: s.brut,
    pondere: s.pondere,
    gagne: s.gagne,
    perdu: s.perdu,
  };
}

export interface Delta {
  pondere: number;
  brut: number;
  gagne: number;
  perdu: number;
  ouvertes: number;
}

/** Variation d'un snapshot par rapport au précédent. null si pas de précédent. */
export function computeDelta(curr: SnapshotMeta, prev?: SnapshotMeta | null): Delta | null {
  if (!prev) return null;
  return {
    pondere: curr.pondere - prev.pondere,
    brut: curr.brut - prev.brut,
    gagne: curr.gagne - prev.gagne,
    perdu: curr.perdu - prev.perdu,
    ouvertes: curr.ouvertes - prev.ouvertes,
  };
}

export interface Transitions {
  nouvelles: Opportunity[]; // présentes maintenant, absentes avant
  gagnees: Opportunity[]; // passées d'ouvert à gagné
  perdues: Opportunity[]; // passées d'ouvert à perdu / abandonné
  disparues: number; // présentes avant, absentes maintenant
}

/**
 * Mouvements entre deux snapshots consécutifs. Donne le flux réel
 * (entrées de pipeline, signatures, pertes) impossible à voir sur un instantané.
 */
export function computeTransitions(prev: Snapshot, curr: Snapshot): Transitions {
  const prevById = new Map(prev.opportunities.map((o) => [o.id, o]));
  const currIds = new Set(curr.opportunities.map((o) => o.id));
  const nouvelles: Opportunity[] = [];
  const gagnees: Opportunity[] = [];
  const perdues: Opportunity[] = [];

  for (const o of curr.opportunities) {
    const before = prevById.get(o.id);
    if (!before) {
      nouvelles.push(o);
      continue;
    }
    const wasOpen = statutOf(before.etape) === 'open';
    const now = statutOf(o.etape);
    if (wasOpen && now === 'won') gagnees.push(o);
    else if (wasOpen && now === 'lost') perdues.push(o);
  }

  let disparues = 0;
  for (const id of prevById.keys()) if (!currIds.has(id)) disparues++;

  return { nouvelles, gagnees, perdues, disparues };
}

/**
 * Taux de transformation sur la période couverte par l'historique :
 * gagnées / (gagnées + perdues) cumulées sur tous les intervalles consécutifs.
 */
export function winRate(snaps: Snapshot[]): { gagnees: number; perdues: number; taux: number | null } {
  let gagnees = 0;
  let perdues = 0;
  for (let i = 1; i < snaps.length; i++) {
    const t = computeTransitions(snaps[i - 1], snaps[i]);
    gagnees += t.gagnees.length;
    perdues += t.perdues.length;
  }
  const clos = gagnees + perdues;
  return { gagnees, perdues, taux: clos > 0 ? (gagnees / clos) * 100 : null };
}

export interface TrendPoint {
  takenAt: string;
  pondere: number;
  gagne: number;
  brut: number;
}

/** Série temporelle (ordre chronologique croissant) pour tracer l'évolution. */
export function trendSeries(metas: SnapshotMeta[]): TrendPoint[] {
  return [...metas]
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
    .map((m) => ({ takenAt: m.takenAt, pondere: m.pondere, gagne: m.gagne, brut: m.brut }));
}
