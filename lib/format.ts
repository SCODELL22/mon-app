const eurosFmt = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export function euros(n: number): string {
  return eurosFmt.format(n || 0);
}

export function pct(n: number): string {
  return `${Math.round(n)} %`;
}

/** Montant signé pour les variations : « +12 000 € », « −3 500 € », « 0 € ». */
export function signedEuros(n: number): string {
  const v = Math.round(n || 0);
  if (v === 0) return '0 €';
  const sign = v > 0 ? '+' : '−';
  return `${sign}${euros(Math.abs(v))}`;
}

export function dateFr(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
