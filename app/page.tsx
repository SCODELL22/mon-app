import Link from 'next/link';
import { listOpportunities, backendName } from '@/lib/store';
import { summarize } from '@/lib/aggregations';
import { OBJECTIF_CA_AGENCE } from '@/lib/config';
import { euros, pct } from '@/lib/format';
import { StatCard, BarTable } from '@/components/dashboard-ui';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; ignored?: string }>;
}) {
  const { imported, ignored } = await searchParams;
  const opps = await listOpportunities();
  const s = summarize(opps);
  const atterrissage = s.total.gagne + s.total.pondere;
  const objProgress = Math.min(100, (s.total.gagne / OBJECTIF_CA_AGENCE) * 100);
  const attProgress = Math.min(100, (atterrissage / OBJECTIF_CA_AGENCE) * 100);

  return (
    <div className="space-y-8">
      {imported && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Import réussi : {imported} opportunités chargées
          {ignored && Number(ignored) > 0 ? ` (${ignored} lignes ignorées)` : ''}.
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pilotage commercial</h1>
          <p className="text-sm text-slate-500">
            Source : {backendName()} · {s.total.count} opportunités
          </p>
        </div>
        <Link href="/import" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Importer un CSV
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pipeline pondéré" value={euros(s.total.pondere)} hint={`${s.total.ouvertes} opportunités ouvertes`} accent="text-indigo-700" />
        <StatCard label="Pipeline brut (ouvert)" value={euros(s.total.brut)} hint="hors gagné / perdu" />
        <StatCard label="CA gagné" value={euros(s.total.gagne)} accent="text-emerald-600" />
        <StatCard label="Perdu / abandonné" value={euros(s.total.perdu)} accent="text-rose-500" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between text-sm">
          <h3 className="font-semibold text-slate-700">Objectif agence {new Date().getFullYear()}</h3>
          <span className="text-slate-500">{euros(OBJECTIF_CA_AGENCE)}</span>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>CA gagné</span>
              <span>{pct(objProgress)} · {euros(s.total.gagne)}</span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${objProgress}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Atterrissage prévisionnel (gagné + pondéré)</span>
              <span>{pct(attProgress)} · {euros(atterrissage)}</span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${attProgress}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BarTable title="CA prévisionnel pondéré par pôle" rows={s.byPole} />
        <BarTable title="par commercial" rows={s.byCommercial} />
        <BarTable title="par secteur" rows={s.bySecteur} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Avancement du pipeline par étape</h3>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          {s.byEtape.map((e) => (
            <div key={e.etape} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: e.color }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
                {e.label}
              </div>
              <div className="mt-2 text-lg font-semibold tabular-nums">{e.count}</div>
              <div className="text-xs text-slate-400">{euros(e.montant)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
