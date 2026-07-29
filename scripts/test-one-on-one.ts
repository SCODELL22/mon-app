// Tests du module de suivi 1:1.
//
// Priorité absolue : le CLOISONNEMENT. Ce module contient des appréciations individuelles et des
// sujets RH. Un test qui échoue ici n'est pas une régression fonctionnelle, c'est une fuite de
// données personnelles. Ne jamais neutraliser un test de cette section pour faire passer un build.
import fs from 'node:fs';
import {
  actionsParUrgence,
  aujourdHui,
  construireSuivi,
  estPartage,
  grouperParSemaine,
  isActionOuverte,
  isEnRetard,
  joursEntre,
  semaineIso,
  stripPrivate,
  visiblePour,
  type Action,
  type Commercial,
  type OneOnOne,
} from '../lib/one-on-one';
import {
  filtrerActionsPourLecteur,
  filtrerPourLecteur,
  peutLireEntretien,
  peutVoirCommercial,
  type Acces,
} from '../lib/access';
import { calculerPipeline } from '../lib/one-on-one-pipeline';
import {
  ExtractionIndisponible,
  extractionDisponible,
  extraireTrame,
  nettoyerTranscription,
  validerReponse,
} from '../lib/extraction-trame';
import type { Opportunity } from '../lib/domain';
import {
  definirPartage,
  getCommercialParEmail,
  listActions,
  listOneOnOnes,
  upsertAction,
  upsertCommercial,
  upsertOneOnOne,
} from '../lib/one-on-one-store';

let fail = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fail++;
    console.log('XX ' + m);
  } else console.log('OK ' + m);
};

const NOW = '2026-07-29T08:00:00.000Z';

function entretien(p: Partial<OneOnOne> = {}): OneOnOne {
  return {
    id: 'o3_1',
    commercialId: 'com_1',
    date: '2026-07-20',
    auteurEmail: 'manager@ippon.fr',
    statut: 'PARTAGE',
    partageLe: NOW,
    chiffres: { caSigne: 100000, pipelinePondere: 50000, nbRdv: 8, nbNouveauxComptes: 2 },
    partage: {
      pipelineCommentaire: 'Pipeline correct',
      dealsARisque: 'Deal X bloqué',
      activiteAmont: '8 RDV',
      administratif: 'CRA à jour',
      developpement: 'Formation négociation',
      pointsCles: 'Relancer le compte Y',
    },
    prive: { moral: 'Fatigué en ce moment', humeur: 2, notesRh: 'Demande une augmentation' },
    notesBrutes: 'notes de séance non relues',
    transcription: 'Manager: bonjour\nAlex: je suis épuisé en ce moment',
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  };
}

function action(p: Partial<Action> = {}): Action {
  return {
    id: 'act_1',
    oneOnOneId: 'o3_1',
    commercialId: 'com_1',
    libelle: 'Relancer le compte Y',
    porteur: 'COMMERCIAL',
    echeance: '2026-08-05',
    statut: 'OUVERTE',
    createdAt: NOW,
    updatedAt: NOW,
    closedAt: null,
    ...p,
  };
}

function commercial(p: Partial<Commercial> = {}): Commercial {
  return {
    id: 'com_1',
    nom: 'Alex Martin',
    libelleBoond: 'Alex MARTIN',
    email: 'alex.martin@ippon.fr',
    pole: 'Data & IA',
    objectifAnnuel: 1_000_000,
    actif: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  };
}

/**
 * Les tests du backend fichier écrivent dans .data/. Si une exécution précédente n'a pas pu
 * nettoyer (volume monté en lecture seule, conteneur), les résidus fausseraient les assertions
 * qui comptent des enregistrements. On repart donc d'un état propre AVANT de commencer, et les
 * assertions ci-dessous ciblent des identifiants précis plutôt que des totaux.
 */
function nettoyer(): void {
  for (const f of ['commerciaux.json', 'one-on-ones.json', 'one-on-one-actions.json']) {
    try {
      fs.rmSync(`.data/${f}`, { force: true });
    } catch {
      /* suppression refusée : les assertions restent valides malgré les résidus */
    }
  }
}

