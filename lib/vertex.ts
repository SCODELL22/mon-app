// Accès au modèle Claude, par l'un ou l'autre de deux canaux.
//
//   - VERTEX : Claude via le Model Garden de Google Cloud. Demande un projet GCP et un compte de
//     service. Intéressant quand l'entreprise est déjà sous contrat Google : rien ne sort du
//     projet cloud existant, donc aucun sous-traitant supplémentaire à faire valider.
//   - DIRECT : API Anthropic. Une simple clé, aucune infrastructure. Le chemin court quand
//     l'obtention d'un projet GCP passe par un ticket DSI.
//
// Le corps de requête est le MÊME dans les deux cas (format Messages, sortie structurée par
// outil forcé) : seuls l'URL et l'authentification changent. C'est ce qui rend la bascule
// possible sans retoucher la logique métier.
//
// Aucune dépendance npm ajoutée : le JWT RS256 de Vertex est signé avec l'API Web Crypto, comme
// le reste de la cryptographie du projet (cf. lib/auth.ts). Ajouter `google-auth-library` ferait
// entrer une centaine de paquets transitifs pour une signature et un échange de jeton.

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const enc = new TextEncoder();

export interface ConfigVertex {
  projectId: string;
  location: string;
  model: string;
  clientEmail: string;
  privateKey: string;
}

/** Canal d'accès au modèle. */
export type Canal = 'vertex' | 'direct';

/** Version d'API Anthropic pour l'appel direct. Figée : ne pas suivre les nouveautés à l'aveugle. */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Modèle par défaut. Volontairement configurable et non codé en dur : le catalogue Claude et sa
 * disponibilité régionale évoluent vite. Vérifier le nom exact avant de déployer — un identifiant
 * inconnu renvoie une 404 sans autre explication.
 *
 * Attention, les identifiants diffèrent d'un canal à l'autre : sur Vertex ils s'écrivent sans
 * suffixe de date (« claude-sonnet-4-5 »), sur l'API directe ils en portent un
 * (« claude-sonnet-4-5-20250929 »). Utiliser celui qu'affiche la console du canal choisi.
 */
function modelParDefaut(canal: Canal): string {
  const explicite = (process.env.VERTEX_MODEL || process.env.ANTHROPIC_MODEL || '').trim();
  if (explicite) return explicite;
  return canal === 'vertex' ? 'claude-sonnet-4-5' : 'claude-sonnet-4-5-20250929';
}

/** Clé de l'API Anthropic directe, ou null. */
export function cleAnthropic(): string | null {
  const cle = (process.env.ANTHROPIC_API_KEY || '').trim();
  return cle || null;
}

/**
 * Canal effectivement utilisable, ou null si aucun n'est configuré (fail-closed).
 *
 * Vertex est prioritaire quand les deux sont disponibles : c'est le canal qui garde les données
 * dans l'environnement cloud déjà contractualisé. Configurer les deux n'est donc pas une erreur —
 * cela permet de garder une clé de secours pendant une migration.
 */
export function canalActif(): Canal | null {
  if (configVertex()) return 'vertex';
  if (cleAnthropic()) return 'direct';
  return null;
}

/**
 * Configuration lue depuis l'environnement, ou null si incomplète.
 *
 * Deux formats acceptés pour les identifiants :
 *   - GOOGLE_SERVICE_ACCOUNT_JSON : le fichier JSON du compte de service, tel que téléchargé
 *     depuis la console GCP (pratique sur Railway/Vercel, une seule variable à coller) ;
 *   - GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY : les deux champs séparément.
 */
export function configVertex(): ConfigVertex | null {
  const projectId = (process.env.VERTEX_PROJECT_ID || '').trim();
  const location = (process.env.VERTEX_LOCATION || 'europe-west1').trim();
  const model = modelParDefaut('vertex');

  let clientEmail = (process.env.GOOGLE_SA_EMAIL || '').trim();
  let privateKey = process.env.GOOGLE_SA_PRIVATE_KEY || '';

  const json = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as { client_email?: string; private_key?: string };
      clientEmail = parsed.client_email || clientEmail;
      privateKey = parsed.private_key || privateKey;
    } catch {
      // JSON invalide : on ne tente pas de deviner. La configuration est considérée absente,
      // l'extraction reste indisponible (fail-closed) plutôt que d'échouer à l'usage.
      return null;
    }
  }

  // Les variables d'environnement traversent souvent les interfaces d'hébergeurs avec les sauts
  // de ligne échappés. Sans cette conversion, l'import de la clé PKCS8 échoue.
  privateKey = privateKey.replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, location, model, clientEmail, privateKey };
}

