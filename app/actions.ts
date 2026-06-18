'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { replaceAll, saveRawCsv } from '@/lib/store';
import { parseBoondCsv, decodeUpload } from '@/lib/boond-import';

export async function importCsv(formData: FormData) {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect('/import?error=nofile');
  }
  const buf = await (file as File).arrayBuffer();
  const text = decodeUpload(buf);
  const result = parseBoondCsv(text);

  if (result.opportunities.length === 0) {
    redirect('/import?error=empty');
  }

  const n = await replaceAll(result.opportunities);
  await saveRawCsv(text); // conserve le CSV brut pour le dashboard détaillé
  revalidatePath('/');
  revalidatePath('/opportunites');
  redirect(`/?imported=${n}&ignored=${result.ignored}`);
}
