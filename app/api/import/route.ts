import { replaceAll, saveRawCsv } from '@/lib/store';
import { parseBoondCsv, decodeUpload } from '@/lib/boond-import';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: 'nofile' }, { status: 400 });
  }
  const buf = await file.arrayBuffer();
  const text = decodeUpload(buf);
  const result = parseBoondCsv(text);
  if (result.opportunities.length === 0) {
    return Response.json({ error: 'empty' }, { status: 400 });
  }
  const count = await replaceAll(result.opportunities);
  await saveRawCsv(text);
  return Response.json({ count });
}
