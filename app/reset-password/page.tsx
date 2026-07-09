export const dynamic = 'force-dynamic';

const MESSAGES: Record<string, string> = {
  password: 'Le mot de passe doit faire au moins 8 caractères.',
  mismatch: 'Les mots de passe ne correspondent pas.',
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <div style={wrap}>
      <link
        href="https://fonts.googleapis.com/css2?family=Saira+Extra+Condensed:wght@700;900&family=Open+Sans:wght@400;600;700&display=swap"
        rel="stylesheet"
      />
      <div style={card}>
        <div style={wm}>ippon</div>
        <h1 style={title}>Nouveau mot de passe</h1>
        <p style={sub}>Pilotage commercial — accès réservé à l’équipe.</p>

        {!token ? (
          <p style={errBox}>
            Ce lien est invalide. <a href="/forgot-password" style={link}>Demandes-en un nouveau</a>.
          </p>
        ) : (
          <>
            {error && <div style={errBox}>{MESSAGES[error] ?? 'Une erreur est survenue.'}</div>}
            <form action="/api/auth/reset-password" method="POST" style={{ display: 'grid', gap: 12, marginTop: 18 }}>
              <input type="hidden" name="token" value={token} />
              <label style={label}>
                Nouveau mot de passe
                <input type="password" name="password" required minLength={8} autoFocus style={input} />
              </label>
              <label style={label}>
                Confirmer le mot de passe
                <input type="password" name="confirm" required minLength={8} style={input} />
              </label>
              <button type="submit" style={btn}>
                Réinitialiser
              </button>
            </form>
          </>
        )}

        <p style={foot}>
          <a href="/login" style={link}>Retour à la connexion</a>
        </p>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#000F41',
  padding: '2rem',
  fontFamily: "'Open Sans', Arial, sans-serif",
};
const card: React.CSSProperties = {
  width: '100%',
  maxWidth: 380,
  background: '#fff',
  borderRadius: 4,
  padding: '2rem 2.2rem',
};
const wm: React.CSSProperties = {
  fontFamily: "'Saira Extra Condensed', sans-serif",
  fontSize: 22,
  fontWeight: 700,
  color: '#003CDC',
  textTransform: 'lowercase',
  marginBottom: 18,
};
const title: React.CSSProperties = {
  fontFamily: "'Saira Extra Condensed', sans-serif",
  fontSize: 28,
  fontWeight: 900,
  color: '#000F41',
  textTransform: 'uppercase',
  letterSpacing: '.02em',
  marginBottom: 4,
};
const sub: React.CSSProperties = { fontSize: 13, color: '#6E6E6E', marginBottom: 4 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#000F41', display: 'grid', gap: 6 };
const input: React.CSSProperties = {
  fontSize: 14,
  padding: '9px 11px',
  border: '1px solid #E8E8E8',
  borderRadius: 2,
  fontFamily: "'Open Sans', Arial, sans-serif",
};
const btn: React.CSSProperties = {
  marginTop: 6,
  background: '#003CDC',
  color: '#fff',
  border: 'none',
  borderRadius: 2,
  padding: '11px',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '.03em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};
const foot: React.CSSProperties = { marginTop: 18, fontSize: 12, color: '#6E6E6E', textAlign: 'center' };
const link: React.CSSProperties = { color: '#003CDC', fontWeight: 600, textDecoration: 'none' };
const errBox: React.CSSProperties = {
  marginTop: 14,
  fontSize: 12,
  color: '#6D0718',
  background: '#FDE8EA',
  borderRadius: 2,
  padding: '8px 10px',
};
