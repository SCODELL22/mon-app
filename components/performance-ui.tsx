'use client';

// Vue Performance : CA & marge facturés par commercial puis par client, avancement annuel.
// Graphes « maison » (SVG / barres) pour rester sans dépendance externe.
import { useMemo, useState } from 'react';
import { CommercialPerf, PerformanceSummary } from '@/lib/performance';
import { euros } from '@/lib/format';

interface FactPoint {
  takenAt: string;
  periode: string | null;
  totalCa: number;
  totalMarge: number;
}

function euroCompact(n: number): string {
  const v = n || 0;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} M€`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1000)} k€`;
  return `${Math.round(v)} €`;
}
const pct1 = (n: number) => `${(n || 0).toFixed(1).replace('.', ',')} %`;
const pct0 = (n: number) => `${Math.round(n || 0)} %`;

/** Couleur d'état selon l'avancement vs le rythme attendu à date. */
function paceColor(p: CommercialPerf, pace: number): { bar: string; text: string; label: string } {
  if (p.objectif <= 0) return { bar: 'bg-slate-400', text: 'text-slate-500', label: '—' };
  const expected = p.objectif * (pace / 100);
  if (p.ca >= p.objectif) return { bar: 'bg-emerald-500', text: 'text-emerald-600', label: 'Objectif atteint' };
  if (p.ca >= expected) return { bar: 'bg-emerald-500', text: 'text-emerald-600', label: 'Dans les temps' };
  if (p.ca >= expected * 0.8) return { bar: 'bg-amber-500', text: 'text-amber-600', label: 'À surveiller' };
  return { bar: 'bg-rose-500', text: 'text-rose-600', label: 'En retard' };
}

