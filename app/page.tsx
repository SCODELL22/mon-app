import Link from 'next/link';
import { listOpportunities, backendName, listSnapshotMetas } from '@/lib/store';
import { summarize } from '@/lib/aggregations';
import { computeDelta } from '@/lib/snapshots';
import { buildForecast } from '@/lib/forecast';
import { objectivesByCommercial } from '@/lib/objectives';
import { OBJECTIF_CA_AGENCE, OBJECTIFS_COMMERCIAUX, OBJECTIF_CA_DEFAUT, COUVERTURE_CIBLE } from '@/lib/config';
import { euros, pct, dateFr } from '@/lib/format';
import { StatCard, BarTable, QuarterForecastChart, ObjectivesTable } from '@/components/dashboard-ui';

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

  // Variation vs l'avant-dernier import (le dernier reflète l'état courant).
  const metas = await listSnapshotMetas();
  const last = metas[metas.length - 1];
  const prev = metas[metas.length - 2];
  const delta = last && prev ? computeDelta(last, prev) : null;

  // Atterrissage par trimestre + opportunités ouvertes à date de clôture dépassée.
  const forecast = buildForecast(opps);

  // Objectifs & couverture par commercial (quota vs réalisé/pipeline).
  const objectifs = objectivesByCommercial(opps, OBJECTIFS_COMMERCIAUX, OBJECTIF_CA_DEFAUT);

  return (
    <div className="space-y-8">
      {imported && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Import réussi : {imported} opportunités chargées
          {ignored && Number(ignored) > 0 ? ` (${ignored} lignes ignorées)` : ''}.
        </div>
      )}

      {forecast.overdue.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            <strong>{forecast.overdue.length}</strong> opportunité(s) ouverte(s) ont une date de clôture
            dépassée ({euros(forecast.overduePondere)} pondéré) — à requalifier ou re-dater.
          </span>
          <Link href="/opportunites?retard=1" className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
            Voir les retards →
          </Link>
        </div>
      )}

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pilotage commercial</h1>
          <p className="text-sm text-slate-500">
            Source : {backendName()} · {s.total.count} opportunités
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/historique" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Historique
          </Link>
          <Link href="/import" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Importer un CSV
          </Link>
        </div>
      </div>

      {delta && prev && (
        <p className="-mt-4 text-xs text-slate-400">
          Variations vs import du {dateFr(prev.takenAt)}.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pipeline pondéré" value={euros(s.total.pondere)} hint={`${s.total.ouvertes} opportunités ouvertes`} accent="text-indigo-700" delta={delta?.pondere} />
        <StatCard label="Pipeline brut (ouvert)" value={euros(s.total.brut)} hint="hors gagné / perdu" delta={delta?.brut} />
        <StatCard label="CA gagné" value={euros(s.total.gagne)} accent="text-emerald-600" delta={delta?.gagne} />
        <StatCard label="Perdu / abandonné" value={euros(s.total.perdu)} accent="text-rose-500" delta={delta?.perdu} deltaGoodWhenUp={false} />
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

      <div>
        <QuarterForecastChart quarters={forecast.quarters} />
        {(forecast.overdue.length > 0 || forecast.undated.length > 0) && (
          <p className="mt-2 text-xs text-slate-400">
            Hors atterrissage :{' '}
            {forecast.overdue.length > 0 && `${forecast.overdue.length} en retard (${euros(forecast.overduePondere)} pondéré)`}
            {forecast.overdue.length > 0 && forecast.undated.length > 0 && ' · '}
            {forecast.undated.length > 0 && `${forecast.undated.length} sans date (${euros(forecast.undatedPondere)} pondéré)`}
            . Ces opportunités ne sont pas projetées dans un trimestre.
          </p>
        )}
      </div>

      <ObjectivesTable rows={objectifs.rows} total={objectifs.total} cible={COUVERTURE_CIBLE} />

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
