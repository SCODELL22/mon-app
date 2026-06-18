import { GroupStat } from '@/lib/aggregations';
import { Etape, ETAPE_META } from '@/lib/domain';
import { euros } from '@/lib/format';

export function StatCard({
  label,
  value,
  hint,
  accent = 'text-slate-900',
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
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
