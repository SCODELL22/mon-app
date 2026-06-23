import { replaceAll, saveRawCsv } from '@/lib/store';
import { parseBoondCsv, decodeUpload } from '@/lib/boond-import';

export const dynamic = 'force-dynamic';

// Garde-fous contre les uploads abusifs (DoS mémoire/CPU).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo
const MAX_ROWS = 50_000; // nombre d'opportunités maximum par import

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'nofile' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: 'toolarge' }, { status: 413 });
  }
  const buf = await file.arrayBuffer();
  const text = decodeUpload(buf);
  const result = parseBoondCsv(text);
  if (result.opportunities.length === 0) {
    return Response.json({ error: 'empty' }, { status: 400 });
  }
  if (result.opportunities.length > MAX_ROWS) {
    return Response.json({ error: 'toomany' }, { status: 413 });
  }
  const count = await replaceAll(result.opportunities);
  await saveRawCsv(text);
  return Response.json({ count });
}
