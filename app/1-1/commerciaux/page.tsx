// Gestion des fiches commerciaux : rattachement au libellé BoondManager et au compte applicatif.
// Réservé aux administrateurs (MANAGER_EMAILS) : le champ email conditionne qui lit ses propres
// comptes rendus, le champ manager qui lit et écrit TOUS ceux de la fiche, zone privée comprise.
import { acces, peutAdministrer } from '@/lib/access';
import { isAllowedEmail } from '@/lib/auth';
import { listCommerciaux } from '@/lib/one-on-one-store';
import { POLES } from '@/lib/config';
import { listOpportunities } from '@/lib/store';
import { euros } from '@/lib/format';
import { AccesRefuse, Badge, C, Card, Message, S, Shell } from '../ui';

export const dynamic = 'force-dynamic';

const ERREURS: Record<string, string> = {
  nom: 'Le nom est obligatoire.',
  email: 'Adresse email invalide.',
  domaine: 'L’adresse doit appartenir au domaine de l’entreprise.',
  manager:
    'Cette adresse est déclarée administrateur (MANAGER_EMAILS) : elle voit déjà tout, inutile de lui créer une fiche.',
  'manager-email': 'Adresse du manager invalide.',
  'soi-meme': 'Un commercial ne peut pas être son propre manager.',
  'email-pris': 'Cette adresse est déjà rattachée à un autre commercial.',
  introuvable: 'Fiche introuvable.',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string; edit?: string }>;
}) {
  const a = await acces();
  if (!peutAdministrer(a)) return <AccesRefuse />;

  const { error, ok, edit } = await searchParams;
  const commerciaux = await listCommerciaux(true);
  const enEdition = edit ? commerciaux.find((c) => c.id === edit) : undefined;

  // Libellés « Responsable manager » réellement présents dans le dernier import Boond : sert à
  // proposer les bonnes valeurs plutôt que de laisser saisir un libellé qui ne correspondra à rien.
  const opps = await listOpportunities();
  const libellesBoond = [...new Set(opps.map((o) => o.commercial).filter(Boolean))].sort();
  const rattaches = new Set(commerciaux.map((c) => c.libelleBoond).filter(Boolean));
  const orphelins = libellesBoond.filter((l) => !rattaches.has(l));
  // Managers déjà utilisés : proposés à la saisie pour éviter les variantes d'orthographe.
  const managersConnus = [...new Set(commerciaux.map((c) => c.managerEmail).filter(Boolean))].sort();
  const sansManager = commerciaux.filter((c) => c.actif && !c.managerEmail).length;

  return (
    <Shell titre="Commerciaux" estManager estAdmin>
      <header style={{ marginBottom: 18 }}>
        <h1 style={S.h1}>Commerciaux suivis</h1>
        <p style={S.sub}>
          Le libellé BoondManager rattache la fiche aux opportunités du pipeline. L’email donne au
          commercial l’accès en lecture à ses propres comptes rendus — zone privée exclue. Le
          manager rattaché mène les 1:1 de la fiche et en lit tout, zone privée comprise ; il ne
          voit aucune autre fiche. Les administrateurs voient tout.
        </p>
      </header>

      {error && <Message ton="erreur">{ERREURS[error] ?? 'Une erreur est survenue.'}</Message>}
      {ok && <Message ton="ok">Fiche enregistrée.</Message>}

      {sansManager > 0 && (
        <Message ton="info">
          {sansManager} fiche{sansManager > 1 ? 's' : ''} active{sansManager > 1 ? 's' : ''} sans
          manager : seuls les administrateurs peuvent en mener les 1:1.
        </Message>
      )}

      {orphelins.length > 0 && (
        <Message ton="info">
          {orphelins.length} libellé{orphelins.length > 1 ? 's' : ''} présent
          {orphelins.length > 1 ? 's' : ''} dans BoondManager sans fiche associée :{' '}
          <strong>{orphelins.join(', ')}</strong>. Leur pipeline ne remontera pas dans les 1:1
          tant qu’une fiche ne les reprend pas à l’identique.
        </Message>
      )}

      <Card titre={enEdition ? `Modifier — ${enEdition.nom}` : 'Ajouter un commercial'}>
        <form
          action="/api/one-on-one/commercial"
          method="POST"
          style={{ display: 'grid', gap: 12 }}
        >
          <input type="hidden" name="id" value={enEdition?.id ?? ''} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
            <label style={S.label}>
              Nom
              <input
                name="nom"
                required
                defaultValue={enEdition?.nom ?? ''}
                style={S.input}
                placeholder="Prénom Nom"
              />
            </label>
            <label style={S.label}>
              Libellé BoondManager
              <input
                name="libelleBoond"
                defaultValue={enEdition?.libelleBoond ?? ''}
                list="libelles-boond"
                style={S.input}
                placeholder="Responsable manager, à l’identique"
              />
              <datalist id="libelles-boond">
                {libellesBoond.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </label>
            <label style={S.label}>
              Email du compte
              <input
                type="email"
                name="email"
                defaultValue={enEdition?.email ?? ''}
                style={S.input}
                placeholder="prenom.nom@ippon.fr — laisser vide pour aucun accès"
              />
            </label>
            <label style={S.label}>
              Manager (N+1)
              <input
                type="email"
                name="managerEmail"
                defaultValue={enEdition?.managerEmail ?? ''}
                list="managers-connus"
                style={S.input}
                placeholder="prenom.nom@ippon.fr — mène ses 1:1"
              />
              <datalist id="managers-connus">
                {managersConnus.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            <label style={S.label}>
              Pôle
              <input
                name="pole"
                defaultValue={enEdition?.pole ?? ''}
                list="poles"
                style={S.input}
              />
              <datalist id="poles">
                {POLES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label style={S.label}>
              Objectif annuel (€ HT)
              <input
                name="objectifAnnuel"
                defaultValue={enEdition?.objectifAnnuel ?? 0}
                style={S.input}
                inputMode="decimal"
              />
            </label>
            <label style={{ ...S.label, alignSelf: 'end', flexDirection: 'row' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  name="actif"
                  defaultChecked={enEdition ? enEdition.actif : true}
                />
                Actif
              </span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" style={S.btn}>
              {enEdition ? 'Enregistrer' : 'Ajouter'}
            </button>
            {enEdition && (
              <a href="/1-1/commerciaux" style={S.btnGhost}>
                Annuler
              </a>
            )}
          </div>
        </form>
      </Card>

      <Card titre="Fiches existantes">
        {commerciaux.length === 0 ? (
          <p style={S.empty}>Aucune fiche pour l’instant.</p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Nom</th>
                <th style={S.th}>Pôle</th>
                <th style={S.th}>Libellé Boond</th>
                <th style={S.th}>Accès compte</th>
                <th style={S.th}>Manager</th>
                <th style={S.th}>Objectif</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {commerciaux.map((c) => (
                <tr key={c.id}>
                  <td style={{ ...S.td, fontWeight: 600 }}>
                    <a href={`/1-1/commercial/${c.id}`} style={S.link}>
                      {c.nom}
                    </a>{' '}
                    {!c.actif && <Badge ton="gray">inactif</Badge>}
                  </td>
                  <td style={{ ...S.td, color: C.gd }}>{c.pole || '—'}</td>
                  <td style={{ ...S.td, color: C.gd }}>
                    {c.libelleBoond ? (
                      c.libelleBoond
                    ) : (
                      <Badge ton="yellow">non rattaché</Badge>
                    )}
                  </td>
                  <td style={S.td}>
                    {c.email ? <Badge ton="blue">{c.email}</Badge> : <Badge ton="gray">aucun</Badge>}
                  </td>
                  <td style={S.td}>
                    {c.managerEmail ? (
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        <Badge ton="blue">{c.managerEmail}</Badge>
                        {/* Sans place dans ALLOWED_EMAILS, le manager ne peut pas créer son compte. */}
                        {!isAllowedEmail(c.managerEmail) && (
                          <Badge ton="yellow">inscription bloquée</Badge>
                        )}
                      </span>
                    ) : (
                      <Badge ton="gray">admin seul</Badge>
                    )}
                  </td>
                  <td style={S.td}>{c.objectifAnnuel ? euros(c.objectifAnnuel) : '—'}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <a href={`/1-1/commerciaux?edit=${c.id}`} style={S.btnGhost}>
                      Modifier
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Shell>
  );
}
