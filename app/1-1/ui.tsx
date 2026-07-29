// Briques d'interface du module 1:1 — charte Ippon, alignée sur public/pipeline.html
// (bleu Klein #003CDC, bleu profond #000F41, jaune #FFC800, Saira Extra Condensed + Open Sans).
//
// Styles en objets inline plutôt qu'en classes Tailwind : c'est la convention déjà retenue par
// app/login/page.tsx et app/signup/page.tsx. Rester cohérent évite d'avoir deux systèmes de
// style dans la même application.
import type { CSSProperties, ReactNode } from 'react';

export const C = {
  klein: '#003CDC',
  deep: '#000F41',
  yellow: '#FFC800',
  white: '#FFFFFF',
  off: '#F4F4F4',
  gl: '#E8E8E8',
  gm: '#B0B0B0',
  gd: '#6E6E6E',
  green: '#00CCA5',
  orange: '#FF4C41',
  red: '#6D0718',
  border: 'rgba(0,61,220,0.10)',
} as const;

export const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Saira+Extra+Condensed:wght@300;400;700;900&family=Open+Sans:wght@300;400;600;700&display=swap';

const saira = "'Saira Extra Condensed', sans-serif";
const sans = "'Open Sans', Arial, sans-serif";

// ---------------------------------------------------------------- Styles exportés

export const S = {
  page: {
    minHeight: '100vh',
    background: C.off,
    color: C.deep,
    fontFamily: sans,
  } as CSSProperties,
  topbar: {
    background: C.deep,
    padding: '0 2rem',
    height: 52,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  } as CSSProperties,
  wm: {
    fontFamily: saira,
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
    textTransform: 'lowercase',
    textDecoration: 'none',
  } as CSSProperties,
  tbTitle: {
    fontFamily: saira,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,.4)',
  } as CSSProperties,
  navLink: {
    fontSize: 12,
    color: 'rgba(255,255,255,.55)',
    textDecoration: 'none',
    padding: '5px 10px',
    borderRadius: 2,
  } as CSSProperties,
  content: { padding: '1.75rem 2rem', maxWidth: 1240, margin: '0 auto' } as CSSProperties,
  h1: {
    fontFamily: saira,
    fontSize: '2rem',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '.02em',
    color: C.deep,
    lineHeight: 1.05,
  } as CSSProperties,
  sub: { fontSize: 13, color: C.gd, marginTop: 4 } as CSSProperties,
  card: {
    background: C.white,
    border: `0.5px solid ${C.border}`,
    borderRadius: 2,
    padding: '1.2rem',
    marginBottom: 14,
  } as CSSProperties,
  ct: {
    fontFamily: saira,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: C.deep,
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
  } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: {
    fontFamily: saira,
    fontSize: 12,
    letterSpacing: '.07em',
    textTransform: 'uppercase',
    color: C.gd,
    fontWeight: 700,
    padding: '0 8px 8px',
    textAlign: 'left',
    borderBottom: `2px solid ${C.klein}`,
  } as CSSProperties,
  td: {
    padding: '9px 8px',
    borderBottom: `0.5px solid ${C.gl}`,
    color: C.deep,
    verticalAlign: 'middle',
  } as CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: C.deep,
    display: 'grid',
    gap: 6,
  } as CSSProperties,
  input: {
    fontSize: 14,
    padding: '9px 11px',
    border: `1px solid ${C.gl}`,
    borderRadius: 2,
    fontFamily: sans,
    width: '100%',
    background: '#fff',
    color: C.deep,
  } as CSSProperties,
  textarea: {
    fontSize: 14,
    padding: '9px 11px',
    border: `1px solid ${C.gl}`,
    borderRadius: 2,
    fontFamily: sans,
    width: '100%',
    minHeight: 84,
    resize: 'vertical',
    background: '#fff',
    color: C.deep,
  } as CSSProperties,
  btn: {
    background: C.klein,
    color: '#fff',
    border: 'none',
    borderRadius: 2,
    padding: '10px 20px',
    fontFamily: saira,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  } as CSSProperties,
  btnGhost: {
    background: 'none',
    color: C.gd,
    border: `1px solid ${C.border}`,
    borderRadius: 2,
    padding: '7px 14px',
    fontSize: 12,
    cursor: 'pointer',
    textDecoration: 'none',
    display: 'inline-block',
  } as CSSProperties,
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
    gap: 10,
    marginBottom: 14,
  } as CSSProperties,
  empty: { textAlign: 'center', padding: '2rem', color: C.gm, fontSize: 13 } as CSSProperties,
  link: { color: C.klein, fontWeight: 600, textDecoration: 'none' } as CSSProperties,
};

// ---------------------------------------------------------------- Composants

