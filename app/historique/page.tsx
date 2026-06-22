import Link from 'next/link';
import { listSnapshotMetas, getSnapshot } from '@/lib/store';
import { computeDelta, computeTransitions, trendSeries, winRate, Snapshot } from '@/lib/snapshots';
import { euros } from '@/lib/format';
import { StatCard, DeltaBadge, TrendChart } from '@/components/dashboard-ui';

export const dynamic = 'force-dynamic';

function dateTimeFr(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function HistoriquePage() {
  const metas = await listSnapshotMetas(); // ordre chronologique croissant
  const points = trendSeries(metas);

  // Détail des deux derniers imports pour calculer les mouvements (gagnés / perdus / nouvelles).
  const lastTwoIds = metas.slice(-2).map((m) => m.id);
  const lastTwo = (await Promise.all(lastTwoIds.map((id) => getSnapshot(id)))).filter(
    (s): s is Snapshot => s !== null,
  );
  const transitions =
    lastTwo.length === 2 ? computeTransitions(lastTwo[0], lastTwo[1]) : null;

  // Taux de transformation sur l'ensemble de l'historique disponible.
  const allSnaps = (
    await Promise.all(metas.map((m) => getSnapshot(m.id)))
  ).filter((s): s is Snapshot => s !== null);
  const wr = winRate(allSnaps);

  if (metas.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Historique des imports</h1>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          L’historique se construit à chaque import. Importez un export BoondManager pour
          enregistrer le premier point.
          <div className="mt-4">
            <Link href="/import" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              Importer un CSV
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Tableau du plus récent au plus ancien, avec delta vs import précédent.
  const rows = [...metas].reverse().map((m, idx, arr) => {
    const previous = arr[idx + 1]; // l'élément suivant est plus ancien
    return { meta: m, delta: computeDelta(m, previous) };
  });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Historique des imports</h1>
          <p className="text-sm text-slate-500">{metas.length} import(s) enregistré(s)</p>
        </div>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">← Retour au dashboard</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Taux de transformation"
          value={wr.taux != null ? `${Math.round(wr.taux)} %` : '—'}
          hint={wr.taux != null ? `${wr.gagnees} gagnées / ${wr.perdues} perdues sur l’historique` : 'au moins 2 imports requis'}
          accent="text-indigo-700"
        />
        <StatCard
          label="Signés depuis le dernier import"
          value={transitions ? `${transitions.gagnees.length}` : '—'}
          hint={transitions ? euros(transitions.gagnees.reduce((a, o) => a + o.montant, 0)) : '—'}
          accent="text-emerald-600"
        />
        <StatCard
          label="Perdus depuis le dernier import"
          value={transitions ? `${transitions.perdues.length}` : '—'}
          hint={transitions ? euros(transitions.perdues.reduce((a, o) => a + o.montant, 0)) : '—'}
          accent="text-rose-500"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Évolution du pipeline</h3>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" />Pondéré</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />CA gagné</span>
          </div>
        </div>
        {points.length < 2 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Un seul import pour l’instant — la courbe apparaîtra dès le deuxième.
          </p>
        ) : (
          <TrendChart points={points} />
        )}
      </div>

      {transitions && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Mouvements depuis l’import précédent
          </h3>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Nouvelles opportunités</div>
              <div className="mt-1 text-lg font-semibold text-slate-800">{transitions.nouvelles.length}</div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                {transitions.nouvelles.slice(0, 5).map((o) => (
                  <li key={o.id} className="truncate">{o.nom} · {euros(o.montant)}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Gagnées</div>
              <div className="mt-1 text-lg font-semibold text-emerald-600">{transitions.gagnees.length}</div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                {transitions.gagnees.slice(0, 5).map((o) => (
                  <li key={o.id} className="truncate">{o.nom} · {euros(o.montant)}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400">Perdues / abandonnées</div>
              <div className="mt-1 text-lg font-semibold text-rose-500">{transitions.perdues.length}</div>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                {transitions.perdues.slice(0, 5).map((o) => (
                  <li key={o.id} className="truncate">{o.nom} · {euros(o.montant)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Import</th>
              <th className="px-4 py-3 text-right">Opp.</th>
              <th className="px-4 py-3 text-right">Pondéré</th>
              <th className="px-4 py-3 text-right">Δ pondéré</th>
              <th className="px-4 py-3 text-right">CA gagné</th>
              <th className="px-4 py-3 text-right">Δ gagné</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ meta, delta }) => (
              <tr key={meta.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700">{dateTimeFr(meta.takenAt)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{meta.count}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-indigo-700">{euros(meta.pondere)}</td>
                <td className="px-4 py-3 text-right">{delta ? <DeltaBadge value={delta.pondere} /> : <span className="text-xs text-slate-300">—</span>}</td>
                <td className="px-4 py-3 text-right tabular-nums text-emerald-600">{euros(meta.gagne)}</td>
                <td className="px-4 py-3 text-right">{delta ? <DeltaBadge value={delta.gagne} /> : <span className="text-xs text-slate-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
