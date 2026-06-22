// Prévision d'atterrissage par trimestre — fonctions pures (aucune I/O), testables isolément.
// Principe métier : on ne projette dans un trimestre que les opportunités ouvertes dont la date
// de clôture est crédible (aujourd'hui ou future). Une affaire ouverte dont la date est dépassée
// est sortie de la prévision et signalée « à requalifier » : sa date n'est plus fiable.
import { Opportunity, statutOf, ponderation } from './domain';

export interface QuarterForecast {
  key: string; // "2026-T3"
  label: string; // "T3 2026"
  year: number;
  quarter: number; // 1..4
  count: number; // opportunités ouvertes datées dans ce trimestre
  brut: number; // somme des montants ouverts
  pondere: number; // somme pondérée des montants ouverts
  gagne: number; // CA déjà gagné clôturé sur ce trimestre
}

export interface Forecast {
  quarters: QuarterForecast[]; // ordre chronologique
  overdue: Opportunity[]; // ouvertes, date de clôture dépassée
  undated: Opportunity[]; // ouvertes, sans date de clôture
  overduePondere: number;
  undatedPondere: number;
}

/** Date du jour au format 'YYYY-MM-DD' (comparable aux dates stockées). */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Trimestre d'une date ISO, ou null si non parsable. */
export function quarterOf(dateISO: string | null): { year: number; quarter: number } | null {
  if (!dateISO) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, quarter: Math.floor((month - 1) / 3) + 1 };
}

/** Opportunité ouverte dont la date de clôture prévue est passée. */
export function isOverdue(o: Opportunity, today: string = todayISO()): boolean {
  return statutOf(o.etape) === 'open' && !!o.dateCloturePrev && o.dateCloturePrev < today;
}

export function buildForecast(opps: Opportunity[], now: Date = new Date()): Forecast {
  const today = todayISO(now);
  const map = new Map<string, QuarterForecast>();
  const overdue: Opportunity[] = [];
  const undated: Opportunity[] = [];

  const bucket = (year: number, quarter: number): QuarterForecast => {
    const key = `${year}-T${quarter}`;
    let q = map.get(key);
    if (!q) {
      q = { key, label: `T${quarter} ${year}`, year, quarter, count: 0, brut: 0, pondere: 0, gagne: 0 };
      map.set(key, q);
    }
    return q;
  };

  for (const o of opps) {
    const st = statutOf(o.etape);

    if (st === 'won') {
      const ql = quarterOf(o.dateCloturePrev);
      if (ql) bucket(ql.year, ql.quarter).gagne += o.montant;
      continue;
    }
    if (st !== 'open') continue; // perdu / abandonné : hors atterrissage

    if (!o.dateCloturePrev) {
      undated.push(o);
      continue;
    }
    if (o.dateCloturePrev < today) {
      overdue.push(o);
      continue;
    }
    const ql = quarterOf(o.dateCloturePrev);
    if (!ql) {
      undated.push(o);
      continue;
    }
    const q = bucket(ql.year, ql.quarter);
    q.count += 1;
    q.brut += o.montant;
    q.pondere += ponderation(o);
  }

  const quarters = [...map.values()].sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  const overduePondere = overdue.reduce((a, o) => a + ponderation(o), 0);
  const undatedPondere = undated.reduce((a, o) => a + ponderation(o), 0);

  return { quarters, overdue, undated, overduePondere, undatedPondere };
}