async function main() {
  nettoyer();

  // ============================================================ CLOISONNEMENT
  console.log('\n--- Cloisonnement (sécurité) ---');

  const e = entretien();
  const filtre = stripPrivate(e);

  ok(filtre.prive === null, 'stripPrivate retire la zone privée');
  ok(filtre.notesBrutes === '', 'stripPrivate retire les notes brutes');
  ok(filtre.transcription === '', 'stripPrivate retire la transcription Google Meet');
  ok(filtre.partage.pointsCles === 'Relancer le compte Y', 'stripPrivate conserve la zone partagée');
  ok(e.prive !== null, "stripPrivate n'altère pas l'objet source (pas de mutation)");

  // Le contrôle réel : plus aucune trace du contenu privé dans le JSON envoyé au client.
  const serialise = JSON.stringify(filtre);
  ok(!serialise.includes('Fatigué'), 'le moral n’apparaît pas dans le JSON filtré');
  ok(!serialise.includes('augmentation'), 'les notes RH n’apparaissent pas dans le JSON filtré');
  ok(!serialise.includes('non relues'), 'les notes brutes n’apparaissent pas dans le JSON filtré');
  ok(!serialise.includes('épuisé'), 'le verbatim n’apparaît pas dans le JSON filtré');
  ok(serialise.includes('Deal X bloqué'), 'la zone partagée reste bien présente');

  const pourManager = visiblePour([e], true);
  ok(pourManager[0].prive?.moral === 'Fatigué en ce moment', 'un manager conserve la zone privée');
  const pourCommercial = visiblePour([e], false);
  ok(pourCommercial[0].prive === null, 'un non-manager perd la zone privée');
  ok(
    !JSON.stringify(pourCommercial).includes('augmentation'),
    'visiblePour(false) ne laisse fuir aucune note RH',
  );

  // Cas piégeux : un entretien SANS zone privée doit rester filtrable sans planter.
  const sansPrive = entretien({ prive: null, notesBrutes: '' });
  ok(stripPrivate(sansPrive).prive === null, 'entretien sans zone privée : filtrage sans erreur');

  // ============================================================ BROUILLON / PARTAGE
  console.log('\n--- Brouillon et partage ---');

  const acces = (role: 'MANAGER' | 'COMMERCIAL' | 'AUCUN', comId = 'com_1'): Acces => ({
    role,
    email: role === 'MANAGER' ? 'manager@ippon.fr' : 'alex.martin@ippon.fr',
    uid: 'u1',
    commercial: role === 'COMMERCIAL' ? commercial({ id: comId }) : null,
    estManager: role === 'MANAGER',
  });

  const brouillon = entretien({ id: 'o3_brouillon', statut: 'BROUILLON', partageLe: null });
  const partage = entretien({ id: 'o3_partage', statut: 'PARTAGE' });

  ok(estPartage(partage) && !estPartage(brouillon), 'estPartage distingue les deux statuts');

  ok(peutLireEntretien(acces('MANAGER'), brouillon), 'le manager lit ses brouillons');
  ok(
    !peutLireEntretien(acces('COMMERCIAL'), brouillon),
    'le commercial ne lit PAS un brouillon qui le concerne',
  );
  ok(
    peutLireEntretien(acces('COMMERCIAL'), partage),
    'le commercial lit son entretien une fois partagé',
  );
  ok(
    !peutLireEntretien(acces('COMMERCIAL', 'com_autre'), partage),
    'le commercial ne lit pas l’entretien partagé d’un collègue',
  );
  ok(!peutLireEntretien(acces('AUCUN'), partage), 'sans rôle : aucune lecture');

  // Fail-closed : un objet sans statut (donnée d'un ancien format) est traité comme un brouillon.
  ok(
    !peutLireEntretien(acces('COMMERCIAL'), { commercialId: 'com_1' }),
    'statut absent -> traité comme brouillon (fail-closed)',
  );

  // La fiche commercial n'a pas de statut : elle suit une règle distincte.
  ok(peutVoirCommercial(acces('COMMERCIAL'), 'com_1'), 'le commercial ouvre sa propre fiche');
  ok(
    !peutVoirCommercial(acces('COMMERCIAL'), 'com_autre'),
    'le commercial n’ouvre pas la fiche d’un collègue',
  );

  const listeMixte = [brouillon, partage];
  const vuManager = filtrerPourLecteur(listeMixte, acces('MANAGER'));
  ok(vuManager.length === 2, 'le manager voit brouillons et partagés');
  const vuCommercial = filtrerPourLecteur(listeMixte, acces('COMMERCIAL'));
  ok(vuCommercial.length === 1 && vuCommercial[0].id === 'o3_partage', 'le commercial ne voit que le partagé');
  ok(vuCommercial[0].prive === null, 'et toujours sans la zone privée');

  // Le piège des ACTIONS : rattachées à un entretien, elles doivent suivre son statut.
  const actionsMixtes = [
    action({ id: 'ab', oneOnOneId: 'o3_brouillon' }),
    action({ id: 'ap', oneOnOneId: 'o3_partage' }),
  ];
  const actionsManager = filtrerActionsPourLecteur(actionsMixtes, listeMixte, acces('MANAGER'));
  ok(actionsManager.length === 2, 'le manager voit toutes les actions');
  const actionsCommercial = filtrerActionsPourLecteur(actionsMixtes, listeMixte, acces('COMMERCIAL'));
  ok(
    actionsCommercial.length === 1 && actionsCommercial[0].id === 'ap',
    'le commercial ne voit PAS les actions issues d’un brouillon',
  );

  // ============================================================ TRANSCRIPTION
  console.log('\n--- Nettoyage de la transcription Google Meet ---');

  // Format réel du Doc généré par Meet : en-tête, prises de parole, pied de page.
  const docMeet = [
    'Point hebdo commercial - 2026/07/28 09:30 CEST - Transcript',
    '',
    '28 juil. 2026',
    'Participants : Pascal Scodellaro, Alex Martin',
    '',
    'Pascal Scodellaro: On commence par le pipeline.',
    'Alex Martin: J’ai deux affaires en négociation.',
    'Pascal Scodellaro: Très bien.',
    '',
    '',
    '',
    'Cette transcription a été générée par Google Meet.',
  ].join('\n');

  const propre = nettoyerTranscription(docMeet);
  ok(propre.startsWith('Pascal Scodellaro: On commence'), 'l’en-tête Meet est retiré');
  ok(!propre.includes('Participants :'), 'la liste des participants est retirée');
  ok(!propre.includes('générée par Google Meet'), 'le pied de page est retiré');
  ok(propre.includes('deux affaires en négociation'), 'le contenu des échanges est conservé');
  ok(!propre.includes('\n\n\n'), 'les lignes vides multiples sont compactées');

  ok(nettoyerTranscription('') === '', 'transcription vide -> chaîne vide');
  // Sans en-tête reconnaissable, on ne doit rien couper : mieux vaut garder trop que perdre.
  const sansEnTete = 'Alex: bonjour\nPascal: bonjour';
  ok(nettoyerTranscription(sansEnTete) === sansEnTete, 'texte déjà propre : laissé intact');

  console.log('\n--- Extraction IA : disponibilité ---');
  ok(!extractionDisponible(), 'l’extraction est indisponible sans configuration (fail-closed)');
  let aLeve = false;
  try {
    await extraireTrame('x'.repeat(500));
  } catch (e) {
    aLeve = e instanceof ExtractionIndisponible;
  }
  ok(aLeve, 'extraireTrame refuse tant que Vertex AI n’est pas configuré');

  console.log('\n--- Extraction IA : validation des sorties du modèle ---');

  // Cas nominal.
  const v1 = validerReponse({
    pipelineCommentaire: 'Pipeline en ligne avec l’objectif.',
    pointsCles: 'Relancer le compte Y.',
    actions: [
      { libelle: 'Relancer Dupont', porteur: 'COMMERCIAL', echeance: '2026-08-15' },
      { libelle: 'Valider la remise', porteur: 'MANAGER' },
    ],
  });
  ok(v1.partage.pipelineCommentaire === 'Pipeline en ligne avec l’objectif.', 'rubrique reprise');
  ok(v1.actions.length === 2, 'deux actions extraites');
  ok(v1.actions[0].echeance === '2026-08-15', 'échéance au bon format conservée');
  ok(v1.actions[1].echeance === null, 'action sans échéance -> null');
  ok(v1.actions[1].porteur === 'MANAGER', 'porteur MANAGER respecté');

  // Le modèle ne doit pas pouvoir alimenter autre chose que la zone partagée.
  const v2 = validerReponse({
    pointsCles: 'ok',
    moral: 'il semble fatigué',
    notesRh: 'demande une augmentation',
    prive: { moral: 'test' },
    transcription: 'verbatim',
    statut: 'PARTAGE',
  });
  const clesV2 = Object.keys(v2.partage);
  ok(!clesV2.includes('moral'), 'un champ « moral » renvoyé par le modèle est ignoré');
  ok(!clesV2.includes('notesRh'), 'un champ « notesRh » renvoyé par le modèle est ignoré');
  ok(
    !JSON.stringify(v2).includes('augmentation') && !JSON.stringify(v2).includes('fatigué'),
    'aucun champ hors liste blanche ne survit à la validation',
  );

  // Types incorrects et réponses malformées.
  const v3 = validerReponse({
    pointsCles: 42,
    dealsARisque: null,
    activiteAmont: { texte: 'objet au lieu d’une chaîne' },
    actions: 'pas un tableau',
  });
  ok(Object.keys(v3.partage).length === 0, 'les valeurs de type incorrect sont écartées');
  ok(v3.actions.length === 0, 'un champ actions non tableau donne une liste vide');

  ok(validerReponse(null).actions.length === 0, 'réponse null : pas de plantage');
  ok(validerReponse(undefined).partage.pointsCles === undefined, 'réponse undefined : pas de plantage');
  ok(validerReponse('texte brut').actions.length === 0, 'réponse non objet : pas de plantage');

  const v4 = validerReponse({
    actions: [
      { libelle: '', porteur: 'COMMERCIAL' },
      { libelle: '   ', porteur: 'COMMERCIAL' },
      { libelle: 'Valide', porteur: 'INCONNU' },
      { libelle: 'Date bancale', porteur: 'COMMERCIAL', echeance: 'la semaine prochaine' },
    ],
  });
  ok(v4.actions.length === 2, 'les actions sans intitulé sont écartées');
  ok(v4.actions[0].porteur === 'COMMERCIAL', 'un porteur inconnu retombe sur COMMERCIAL');
  ok(v4.actions[1].echeance === null, 'une échéance en langage naturel est écartée');

  // Garde-fou de volume : un modèle qui part en digression ne doit pas remplir la base.
  const v5 = validerReponse({ pointsCles: 'x'.repeat(10_000) });
  ok((v5.partage.pointsCles ?? '').length === 4000, 'les textes trop longs sont tronqués');
  const v6 = validerReponse({
    actions: Array.from({ length: 50 }, (_, i) => ({ libelle: `A${i}`, porteur: 'COMMERCIAL' })),
  });
  ok(v6.actions.length === 20, 'le nombre d’actions proposées est plafonné');

  // La garde de configuration passe AVANT celle de longueur : si Vertex n'est pas configuré,
  // l'utilisateur doit le savoir même sur une transcription courte. Renvoyer un résultat vide
  // laisserait croire que le modèle n'a rien trouvé, alors que rien n'a été appelé.
  let leveCourt = false;
  try {
    await extraireTrame('trop court');
  } catch (e) {
    leveCourt = e instanceof ExtractionIndisponible;
  }
  ok(leveCourt, 'non configuré : l’erreur est levée même pour une transcription courte');

  // ============================================================ ACTIONS
  console.log('\n--- Actions ---');

  ok(isActionOuverte('OUVERTE') && isActionOuverte('EN_COURS'), 'OUVERTE et EN_COURS sont ouvertes');
  ok(!isActionOuverte('FAITE') && !isActionOuverte('ABANDONNEE'), 'FAITE et ABANDONNEE sont closes');

  const today = '2026-07-29';
  ok(isEnRetard(action({ echeance: '2026-07-01' }), today), 'échéance passée + ouverte = en retard');
  ok(!isEnRetard(action({ echeance: today }), today), "échéance du jour n'est pas en retard");
  ok(!isEnRetard(action({ echeance: '2026-08-30' }), today), 'échéance future = pas en retard');
  ok(
    !isEnRetard(action({ echeance: '2026-07-01', statut: 'FAITE' }), today),
    'action faite n’est jamais en retard, même échue',
  );
  ok(!isEnRetard(action({ echeance: null }), today), 'action sans échéance n’est pas en retard');

  const lot = [
    action({ id: 'a1', echeance: '2026-09-01' }),
    action({ id: 'a2', echeance: null }),
    action({ id: 'a3', echeance: '2026-07-01' }), // en retard
    action({ id: 'a4', echeance: '2026-08-01' }),
    action({ id: 'a5', statut: 'FAITE', echeance: '2026-06-01' }),
  ];
  const tri = actionsParUrgence(lot, today);
  ok(tri.length === 4, 'actionsParUrgence exclut les actions closes');
  ok(tri[0].id === 'a3', 'les actions en retard passent en premier');
  ok(tri[1].id === 'a4' && tri[2].id === 'a1', 'puis tri par échéance croissante');
  ok(tri[3].id === 'a2', 'les actions sans échéance ferment la marche');

  // ============================================================ SEMAINES ISO
  console.log('\n--- Semaines ISO ---');

  // Références vérifiables : le 4 janvier appartient toujours à la semaine 1 (règle ISO-8601).
  ok(semaineIso('2026-01-04') === '2026-S01', '4 janvier 2026 -> semaine 1');
  ok(semaineIso('2026-07-29') === '2026-S31', '29 juillet 2026 -> semaine 31');
  // Piège classique : le 1er janvier 2027 est un vendredi, il appartient à la semaine 53 de 2026.
  ok(semaineIso('2027-01-01') === '2026-S53', '1er janvier 2027 -> semaine 53 de 2026');
  ok(semaineIso('pas-une-date') === '', 'date invalide -> chaîne vide, pas de plantage');

  const groupes = grouperParSemaine([
    action({ id: 'g1', echeance: '2026-07-29' }),
    action({ id: 'g2', echeance: '2026-07-30' }),
    action({ id: 'g3', echeance: null }),
  ]);
  ok((groupes.get('2026-S31') ?? []).length === 2, 'deux actions groupées sur la semaine 31');
  ok((groupes.get('') ?? []).length === 1, 'les actions sans échéance ont leur propre groupe');

  ok(joursEntre('2026-07-20', '2026-07-29') === 9, 'joursEntre = 9');
  ok(joursEntre('2026-07-29', '2026-07-20') === -9, 'joursEntre négatif si ordre inversé');

  // ============================================================ TABLEAU DE BORD
  console.log('\n--- Construction du suivi ---');

  const suivi = construireSuivi(
    [commercial(), commercial({ id: 'com_2', nom: 'Sans entretien', email: 'b@ippon.fr' })],
    [entretien(), entretien({ id: 'o3_0', date: '2026-06-01' })],
    [action({ id: 'x1' }), action({ id: 'x2', echeance: '2026-07-01' }), action({ id: 'x3', statut: 'FAITE' })],
    today,
  );
  ok(suivi.length === 2, 'une ligne par commercial');
  ok(suivi[0].dernierEntretien?.date === '2026-07-20', 'le dernier entretien est le plus récent');
  ok(suivi[0].joursDepuisDernier === 9, 'ancienneté du dernier entretien = 9 jours');
  ok(suivi[0].actionsOuvertes === 2, '2 actions ouvertes (la close est exclue)');
  ok(suivi[0].actionsEnRetard === 1, '1 action en retard');
  ok(suivi[1].dernierEntretien === null && suivi[1].joursDepuisDernier === null, 'commercial jamais vu');

  // ============================================================ PIPELINE BOOND
  console.log('\n--- Rattachement au pipeline BoondManager ---');

  const opp = (p: Partial<Opportunity>): Opportunity => ({
    id: 'O1',
    nom: 'Affaire',
    client: 'Client',
    pole: 'Data',
    commercial: 'Alex MARTIN',
    secteur: 'Banque',
    montant: 100000,
    probabilite: 50,
    etape: 'PROPOSITION',
    dateCloturePrev: '2026-09-01',
    notes: '',
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  });

  const opps = [
    opp({ id: 'O1' }),
    opp({ id: 'O2', montant: 200000, probabilite: 100, etape: 'GAGNE' }),
    opp({ id: 'O3', dateCloturePrev: '2026-07-01' }), // ouverte, clôture dépassée
    opp({ id: 'O4', commercial: 'Autre PERSONNE', montant: 999999 }),
  ];

  const p1 = calculerPipeline(opps, 'Alex MARTIN', today);
  ok(p1.rattache, 'pipeline rattaché quand le libellé Boond correspond');
  ok(p1.nbOuvertes === 2, '2 affaires ouvertes');
  ok(p1.pondere === 100000, 'pondéré = 50 % de 100k x2 = 100k');
  ok(p1.gagne === 200000, 'CA gagné = 200k');
  ok(p1.enRetard.length === 1, '1 affaire au-delà de la date de clôture');
  ok(
    !p1.principales.some((o) => o.id === 'O4'),
    'les affaires d’un autre commercial ne sont pas comptées',
  );

  ok(!calculerPipeline(opps, '', today).rattache, 'libellé Boond vide -> non rattaché');
  ok(
    !calculerPipeline(opps, 'Alex Martin', today).rattache,
    'la casse du libellé Boond compte : « Alex Martin » ne matche pas « Alex MARTIN »',
  );

  // ============================================================ STOCKAGE
  console.log('\n--- Couche de stockage (backend fichier) ---');

  const c = await upsertCommercial({
    id: 'com_test',
    nom: 'Test Commercial',
    libelleBoond: 'Test COMMERCIAL',
    email: 'Test.Commercial@ippon.fr', // volontairement en casse mixte
    pole: 'Data & IA',
    objectifAnnuel: 500000,
    actif: true,
  });
  ok(c.email === 'test.commercial@ippon.fr', "l'email est normalisé en minuscules");

  const parEmail = await getCommercialParEmail('TEST.COMMERCIAL@IPPON.FR');
  ok(parEmail?.id === 'com_test', 'recherche par email insensible à la casse');
  ok((await getCommercialParEmail('')) === null, 'email vide -> aucun commercial (pas de match large)');
  ok((await getCommercialParEmail('inconnu@ippon.fr')) === null, 'email inconnu -> null');

  const enregistre = await upsertOneOnOne({
    id: 'o3_test',
    commercialId: 'com_test',
    date: '2026-07-28',
    auteurEmail: 'manager@ippon.fr',
    statut: 'BROUILLON',
    partageLe: null,
    chiffres: { caSigne: 1000, pipelinePondere: 2000, nbRdv: 3, nbNouveauxComptes: 1 },
    partage: {
      pipelineCommentaire: 'ok',
      dealsARisque: '',
      activiteAmont: '',
      administratif: '',
      developpement: '',
      pointsCles: 'décision',
    },
    prive: { moral: 'secret', humeur: 4, notesRh: '' },
    notesBrutes: 'brut',
    transcription: '',
  });
  ok(enregistre.id === 'o3_test', 'entretien enregistré');
  ok(enregistre.prive?.moral === 'secret', 'zone privée persistée pour le manager');
  const relu = (await listOneOnOnes('com_test')).find((x) => x.id === 'o3_test');
  ok(relu?.partage.pointsCles === 'décision', 'entretien relu depuis le stockage');
  ok(
    enregistre.statut === 'BROUILLON' && enregistre.partageLe === null,
    'un entretien naît en brouillon, sans date de partage',
  );

  const publie = await definirPartage('o3_test', true);
  ok(publie?.statut === 'PARTAGE', 'definirPartage(true) passe en partagé');
  ok(publie?.partageLe !== null, 'la date de partage est posée automatiquement');

  const rendu = await definirPartage('o3_test', false);
  ok(rendu?.statut === 'BROUILLON', 'definirPartage(false) repasse en brouillon');
  ok(rendu?.partageLe === null, 'le retour en brouillon efface la date de partage');

  ok((await definirPartage('inexistant', true)) === null, 'partage d’un entretien inconnu -> null');

  const a1 = await upsertAction({
    id: 'act_test',
    oneOnOneId: 'o3_test',
    commercialId: 'com_test',
    libelle: 'Test action',
    porteur: 'COMMERCIAL',
    echeance: '2026-08-15',
    statut: 'OUVERTE',
  });
  ok(a1.closedAt === null, 'action ouverte : pas de date de clôture');

  const a2 = await upsertAction({ ...a1, statut: 'FAITE' });
  ok(a2.closedAt !== null, 'passage à FAITE : date de clôture posée automatiquement');

  const a3 = await upsertAction({ ...a2, statut: 'OUVERTE' });
  ok(a3.closedAt === null, 'réouverture : la date de clôture est effacée');

  ok((await listActions({ commercialId: 'com_test' })).length === 1, 'action relue par commercial');
  ok((await listActions({ oneOnOneId: 'inconnu' })).length === 0, 'filtre par entretien inconnu -> vide');

  ok(typeof aujourdHui() === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(aujourdHui()), 'aujourdHui() au format ISO');

  // Nettoyage des fichiers créés par les tests (même convention que scripts/test-store.ts).
  // Toléré s'il échoue : sur certains montages (conteneur, volume monté en lecture seule) la
  // suppression est refusée. Ce n'est pas un échec de test — .data/ est ignoré par git.
  for (const f of ['commerciaux.json', 'one-on-ones.json', 'one-on-one-actions.json']) {
    try {
      fs.rmSync(`.data/${f}`, { force: true });
    } catch {
      console.log(`(nettoyage impossible pour .data/${f} — sans conséquence)`);
    }
  }

  console.log(fail === 0 ? '\n✅ SUIVI 1:1 OK' : `\n❌ ${fail} échec(s)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
