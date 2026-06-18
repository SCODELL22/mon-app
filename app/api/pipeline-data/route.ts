import { getRawCsv } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const csv = await getRawCsv();
  if (!csv) {
    return new Response('', { status: 204 });
  }
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
