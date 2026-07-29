// Tests de l'accès Vertex AI — configuration et signature du JWT.
//
// Aucun appel réseau : on vérifie que la clé privée d'un compte de service est correctement
// importée par Web Crypto et que la signature RS256 produite est valide. C'est le point de
// rupture le plus probable de cette intégration (format PEM, sauts de ligne échappés par
// l'hébergeur), et celui qui donne les erreurs les plus opaques en production.
import { generateKeyPairSync, createVerify } from 'node:crypto';

let fail = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fail++;
    console.log('XX ' + m);
  } else console.log('OK ' + m);
};

// Rejoue exactement la signature de lib/vertex.ts, pour la vérifier avec la clé publique.
// Renvoie un ArrayBuffer et non un Buffer Node : `crypto.subtle.importKey` attend un
// BufferSource, et le Buffer de Node n'est pas assignable à ce type sous la configuration
// TypeScript du build Next.
function pemVersDer(pem: string): ArrayBuffer {
  const corps = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = Buffer.from(corps, 'base64');
  const copie = new Uint8Array(bin.length);
  copie.set(bin);
  return copie.buffer;
}

async function main() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  // Sauvegarde de l'environnement : ce script ne doit pas polluer les autres tests de la suite.
  const sauvegarde = { ...process.env };

  process.env.VERTEX_PROJECT_ID = 'mon-projet';
  process.env.VERTEX_LOCATION = 'europe-west1';
  // Sauts de ligne échappés, comme les restituent la plupart des interfaces d'hébergeurs.
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'sa@mon-projet.iam.gserviceaccount.com',
    private_key: privateKey.replace(/\n/g, '\\n'),
  });

  const { configVertex } = await import('../lib/vertex');

  const cfg = configVertex();
  ok(cfg !== null, 'configuration lue depuis GOOGLE_SERVICE_ACCOUNT_JSON');
  ok(!!cfg && cfg.privateKey.includes('\n'), 'les sauts de ligne échappés sont restaurés');
  ok(!!cfg && cfg.location === 'europe-west1', 'région lue depuis VERTEX_LOCATION');
  ok(!!cfg && cfg.model.length > 0, 'un modèle par défaut est défini');

  if (cfg) {
    const enc = new TextEncoder();
    const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
    const corps =
      `${b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.` +
      `${b64url(enc.encode(JSON.stringify({ iss: cfg.clientEmail, iat: 1, exp: 2 })))}`;

    const cle = await crypto.subtle.importKey(
      'pkcs8',
      pemVersDer(cfg.privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    ok(true, 'clé PKCS8 importée par Web Crypto sans dépendance npm');

    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, enc.encode(corps));
    const v = createVerify('RSA-SHA256');
    v.update(corps);
    v.end();
    ok(v.verify(publicKey, Buffer.from(signature)), 'signature JWT RS256 valide');
  }

  // --- Lecture de la réponse Claude (format Messages) ------------------------
  // Aucun appel réseau : on rejoue des réponses réelles pour vérifier l'extraction du bloc
  // tool_use. C'est le point qui casse en premier si le format d'API évolue.
  const { extraireOutil } = await import('../lib/vertex');

  const reponseNominale = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    stop_reason: 'tool_use',
    content: [
      { type: 'tool_use', name: 'remplir_trame', input: { pointsCles: 'Relancer le compte Y.' } },
    ],
  };
  ok(
    (extraireOutil(reponseNominale) as { pointsCles: string }).pointsCles === 'Relancer le compte Y.',
    'le bloc tool_use est extrait de la réponse',
  );

  // Claude peut émettre un bloc de texte avant l'outil : il doit être ignoré.
  ok(
    (
      extraireOutil({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Voici ce que je retiens de la transcription…' },
          { type: 'tool_use', name: 'remplir_trame', input: { pointsCles: 'ok' } },
        ],
      }) as { pointsCles: string }
    ).pointsCles === 'ok',
    'un bloc de texte précédant l’outil est ignoré',
  );

  // Un outil portant un autre nom ne doit pas être pris pour la trame.
  const casInvalides: [unknown, string][] = [
    [{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'réponse libre' }] }, 'réponse sans outil'],
    [{ content: [{ type: 'tool_use', name: 'autre_outil', input: {} }] }, 'outil au mauvais nom'],
    [{ content: [] }, 'contenu vide'],
    [{}, 'réponse sans champ content'],
    [null, 'réponse nulle'],
  ];
  for (const [entree, libelle] of casInvalides) {
    let leve = false;
    try {
      extraireOutil(entree);
    } catch {
      leve = true;
    }
    ok(leve, `${libelle} : erreur explicite plutôt qu’un résultat vide`);
  }

  // --- Corps de requête, commun aux deux canaux ------------------------------
  const { corpsRequete, canalActif, cleAnthropic } = await import('../lib/vertex');

  // Typage local du corps plutôt qu'un `any` : la règle eslint no-explicit-any s'applique aussi
  // aux scripts, et ce typage documente au passage le format attendu par l'API Messages.
  const corps = corpsRequete('consigne', 'transcription', { type: 'object' }) as {
    temperature?: number;
    system?: string;
    messages?: { role: string; content: string }[];
    tools?: { name: string }[];
    tool_choice?: { type: string; name: string };
    anthropic_version?: string;
  };
  ok(corps.temperature === 0, 'température nulle : extraction reproductible');
  ok(corps.system === 'consigne', 'la consigne passe en instruction système');
  ok(corps.messages?.[0]?.content === 'transcription', 'la transcription passe en message');
  ok(corps.tools?.length === 1, 'un seul outil déclaré');
  ok(
    corps.tool_choice?.type === 'tool' && corps.tool_choice?.name === corps.tools?.[0].name,
    'l’usage de l’outil est imposé (pas de réponse en texte libre)',
  );
  ok(corps.anthropic_version === undefined, 'le corps commun ne présume pas du canal');

  // --- Choix du canal --------------------------------------------------------
  ok(canalActif() === 'vertex', 'projet GCP configuré -> canal vertex');

  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  ok(
    canalActif() === 'vertex',
    'les deux canaux configurés : vertex prioritaire (données dans le cloud contractualisé)',
  );

  delete process.env.VERTEX_PROJECT_ID;
  ok(canalActif() === 'direct', 'sans projet GCP mais avec clé : canal direct');
  ok(cleAnthropic() === 'sk-ant-test', 'la clé Anthropic est lue');

  process.env.ANTHROPIC_API_KEY = '   ';
  ok(cleAnthropic() === null, 'une clé vide ou blanche ne compte pas');
  ok(canalActif() === null, 'aucun canal configuré -> null (fail-closed)');

  // --- Fail-closed sur la configuration Vertex -------------------------------
  process.env.VERTEX_PROJECT_ID = 'mon-projet';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  ok(configVertex() === null, 'sans identifiants : configuration nulle');

  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = '{ ceci n’est pas du json';
  ok(configVertex() === null, 'JSON invalide : configuration nulle, sans plantage');

  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: 'a@b.c' });
  ok(configVertex() === null, 'clé privée manquante : configuration nulle');

  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: 'sa@mon-projet.iam.gserviceaccount.com',
    private_key: privateKey,
  });
  delete process.env.VERTEX_PROJECT_ID;
  ok(configVertex() === null, 'projet manquant : configuration nulle');
  ok(canalActif() === null, 'configuration Vertex incomplète et pas de clé : aucun canal');

  // Restauration de l'environnement.
  for (const k of Object.keys(process.env)) if (!(k in sauvegarde)) delete process.env[k];
  Object.assign(process.env, sauvegarde);

  console.log(fail === 0 ? '\n✅ VERTEX OK' : `\n❌ ${fail} échec(s)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
