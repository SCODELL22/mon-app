import Link from 'next/link';
import { importCsv } from '@/app/actions';
import { backendName } from '@/lib/store';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  nofile: 'Aucun fichier sélectionné. Choisissez un fichier CSV exporté depuis BoondManager.',
  empty: 'Le fichier ne contient aucune opportunité exploitable. Vérifiez qu’il s’agit bien de l’export « Besoins » de BoondManager.',
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importer depuis BoondManager</h1>
        <p className="mt-1 text-sm text-slate-500">
          L’import <strong>remplace l’intégralité</strong> des opportunités. Destination : {backendName()}.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {MESSAGES[error] ?? 'Une erreur est survenue pendant l’import.'}
        </div>
      )}

      <form action={importCsv} encType="multipart/form-data" className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <label htmlFor="file" className="block text-sm font-medium text-slate-700">
            Fichier CSV (export « Besoins »)
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-500"
          />
        </div>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">
          Importer et remplacer les données
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <h2 className="mb-2 font-semibold text-slate-700">Colonnes reconnues</h2>
        <p>
          Titre, Société - Nom, Pôle, Responsable manager, Domaine d’intervention, CA Envisagé HT,
          Pondération, Date de clôture, État, Référence interne. Le fichier peut être encodé en
          Latin-1 (encodage standard de BoondManager) — c’est géré automatiquement.
        </p>
      </div>

      <Link href="/" className="inline-block text-sm text-slate-500 hover:text-slate-700">← Retour au dashboard</Link>
    </div>
  );
}
