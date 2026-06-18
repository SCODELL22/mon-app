import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pilotage commercial — Agence',
  description: 'Suivi des opportunités et du CA prévisionnel de l’agence',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block h-6 w-6 rounded bg-indigo-600" />
              Pilotage commercial
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
                Dashboard
              </Link>
              <Link href="/opportunites" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
                Opportunités
              </Link>
              <a href="/pipeline.html" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
                Pipeline détaillé
              </a>
              <Link
                href="/import"
                className="ml-2 rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500"
              >
                Importer un CSV
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
          mon-app · pilotage commercial d’agence
        </footer>
      </body>
    </html>
  );
}
