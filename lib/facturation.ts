// Domaine « Facturation » — CA facturé & marge par client (export BoondManager « Facturation »).
// Complète le pipeline d'opportunités : ici on parle de réalisé (CA encaissable + marge),
// pas de prévisionnel. Alimente la vue Performance (avancement vs objectif annuel).
import Papa from 'papaparse';
import { CLIENT_COMMERCIAL, NON_ATTRIBUE } from './config';

/** Une ligne agrégée par client : CA facturé et marge cumulés sur la période. */
export interface FacturationRow {
  client: string;
  commercial: string; // résolu via CLIENT_COMMERCIAL ; NON_ATTRIBUE sinon
  ca: number;
  marge: number;
}

/** Photo datée d'un import de facturation (socle de la courbe d'avancement annuel). */
export interface FacturationSnapshot {
  id: string;
  takenAt: string; // ISO
  periode: string | null; // période déclarée dans le fichier (ex. « 2026-05 »)
  totalCa: number;
  totalMarge: number;
  rows: FacturationRow[];
}

export interface FacturationImportResult {
  rows: FacturationRow[];
  periode: string | null;
  rowsRead: number;
  ignored: number;
}

export function commercialOf(client: string): string {
  return CLIENT_COMMERCIAL[client.trim()] ?? NON_ATTRIBUE;
}

function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseNum(v: string): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(/€/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/**
 * Parse l'export « Facturation » (CSV ';'). Colonnes reconnues (insensibles à la casse/accents) :
 * Client, CA, Marge. Les lignes sont agrégées par client, puis attribuées à un commercial.
 */
export function parseFacturationCsv(text: string): FacturationImportResult {
  const clean = text.replace(/^﻿/, '');
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  const byClient = new Map<string, { ca: number; marge: number }>();
  let ignored = 0;

  for (const raw of parsed.data) {
    const row: Record<string, string> = {};
    for (const k of Object.keys(raw)) row[norm(k)] = (raw[k] ?? '').trim();
    const get = (...keys: string[]): string => {
      for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k];
      return '';
    };

    const client = get('client', 'societe nom', 'societe', 'compte');
    if (!client) {
      ignored++;
      continue;
    }
    const ca = parseNum(get('ca', 'ca facture', 'chiffre d affaires', 'ca ht'));
    const marge = parseNum(get('marge', 'marge brute'));
    const acc = byClient.get(client) ?? { ca: 0, marge: 0 };
    acc.ca += ca;
    acc.marge += marge;
    byClient.set(client, acc);
  }

  const rows: FacturationRow[] = [...byClient.entries()]
    .map(([client, v]) => ({ client, commercial: commercialOf(client), ca: v.ca, marge: v.marge }))
    .sort((a, b) => b.ca - a.ca);

  return { rows, periode: detectPeriode(clean), rowsRead: parsed.data.length, ignored };
}

/** Tente de repérer une période « AAAA-MM » dans l'en-tête du fichier (best effort). */
function detectPeriode(text: string): string | null {
  const m = text.match(/(20\d{2})[-/ ]?(0[1-9]|1[0-2])/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function makeFacturationSnapshot(rows: FacturationRow[], periode: string | null): FacturationSnapshot {
  return {
    id: `fact-${Date.now()}`,
    takenAt: new Date().toISOString(),
    periode,
    totalCa: rows.reduce((s, r) => s + r.ca, 0),
    totalMarge: rows.reduce((s, r) => s + r.marge, 0),
    rows,
  };
}
