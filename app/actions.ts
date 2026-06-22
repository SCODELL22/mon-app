'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  replaceAll,
  saveRawCsv,
  saveSnapshot,
  listOpportunities,
  replaceFacturation,
  saveFacturationSnapshot,
} from '@/lib/store';
import { parseBoondCsv, decodeUpload } from '@/lib/boond-import';
import { parseFacturationCsv, makeFacturationSnapshot } from '@/lib/facturation';
import { makeSnapshot } from '@/lib/snapshots';

// Garde-fous contre les uploads abusifs (DoS mémoire/CPU).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo
const MAX_ROWS = 50_000; // nombre d'opportunités maximum par import

export async function importCsv(formData: FormData) {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect('/import?error=nofile');
  }
  if ((file as File).size > MAX_UPLOAD_BYTES) {
    redirect('/import?error=toolarge');
  }
  const buf = await (file as File).arrayBuffer();
  const text = decodeUpload(buf);
  const result = parseBoondCsv(text);

  if (result.opportunities.length === 0) {
    redirect('/import?error=empty');
  }
  if (result.opportunities.length > MAX_ROWS) {
    redirect('/import?error=toomany');
  }

  const n = await replaceAll(result.opportunities);
  await saveRawCsv(text); // conserve le CSV brut pour le dashboard détaillé

  // Historise l'état importé : socle des tendances, du delta et du taux de transformation.
  const stored = await listOpportunities();
  await saveSnapshot(makeSnapshot(stored));

  revalidatePath('/');
  revalidatePath('/opportunites');
  revalidatePath('/historique');
  redirect(`/?imported=${n}&ignored=${result.ignored}`);
}

export async function importFacturation(formData: FormData) {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect('/import?ferror=nofile');
  }
  if ((file as File).size > MAX_UPLOAD_BYTES) {
    redirect('/import?ferror=toolarge');
  }
  const buf = await (file as File).arrayBuffer();
  const text = decodeUpload(buf);
  const result = parseFacturationCsv(text);

  if (result.rows.length === 0) {
    redirect('/import?ferror=empty');
  }
  if (result.rows.length > MAX_ROWS) {
    redirect('/import?ferror=toomany');
  }

  const n = await replaceFacturation(result.rows);
  // Historise la photo datée : socle de la courbe d'avancement annuel.
  await saveFacturationSnapshot(makeFacturationSnapshot(result.rows, result.periode));

  revalidatePath('/');
  redirect(`/?factImported=${n}`);
}
