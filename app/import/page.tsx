import Link from 'next/link';
import { importCsv, importFacturation } from '@/app/actions';
import { backendName } from '@/lib/store';

export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  nofile: 'Aucun fichier sélectionné. Choisissez un fichier CSV exporté depuis BoondManager.',
  empty: 'Le fichier ne contient aucune opportunité exploitable. Vérifiez qu’il s’agit bien de l’export « Besoins » de BoondManager.',
  toolarge: 'Fichier trop volumineux (limite : 10 Mo). Vérifiez qu’il s’agit bien d’un export CSV.',
  toomany: 'Trop de lignes dans le fichier (limite : 50 000 opportunités).',
};

const FMESSAGES: Record<string, string> = {
  nofile: 'Aucun fichier sélectionné. Choisissez l’export « Facturation » (CSV).',
  empty: 'Le fichier ne contient aucune ligne exploitable. Colonnes attendues : Client, CA, Marge.',
  toolarge: 'Fichier trop volumineux (limite : 10 Mo).',
  toomany: 'Trop de lignes dans le fichier (limite : 50 000).',
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ferror?: string }>;
}) {
  const { error, ferror } = await searchParams;

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

      <div className="border-t border-slate-200 pt-6">
        <h2 className="text-xl font-semibold tracking-tight">Importer la facturation (CA &amp; marge réalisés)</h2>
        <p className="mt-1 text-sm text-slate-500">
          Alimente la vue <strong>Performance</strong> du dashboard. L’import <strong>remplace</strong> la
          facturation et historise une photo datée (avancement annuel).
        </p>
      </div>

      {ferror && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {FMESSAGES[ferror] ?? 'Une erreur est survenue pendant l’import.'}
        </div>
      )}

      <form action={importFacturation} encType="multipart/form-data" className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <label htmlFor="ffile" className="block text-sm font-medium text-slate-700">
            Fichier CSV (export « Facturation » : colonnes Client, CA, Marge)
          </label>
          <input
            id="ffile"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-500"
          />
        </div>
        <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
          Importer la facturation
        </button>
        <p className="text-xs text-slate-400">
          Le CA et la marge sont agrégés par client, puis attribués au commercial via le mapping
          défini dans la configuration. Les clients non mappés apparaissent en « Non attribué ».
        </p>
      </form>

      <Link href="/" className="inline-block text-sm text-slate-500 hover:text-slate-700">← Retour au dashboard</Link>
    </div>
  );
}