export function PerformanceSection({
  data,
  periodeLabel,
  snapshots,
}: {
  data: PerformanceSummary;
  periodeLabel: string;
  snapshots: FactPoint[];
}) {
  const [view, setView] = useState<'ca' | 'marge'>('ca');
  const [open, setOpen] = useState<string | null>(null);

  const { rows, nonAttribue, total, pacePct } = data;
  const allRows = nonAttribue ? [...rows, nonAttribue] : rows;
  const scaleMax = Math.max(1, ...rows.map((r) => Math.max(r.objectif, r.ca)));

  const insights = useMemo(() => buildInsights(data), [data]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">Performance — CA &amp; marge réalisés</h2>
          <p className="text-sm text-slate-500">
            Facturation {periodeLabel} · objectifs annuels 2026 · {pct0(pacePct)} de l’année écoulée
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          <button
            onClick={() => setView('ca')}
            className={`rounded-md px-3 py-1 font-medium ${view === 'ca' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            CA
          </button>
          <button
            onClick={() => setView('marge')}
            className={`rounded-md px-3 py-1 font-medium ${view === 'marge' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Marge
          </button>
        </div>
      </div>

      {/* Bandeau agence */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Avancement agence</h3>
            <span className="text-xs text-slate-400">objectif {euroCompact(total.objectif)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <div className="text-2xl font-semibold tabular-nums text-emerald-600">{euros(total.ca)}</div>
              <div className="text-xs text-slate-400">CA facturé · {pct0(total.avancement)} de l’objectif</div>
            </div>
            <div>
              <div className="text-2xl font-semibold tabular-nums text-slate-800">{euros(total.marge)}</div>
              <div className="text-xs text-slate-400">marge · {pct1(total.margePct * 100)}</div>
            </div>
            <div>
              <div className={`text-lg font-semibold tabular-nums ${total.rythme >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {total.rythme >= 0 ? '+' : '−'}
                {euroCompact(Math.abs(total.rythme))}
              </div>
              <div className="text-xs text-slate-400">vs rythme attendu</div>
            </div>
          </div>
          {/* Jauge avec marqueur de rythme */}
          <div className="relative mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${total.ca >= total.objectif * (pacePct / 100) ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(100, total.avancement)}%` }}
            />
          </div>
          <div className="relative mt-1 h-4">
            <div
              className="absolute -top-[18px] h-3 w-0.5 bg-slate-700"
              style={{ left: `${Math.min(100, pacePct)}%` }}
              title="Rythme attendu à date"
            />
            <span className="absolute -translate-x-1/2 text-[10px] text-slate-500" style={{ left: `${Math.min(100, pacePct)}%` }}>
              rythme {pct0(pacePct)}
            </span>
          </div>
        </div>

        <YearProgressChart snapshots={snapshots} objectif={total.objectif} pacePct={pacePct} />
      </div>

      {/* Graphe principal : bullet chart par commercial */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">
            {view === 'ca' ? 'CA réalisé vs objectif par commercial' : 'Marge par commercial'}
          </h3>
          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> dans les temps</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> à surveiller</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> en retard</span>
            {view === 'ca' && <span className="inline-flex items-center gap-1"><span className="h-3 w-0.5 bg-slate-700" /> objectif</span>}
          </div>
        </div>

        <div className="space-y-1">
          {allRows.map((r) => {
            const pc = paceColor(r, pacePct);
            const isOpen = open === r.commercial;
            const margeScaleMax = Math.max(1, ...rows.map((x) => x.marge));
            const barW = view === 'ca' ? (r.ca / scaleMax) * 100 : (r.marge / margeScaleMax) * 100;
            const objW = (r.objectif / scaleMax) * 100;
            const paceW = (r.objectif * (pacePct / 100) / scaleMax) * 100;
            return (
              <div key={r.commercial} className="rounded-lg px-2 py-2 hover:bg-slate-50">
                <button onClick={() => setOpen(isOpen ? null : r.commercial)} className="flex w-full items-center gap-3 text-left">
                  <span className="w-44 shrink-0 truncate text-sm font-medium text-slate-700">
                    <span className={`mr-1 inline-block transition-transform ${isOpen ? 'rotate-90' : ''}`}>›</span>
                    {r.commercial}
                  </span>
                  <span className="relative h-6 flex-1 rounded bg-slate-100">
                    {view === 'ca' && (
                      <>
                        <span className="absolute inset-y-0 rounded bg-slate-200/70" style={{ width: `${objW}%` }} />
                        <span className="absolute inset-y-0 w-px bg-slate-400" style={{ left: `${paceW}%` }} title="rythme attendu" />
                      </>
                    )}
                    <span className={`absolute inset-y-0 rounded ${view === 'ca' ? pc.bar : 'bg-indigo-500'}`} style={{ width: `${Math.max(barW, 0.5)}%` }} />
                    {view === 'ca' && <span className="absolute inset-y-0 w-0.5 bg-slate-800" style={{ left: `${Math.min(objW, 100)}%` }} title="objectif" />}
                  </span>
                  <span className="w-28 shrink-0 text-right text-sm tabular-nums text-slate-700">
                    {view === 'ca' ? euros(r.ca) : euros(r.marge)}
                  </span>
                  <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums sm:block">
                    {view === 'ca' ? (
                      <span className={pc.text}>{pct0(r.avancement)} · {pc.label}</span>
                    ) : (
                      <span className="text-slate-500">{pct1(r.margePct * 100)}</span>
                    )}
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-2 space-y-1 border-l-2 border-slate-100 pl-6">
                    {r.clients.length === 0 && <p className="py-1 text-xs text-slate-400">Aucune facturation sur la période.</p>}
                    {r.clients.map((c) => (
                      <div key={c.client} className="flex items-center gap-3 text-xs">
                        <span className="w-40 shrink-0 truncate text-slate-600">{c.client}</span>
                        <span className="relative h-3 flex-1 rounded bg-slate-100">
                          <span
                            className="absolute inset-y-0 rounded bg-slate-400"
                            style={{ width: `${Math.max((view === 'ca' ? c.ca / (r.ca || 1) : c.marge / (r.marge || 1)) * 100, 1)}%` }}
                          />
                        </span>
                        <span className="w-24 shrink-0 text-right tabular-nums text-slate-600">{euros(view === 'ca' ? c.ca : c.marge)}</span>
                        <span className="w-16 shrink-0 text-right tabular-nums text-slate-400">{pct1(c.margePct * 100)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div className="mt-3 flex items-center gap-3 border-t border-slate-200 px-2 pt-3 text-sm font-medium text-slate-800">
          <span className="w-44 shrink-0">Total agence</span>
          <span className="flex-1" />
          <span className="w-28 shrink-0 text-right tabular-nums">{euros(view === 'ca' ? total.ca : total.marge)}</span>
          <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-slate-500 sm:block">
            {view === 'ca' ? pct0(total.avancement) : pct1(total.margePct * 100)}
          </span>
        </div>
      </div>

      {/* Lecture & pistes */}
      {insights.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Lecture &amp; pistes</h3>
          <ul className="space-y-1.5 text-sm text-slate-600">
            {insights.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Courbe d'avancement annuel : CA cumulé par photo vs ligne de rythme (0 → objectif sur l'année). */
function YearProgressChart({ snapshots, objectif, pacePct }: { snapshots: FactPoint[]; objectif: number; pacePct: number }) {
  const W = 320;
  const H = 150;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 18;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const yMax = Math.max(objectif * 1.05, 1);

  const monthOf = (s: FactPoint): number => {
    if (s.periode) {
      const m = s.periode.match(/-(\d{2})$/);
      if (m) return Math.min(11, Math.max(0, Number(m[1]) - 1));
    }
    return new Date(s.takenAt).getMonth();
  };
  const x = (month: number) => padL + (month / 11) * innerW;
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;

  const points = snapshots
    .map((s) => ({ m: monthOf(s), ca: s.totalCa }))
    .sort((a, b) => a.m - b.m);
  const paceMonth = (pacePct / 100) * 11;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">Avancement dans l’année</h3>
      <p className="mb-2 text-xs text-slate-400">CA cumulé vs rythme cible</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Avancement annuel">
        {/* grille horizontale */}
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padR} y1={y(yMax * f)} y2={y(yMax * f)} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {/* ligne de rythme 0 -> objectif */}
        <line x1={x(0)} y1={y(0)} x2={x(11)} y2={y(objectif)} stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 3" />
        {/* objectif */}
        <line x1={padL} x2={W - padR} y1={y(objectif)} y2={y(objectif)} stroke="#6366f1" strokeWidth={1} />
        <text x={W - padR} y={y(objectif) - 3} textAnchor="end" className="fill-indigo-500" fontSize="9">
          objectif {euroCompact(objectif)}
        </text>
        {/* marqueur date du jour */}
        <line x1={x(paceMonth)} y1={padT} x2={x(paceMonth)} y2={H - padB} stroke="#e2e8f0" strokeWidth={1} />
        {/* aire + points CA cumulé */}
        {points.length > 0 && (
          <>
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth={2}
              points={[`${x(0)},${y(0)}`, ...points.map((p) => `${x(p.m)},${y(p.ca)}`)].join(' ')}
            />
            {points.map((p, i) => (
              <circle key={i} cx={x(p.m)} cy={y(p.ca)} r={3} fill="#10b981" />
            ))}
            <text x={x(points[points.length - 1].m)} y={y(points[points.length - 1].ca) - 6} textAnchor="middle" className="fill-emerald-600" fontSize="9">
              {euroCompact(points[points.length - 1].ca)}
            </text>
          </>
        )}
        {/* axe mois */}
        {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map((m, i) => (
          <text key={i} x={x(i)} y={H - 5} textAnchor="middle" className="fill-slate-400" fontSize="8">
            {m}
          </text>
        ))}
      </svg>
      {snapshots.length < 2 && (
        <p className="text-[11px] text-slate-400">La courbe se construit à chaque import mensuel de facturation.</p>
      )}
    </div>
  );
}

function buildInsights(data: PerformanceSummary): string[] {
  const out: string[] = [];
  const { rows, total, nonAttribue, pacePct } = data;
  if (rows.length === 0) return out;

  // Concentration : top client de l'agence
  const allClients = rows.flatMap((r) => r.clients);
  const topClient = allClients.slice().sort((a, b) => b.ca - a.ca)[0];
  if (topClient && total.ca > 0) {
    out.push(
      `Concentration : ${topClient.client} pèse ${pct0((topClient.ca / total.ca) * 100)} du CA facturé de l’agence — dépendance à surveiller.`,
    );
  }
  // Retard vs rythme
  const enRetard = rows.filter((r) => r.objectif > 0 && r.ca < r.objectif * (pacePct / 100) * 0.8);
  if (enRetard.length) {
    out.push(
      `En retard sur le rythme : ${enRetard.map((r) => `${r.commercial} (${pct0(r.avancement)})`).join(', ')}. Prioriser la transformation du pipeline.`,
    );
  }
  // Marge
  const withCa = rows.filter((r) => r.ca > 0);
  if (withCa.length) {
    const best = withCa.slice().sort((a, b) => b.margePct - a.margePct)[0];
    const worst = withCa.slice().sort((a, b) => a.margePct - b.margePct)[0];
    out.push(
      `Marge : ${best.commercial} la meilleure (${pct1(best.margePct * 100)}), ${worst.commercial} la plus faible (${pct1(worst.margePct * 100)}) — leviers TJM / mix prestations.`,
    );
  }
  // Non attribué
  if (nonAttribue && nonAttribue.ca > 0) {
    out.push(
      `${euroCompact(nonAttribue.ca)} de CA « Non attribué » (comptes internes/partenaires ou hors mapping) — à rattacher si pertinent.`,
    );
  }
  return out;
}
