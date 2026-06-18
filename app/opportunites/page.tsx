import Link from 'next/link';
import { listOpportunities } from '@/lib/store';
import { ETAPES, ponderation, statutOf } from '@/lib/domain';
import { euros, pct, dateFr } from '@/lib/format';
import { EtapeBadge } from '@/components/dashboard-ui';

export const dynamic = 'force-dynamic';

const selCls =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none';

export default async function OpportunitesPage({
  searchParams,
}: {
  searchParams: Promise<{ pole?: string; commercial?: string; secteur?: string; etape?: string }>;
}) {
  const sp = await searchParams;
  const all = await listOpportunities();
  const poles = [...new Set(all.map((o) => o.pole).filter(Boolean))].sort();
  const commerciaux = [...new Set(all.map((o) => o.commercial).filter(Boolean))].sort();
  const secteurs = [...new Set(all.map((o) => o.secteur).filter(Boolean))].sort();

  const opps = all.filter(
    (o) =>
      (!sp.pole || o.pole === sp.pole) &&
      (!sp.commercial || o.commercial === sp.commercial) &&
      (!sp.secteur || o.secteur === sp.secteur) &&
      (!sp.etape || o.etape === sp.etape),
  );

  const totalPondere = opps.reduce(
    (a, o) => (statutOf(o.etape) === 'open' ? a + ponderation(o) : a),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunités</h1>
        <Link href="/import" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          Importer un CSV
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <select name="pole" defaultValue={sp.pole ?? ''} className={selCls}>
          <option value="">Tous les pôles</option>
          {poles.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="commercial" defaultValue={sp.commercial ?? ''} className={selCls}>
          <option value="">Tous les commerciaux</option>
          {commerciaux.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="secteur" defaultValue={sp.secteur ?? ''} className={selCls}>
          <option value="">Tous les secteurs</option>
          {secteurs.map((sx) => <option key={sx} value={sx}>{sx}</option>)}
        </select>
        <select name="etape" defaultValue={sp.etape ?? ''} className={selCls}>
          <option value="">Toutes les étapes</option>
          {ETAPES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
          Filtrer
        </button>
        <Link href="/opportunites" className="px-2 text-sm text-slate-500 hover:text-slate-700">Réinitialiser</Link>
        <span className="ml-auto text-sm text-slate-500">
          {opps.length} opp. · pondéré <strong className="text-indigo-700">{euros(totalPondere)}</strong>
        </span>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Opportunité</th>
              <th className="px-4 py-3">Pôle</th>
              <th className="px-4 py-3">Commercial</th>
              <th className="px-4 py-3">Secteur</th>
              <th className="px-4 py-3 text-right">Montant</th>
              <th className="px-4 py-3 text-right">Proba</th>
              <th className="px-4 py-3 text-right">Pondéré</th>
              <th className="px-4 py-3">Étape</th>
              <th className="px-4 py-3">Clôture</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {opps.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Aucune opportunité. Importez un export BoondManager.</td></tr>
            )}
            {opps.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-800">{o.nom}</span>
                  {o.client && <div className="text-xs text-slate-400">{o.client}</div>}
                </td>
                <td className="px-4 py-3 text-slate-600">{o.pole}</td>
                <td className="px-4 py-3 text-slate-600">{o.commercial}</td>
                <td className="px-4 py-3 text-slate-600">{o.secteur}</td>
                <td className="px-4 py-3 text-right tabular-nums">{euros(o.montant)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{pct(o.probabilite)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-indigo-700">{euros(ponderation(o))}</td>
                <td className="px-4 py-3"><EtapeBadge etape={o.etape} /></td>
                <td className="px-4 py-3 text-slate-500">{dateFr(o.dateCloturePrev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
