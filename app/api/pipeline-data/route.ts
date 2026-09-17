import { getRawCsv } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const csv = await getRawCsv();
  if (!csv) {
    // Corps null obligatoire : le runtime refuse un corps (même vide) sur un 204 et lève une
    // TypeError, ce qui transformait « aucune donnée » en erreur 500.
    return new Response(null, { status: 204 });
  }
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
