import { GroupStat } from '@/lib/aggregations';
import { Etape, ETAPE_META } from '@/lib/domain';
import { TrendPoint } from '@/lib/snapshots';
import { QuarterForecast } from '@/lib/forecast';
import { CommercialObjective } from '@/lib/objectives';
import { euros, signedEuros, dateFr } from '@/lib/format';

/** Variation chiffrée : vert si hausse, rose si baisse. `goodWhenUp=false` inverse (ex. perdu). */
export function DeltaBadge({
  value,
  goodWhenUp = true,
}: {
  value: number;
  goodWhenUp?: boolean;
}) {
  const up = value > 0;
  const neutral = Math.round(value) === 0;
  const good = goodWhenUp ? up : !up;
  const cls = neutral ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-rose-500';
  return <span className={`text-xs font-medium tabular-nums ${cls}`}>{signedEuros(value)}</span>;
}

export function StatCard({
  label,
  value,
  hint,
  accent = 'text-slate-900',
  delta,
  deltaGoodWhenUp = true,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  delta?: number | null;
  deltaGoodWhenUp?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {hint && <span className="text-xs text-slate-400">{hint}</span>}
        {delta != null && (
          <>
            {hint && <span className="text-xs text-slate-300">·</span>}
            <DeltaBadge value={delta} goodWhenUp={deltaGoodWhenUp} />
          </>
        )}
      </div>
    </div>
  );
}

/** Courbe d'évolution (SVG, sans dépendance) : pipeline pondéré + CA gagné dans le temps. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const W = 720;
  const H = 220;
  const PAD = { top: 16, right: 16, bottom: 28, left: 16 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = points.length;
  const maxY = Math.max(1, ...points.map((p) => Math.max(p.pondere, p.gagne)));

  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / maxY) * innerH;
  const line = (key: 'pondere' | 'gagne') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Évolution du pipeline pondéré et du CA gagné">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + innerH - f * innerH}
          y2={PAD.top + innerH - f * innerH}
          stroke="#f1f5f9"
        />
      ))}
      {n > 1 && (
        <>
          <path d={line('pondere')} fill="none" stroke="#6366f1" strokeWidth={2} />
          <path d={line('gagne')} fill="none" stroke="#22c55e" strokeWidth={2} />
        </>
      )}
      {points.map((p, i) => (
        <g key={p.takenAt}>
          <circle cx={x(i)} cy={y(p.pondere)} r={3} fill="#6366f1" />
          <circle cx={x(i)} cy={y(p.gagne)} r={3} fill="#22c55e" />
          {(n <= 8 || i === 0 || i === n - 1 || i % Math.ceil(n / 8) === 0) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>
              {dateFr(p.takenAt).replace(/ \d{4}$/, '')}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function EtapeBadge({ etape }: { etape: Etape }) {
  const m = ETAPE_META[etape];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${m.color}1a`, color: m.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

export function BarTable({ title, rows }: { title: string; rows: GroupStat[] }) {
  const max = Math.max(1, ...rows.map((r) => r.pondere));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune donnée.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium text-slate-700">{r.key}</span>
                <span className="shrink-0 tabular-nums font-semibold text-indigo-700">
                  {euros(r.pondere)}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${(r.pondere / max) * 100}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>
                  {r.count} opp. · brut {euros(r.brut)}
                </span>
                {r.gagne > 0 && <span className="text-emerald-600">gagné {euros(r.gagne)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Atterrissage par trimestre : barre empilée CA gagné (sécurisé) + pondéré (attendu). */
export function QuarterForecastChart({ quarters }: { quarters: QuarterForecast[] }) {
  const max = Math.max(1, ...quarters.map((q) => q.gagne + q.pondere));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Atterrissage par trimestre</h3>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Gagné</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" />Pondéré</span>
        </div>
      </div>
      {quarters.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune opportunité datée. Renseignez les dates de clôture dans BoondManager.</p>
      ) : (
        <ul className="space-y-3">
          {quarters.map((q) => (
            <li key={q.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700">{q.label}</span>
                <span className="shrink-0 tabular-nums font-semibold text-slate-700">{euros(q.gagne + q.pondere)}</span>
              </div>
              <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500" style={{ width: `${(q.gagne / max) * 100}%` }} />
                <div className="h-full bg-indigo-500" style={{ width: `${(q.pondere / max) * 100}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>{q.count} opp. ouverte(s) datée(s)</span>
                <span>
                  {q.gagne > 0 && <span className="text-emerald-600">gagné {euros(q.gagne)} · </span>}
                  <span className="text-indigo-600">pondéré {euros(q.pondere)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Badge de couverture coloré selon la cible (vert ≥ cible, ambre ≥ 1×, rose < 1×). */
export function CoverageBadge({ value, cible }: { value: number | null; cible: number }) {
  if (value == null) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
        objectif atteint
      </span>
    );
  }
  const cls =
    value >= cible
      ? 'bg-emerald-100 text-emerald-800'
      : value >= 1
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rose-100 text-rose-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      {value.toFixed(1)}×
    </span>
  );
}

/** Objectifs & couverture par commercial : progression vs quota + ratio de couverture. */
export function ObjectivesTable({
  rows,
  total,
  cible,
}: {
  rows: CommercialObjective[];
  total: CommercialObjective;
  cible: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Objectifs &amp; couverture par commercial</h3>
        <span className="text-xs text-slate-400">
          Couverture = pipeline brut ouvert ÷ reste à faire · cible ≥ {cible}×
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-4">Commercial</th>
              <th className="px-4 py-2 text-right">Objectif</th>
              <th className="px-4 py-2">Réalisé</th>
              <th className="px-4 py-2 text-right">Reste à faire</th>
              <th className="px-4 py-2 text-right">Pondéré</th>
              <th className="px-4 py-2 text-right">Atterrissage</th>
              <th className="px-4 py-2 text-right">Écart</th>
              <th className="px-4 py-2 text-center">Couverture</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.commercial} className="hover:bg-slate-50">
                <td className="py-2.5 pr-4 font-medium text-slate-700">{r.commercial}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{euros(r.quota)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, r.progression)}%` }} />
                    </div>
                    <span className="tabular-nums text-xs text-slate-500">{Math.round(r.progression)} %</span>
                  </div>
                  <div className="mt-0.5 text-xs tabular-nums text-emerald-600">{euros(r.gagne)}</div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{euros(r.resteAFaire)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-indigo-700">{euros(r.pondere)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-800">{euros(r.atterrissage)}</td>
                <td className="px-4 py-2.5 text-right">
                  <DeltaBadge value={r.ecartObjectif} />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <CoverageBadge value={r.couverture} cible={cible} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200">
            <tr className="font-medium text-slate-800">
              <td className="py-2.5 pr-4">{total.commercial}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{euros(total.quota)}</td>
              <td className="px-4 py-2.5 tabular-nums text-emerald-600">{euros(total.gagne)} · {Math.round(total.progression)} %</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{euros(total.resteAFaire)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-indigo-700">{euros(total.pondere)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{euros(total.atterrissage)}</td>
              <td className="px-4 py-2.5 text-right"><DeltaBadge value={total.ecartObjectif} /></td>
              <td className="px-4 py-2.5 text-center"><CoverageBadge value={total.couverture} cible={cible} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