export function Shell({
  titre,
  estManager,
  children,
}: {
  titre: string;
  estManager: boolean;
  children: ReactNode;
}) {
  return (
    <div style={S.page}>
      <link href={FONT_LINK} rel="stylesheet" />
      <div style={S.topbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="/" style={S.wm}>
            ippon
          </a>
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,.1)' }} />
          <span style={S.tbTitle}>{titre}</span>
        </div>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <a href="/1-1" style={S.navLink}>
            Tableau de bord
          </a>
          <a href="/1-1/actions" style={S.navLink}>
            Actions
          </a>
          {estManager && (
            <>
              <a href="/1-1/commerciaux" style={S.navLink}>
                Commerciaux
              </a>
              <a href="/1-1/nouveau" style={S.navLink}>
                Nouveau 1:1
              </a>
              <a href="/api/one-on-one/export" style={S.navLink}>
                Sauvegarde
              </a>
            </>
          )}
          <a href="/" style={S.navLink}>
            Pipeline
          </a>
        </nav>
      </div>
      <div style={S.content}>{children}</div>
    </div>
  );
}

export function Card({
  titre,
  accent = C.klein,
  children,
  style,
}: {
  titre?: string;
  accent?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section style={{ ...S.card, ...style }}>
      {titre && (
        <h2 style={S.ct}>
          <span
            style={{
              display: 'inline-block',
              width: 4,
              height: 18,
              background: accent,
              borderRadius: 1,
              flexShrink: 0,
            }}
          />
          {titre}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  valeur,
  sousTitre,
  accent = C.klein,
}: {
  label: string;
  valeur: string;
  sousTitre?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: C.white,
        border: `0.5px solid ${C.border}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: 2,
        padding: '.9rem 1.1rem',
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: C.gd,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: saira, fontSize: '1.9rem', fontWeight: 900, color: C.deep, lineHeight: 1 }}>
        {valeur}
      </div>
      {sousTitre && <div style={{ fontSize: 11, color: C.gm, marginTop: 3 }}>{sousTitre}</div>}
    </div>
  );
}

export function Badge({
  children,
  ton = 'gray',
}: {
  children: ReactNode;
  ton?: 'blue' | 'yellow' | 'green' | 'red' | 'gray' | 'orange';
}) {
  const tons: Record<string, CSSProperties> = {
    blue: { background: '#EEF2FF', color: C.klein },
    yellow: { background: '#FFF9E0', color: '#7a5800' },
    green: { background: '#E0F8F3', color: '#004C4C' },
    red: { background: '#FDE8EA', color: C.red },
    gray: { background: C.gl, color: C.gd },
    orange: { background: '#FFF0EE', color: '#c43820' },
  };
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: saira,
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 2,
        fontWeight: 700,
        letterSpacing: '.04em',
        whiteSpace: 'nowrap',
        ...tons[ton],
      }}
    >
      {children}
    </span>
  );
}

/**
 * Bandeau signalant que le bloc affiché ne sort jamais vers le commercial.
 * Repère visuel volontairement voyant : le risque n'est pas technique mais humain — écrire une
 * note sensible dans le mauvais champ.
 */
export function BandeauPrive({ children }: { children: ReactNode }) {
  return (
    <section
      style={{
        background: '#FFFDF5',
        border: `1px solid ${C.yellow}`,
        borderLeft: `4px solid ${C.yellow}`,
        borderRadius: 2,
        padding: '1.2rem',
        marginBottom: 14,
      }}
    >
      <h2 style={{ ...S.ct, marginBottom: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 4,
            height: 18,
            background: C.yellow,
            borderRadius: 1,
          }}
        />
        Zone manager — privée
      </h2>
      <p style={{ fontSize: 12, color: C.gd, marginBottom: 14 }}>
        Visible uniquement par les managers. Ce bloc n’est jamais transmis au commercial, ni à
        l’écran ni dans le compte rendu imprimé.
      </p>
      {children}
    </section>
  );
}

export function Message({ ton, children }: { ton: 'erreur' | 'info' | 'ok'; children: ReactNode }) {
  const tons = {
    erreur: { background: '#FDE8EA', color: C.red },
    info: { background: '#EEF2FF', color: C.klein },
    ok: { background: '#E0F8F3', color: '#004C4C' },
  } as const;
  return (
    <div style={{ ...tons[ton], borderRadius: 2, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>
      {children}
    </div>
  );
}

/** Écran affiché quand l'utilisateur n'a aucun droit sur le module. Ne divulgue rien du contenu. */
export function AccesRefuse() {
  return (
    <div style={{ ...S.page, display: 'grid', placeItems: 'center', padding: '2rem' }}>
      <link href={FONT_LINK} rel="stylesheet" />
      <div style={{ ...S.card, maxWidth: 460, textAlign: 'center' }}>
        <h1 style={{ ...S.h1, fontSize: '1.5rem' }}>Accès non autorisé</h1>
        <p style={{ ...S.sub, marginBottom: 16 }}>
          Le suivi des entretiens individuels est réservé aux managers et aux commerciaux
          concernés. Si tu penses que c’est une erreur, demande à ton manager de rattacher ton
          adresse à ta fiche.
        </p>
        <a href="/" style={S.btnGhost}>
          Retour au pipeline
        </a>
      </div>
    </div>
  );
}
