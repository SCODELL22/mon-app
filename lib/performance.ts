// Agrégation « Performance » — CA & marge facturés par commercial puis par client,
// confrontés à l'objectif annuel, avec mesure de l'avancement dans l'année.
// Fonctions pures (aucune I/O) : testables isolément.
import { FacturationRow } from './facturation';
import { NON_ATTRIBUE } from './config';

export interface ClientPerf {
  client: string;
  ca: number;
  marge: number;
  margePct: number; // marge / ca
  partCa: number; // ca client / ca du commercial
}

export interface CommercialPerf {
  commercial: string;
  objectif: number;
  ca: number; // CA facturé réalisé
  marge: number;
  margePct: number;
  ecart: number; // ca - objectif (négatif = sous l'objectif)
  avancement: number; // ca / objectif en % (0..∞)
  rythme: number; // ca - objectif attendu à date (positif = en avance)
  attribue: boolean; // false pour la ligne « Non attribué »
  clients: ClientPerf[];
}

export interface PerformanceSummary {
  rows: CommercialPerf[]; // commerciaux attribués, triés par objectif décroissant
  nonAttribue: CommercialPerf | null; // CA sans commercial mappé
  total: {
    objectif: number;
    ca: number;
    marge: number;
    margePct: number;
    ecart: number;
    avancement: number;
    rythme: number;
  };
  pacePct: number; // part de l'année écoulée (0..100) = objectif attendu à date
  jourAnnee: number;
}

/** Part de l'année écoulée à la date donnée (0..1), base 365/366. */
export function yearProgress(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const next = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  const now = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return (now - start) / (next - start);
}

function ratio(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

export function buildPerformance(
  rows: FacturationRow[],
  objectifs: Record<string, number>,
  dateRef: Date = new Date(),
): PerformanceSummary {
  const pace = yearProgress(dateRef); // 0..1

  type Acc = { ca: number; marge: number; clients: ClientPerf[] };
  const map = new Map<string, Acc>();
  const ensure = (k: string) => {
    let v = map.get(k);
    if (!v) {
      v = { ca: 0, marge: 0, clients: [] };
      map.set(k, v);
    }
    return v;
  };
  // Tout commercial ayant un objectif doit apparaître, même sans facturation.
  for (const k of Object.keys(objectifs)) ensure(k);

  for (const r of rows) {
    const key = r.commercial || NON_ATTRIBUE;
    const v = ensure(key);
    v.ca += r.ca;
    v.marge += r.marge;
    v.clients.push({ client: r.client, ca: r.ca, marge: r.marge, margePct: ratio(r.marge, r.ca), partCa: 0 });
  }

  const toPerf = (commercial: string, v: Acc, attribue: boolean): CommercialPerf => {
    const objectif = objectifs[commercial] ?? 0;
    const clients = v.clients
      .map((c) => ({ ...c, partCa: ratio(c.ca, v.ca) }))
      .sort((a, b) => b.ca - a.ca);
    return {
      commercial,
      objectif,
      ca: v.ca,
      marge: v.marge,
      margePct: ratio(v.marge, v.ca),
      ecart: v.ca - objectif,
      avancement: ratio(v.ca, objectif) * 100,
      rythme: v.ca - objectif * pace,
      attribue,
      clients,
    };
  };

  const rowsPerf = [...map.entries()]
    .filter(([k]) => k !== NON_ATTRIBUE)
    .map(([k, v]) => toPerf(k, v, true))
    .sort((a, b) => b.objectif - a.objectif || b.ca - a.ca);

  const naAcc = map.get(NON_ATTRIBUE);
  const nonAttribue = naAcc && naAcc.ca !== 0 ? toPerf(NON_ATTRIBUE, naAcc, false) : null;

  const objectifTotal = Object.values(objectifs).reduce((s, q) => s + q, 0);
  const caTotal = rowsPerf.reduce((s, r) => s + r.ca, 0) + (nonAttribue?.ca ?? 0);
  const margeTotal = rowsPerf.reduce((s, r) => s + r.marge, 0) + (nonAttribue?.marge ?? 0);

  return {
    rows: rowsPerf,
    nonAttribue,
    total: {
      objectif: objectifTotal,
      ca: caTotal,
      marge: margeTotal,
      margePct: ratio(margeTotal, caTotal),
      ecart: caTotal - objectifTotal,
      avancement: ratio(caTotal, objectifTotal) * 100,
      rythme: caTotal - objectifTotal * pace,
    },
    pacePct: pace * 100,
    jourAnnee: Math.round(pace * 365),
  };
}