// ---------------------------------------------------------------- Signature du JWT

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Convertit une clé privée PEM (PKCS#8) en ArrayBuffer exploitable par Web Crypto. */
function pemVersDer(pem: string): ArrayBuffer {
  const corps = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(corps);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function signerJwt(cfg: ConfigVertex): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: cfg.clientEmail,
    scope: SCOPE,
    aud: OAUTH_TOKEN_URL,
    iat: maintenant,
    exp: maintenant + 3600, // maximum accepté par Google
  };

  const corps = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;

  const cle = await crypto.subtle.importKey(
    'pkcs8',
    pemVersDer(cfg.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, enc.encode(corps));
  return `${corps}.${b64url(new Uint8Array(signature))}`;
}

// ---------------------------------------------------------------- Jeton d'accès

// Cache par instance : un jeton vaut une heure, inutile de refaire l'échange à chaque extraction.
// Marge de 60 s pour ne pas utiliser un jeton qui expire pendant la requête.
const g = globalThis as unknown as { __vertexToken?: { valeur: string; expireA: number } };

async function jetonAcces(cfg: ConfigVertex): Promise<string> {
  const cache = g.__vertexToken;
  if (cache && cache.expireA > Date.now() + 60_000) return cache.valeur;

  const jwt = await signerJwt(cfg);
  const reponse = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!reponse.ok) {
    const detail = await reponse.text();
    // Message tronqué : la réponse d'erreur OAuth peut contenir des éléments de la requête.
    throw new Error(`Vertex AI — échec de l'authentification (${reponse.status}) : ${detail.slice(0, 300)}`);
  }

  const data = (await reponse.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Vertex AI — jeton absent de la réponse OAuth.');

  g.__vertexToken = {
    valeur: data.access_token,
    expireA: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

// ---------------------------------------------------------------- Appel au modèle

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Nom de l'outil imposé au modèle. Sert aussi à retrouver le bloc dans la réponse. */
const OUTIL = 'remplir_trame';

/**
 * Extrait l'objet structuré d'une réponse Claude au format Messages.
 *
 * Exportée pour être testable sans appel réseau : c'est la partie la plus susceptible de casser
 * si le format de réponse évolue, et la plus pénible à diagnostiquer en production.
 *
 * Claude renvoie un tableau `content` de blocs typés. Avec un outil forcé, on cherche le bloc
 * `tool_use` dont le nom correspond ; son champ `input` contient l'objet conforme au schéma.
 * Un bloc `text` peut le précéder (raisonnement) : on l'ignore.
 */
export function extraireOutil(data: unknown): unknown {
  const d = (data ?? {}) as any;

  const blocs = Array.isArray(d.content) ? d.content : [];
  const bloc = blocs.find((b: any) => b?.type === 'tool_use' && b?.name === OUTIL);
  if (bloc && bloc.input && typeof bloc.input === 'object') return bloc.input;

  // Pas de bloc d'outil : on échoue explicitement plutôt que de renvoyer un objet vide, qui
  // passerait pour un entretien dont le modèle n'aurait rien tiré.
  const raison = d.stop_reason ?? 'inconnue';
  throw new Error(`Claude — aucune sortie structurée exploitable (arrêt : ${raison}).`);
}

/**
 * Appelle Claude sur Vertex AI et renvoie l'objet structuré produit.
 *
 * Sortie structurée obtenue par « tool use » forcé plutôt que par un mode JSON : en déclarant un
 * outil avec son `input_schema` et en imposant `tool_choice`, l'API contraint la réponse à
 * respecter le schéma. C'est la méthode la plus stable, disponible aussi bien sur Vertex que sur
 * l'API directe, et qui ne dépend d'aucun en-tête bêta.
 *
 * On valide malgré tout le résultat chez nous (cf. validerReponse dans extraction-trame.ts) : un
 * schéma contraint la structure, pas la véracité ni l'absence de champs inattendus.
 */
/**
 * Corps de requête au format Messages, identique sur les deux canaux.
 *
 * Exporté pour être testable : c'est ici que se joue la contrainte de sortie structurée, donc la
 * garantie que le modèle ne peut pas écrire ailleurs que dans les rubriques prévues.
 */
export function corpsRequete(
  consigne: string,
  contenu: string,
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return {
    max_tokens: 4096,
    // Température nulle : on veut une extraction reproductible, pas de la rédaction.
    temperature: 0,
    system: consigne,
    messages: [{ role: 'user', content: contenu }],
    tools: [
      {
        name: OUTIL,
        description:
          'Enregistre les rubriques du compte rendu et les actions décidées, extraites de la transcription.',
        input_schema: schema,
      },
    ],
    // Force l'usage de l'outil : sans cela, le modèle peut répondre en texte libre.
    tool_choice: { type: 'tool', name: OUTIL },
  };
}

export async function genererJson(
  consigne: string,
  contenu: string,
  schema: Record<string, unknown>,
): Promise<unknown> {
  const canal = canalActif();
  if (!canal) throw new Error('Aucun accès au modèle configuré.');

  const corps = corpsRequete(consigne, contenu, schema);
  let url: string;
  let entetes: Record<string, string>;

  if (canal === 'vertex') {
    const cfg = configVertex()!;
    const jeton = await jetonAcces(cfg);
    // Les modèles partenaires passent par le point d'entrée `rawPredict` du publisher anthropic,
    // et non par `generateContent` réservé aux modèles Google.
    url =
      `https://${cfg.location}-aiplatform.googleapis.com/v1/projects/${cfg.projectId}` +
      `/locations/${cfg.location}/publishers/anthropic/models/${cfg.model}:rawPredict`;
    entetes = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };
    // Sur Vertex, la version d'API passe dans le CORPS et non dans un en-tête, et le nom du
    // modèle n'y est pas répété (il figure déjà dans l'URL).
    corps.anthropic_version = 'vertex-2023-10-16';
  } else {
    url = 'https://api.anthropic.com/v1/messages';
    entetes = {
      'x-api-key': cleAnthropic()!,
      // Sur l'API directe, à l'inverse : la version passe en en-tête et le modèle dans le corps.
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    };
    corps.model = modelParDefaut('direct');
  }

  const reponse = await fetch(url, {
    method: 'POST',
    headers: entetes,
    body: JSON.stringify(corps),
  });

  if (!reponse.ok) {
    const detail = await reponse.text();
    // Le canal est nommé dans l'erreur : sans cela, diagnostiquer une configuration à deux
    // canaux revient à deviner lequel a réellement été appelé.
    throw new Error(`Claude (${canal}) — appel refusé (${reponse.status}) : ${detail.slice(0, 300)}`);
  }

  return extraireOutil(await reponse.json());
}
