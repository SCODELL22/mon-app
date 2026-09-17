// Pont entre le suivi 1:1 et les données BoondManager déjà présentes dans l'app.
//
// Intérêt de l'intégration : le manager n'a pas à ressaisir les chiffres du commercial, ils sont
// lus depuis le dernier import. Le rattachement se fait sur `Commercial.libelleBoond`, qui doit
// reprendre À L'IDENTIQUE le champ de l'export qui porte la personne suivie :
//   - espace agence    : « Responsable manager » (un commercial) ;
//   - espace direction : « Agence » (un directeur d'agence suit toute son agence).
// Voir lib/espace.ts.
import { listOpportunities } from './store';
import { isOpen, ponderation, statutOf, type Opportunity } from './domain';
import { controlesCrm } from './controles-crm';
import { vocabulaire, type Espace } from './espace';
import type { Commercial } from './one-on-one';

export type ChampRattachement = 'commercial' | 'agence';

export interface PipelineCommercial {
  /** false si le commercial n'a pas de libellé Boond, ou si ce libellé n'existe pas dans l'import. */
  rattache: boolean;
  nbOuvertes: number;
  brut: number; // somme des montants ouverts
  pondere: number; // somme des montants × probabilité
  gagne: number; // CA gagné
  /** Affaires ouvertes les plus significatives, triées par montant pondéré décroissant. */
  principales: Opportunity[];
  /** Opportunités ouvertes dont la date de clôture prévue est dépassée — sujet classique de 1:1. */
  enRetard: Opportunity[];
  /** Contrôles qualité CRM (cf. lib/controles-crm.ts). */
  demarrageDepasse: Opportunity[];
  clotureDepassee: Opportunity[];
  poleBusinessDev: Opportunity[];
}

export const PIPELINE_VIDE: PipelineCommercial = {
  rattache: false,
  nbOuvertes: 0,
  brut: 0,
  pondere: 0,
  gagne: 0,
  principales: [],
  enRetard: [],
  demarrageDepasse: [],
  clotureDepassee: [],
  poleBusinessDev: [],
};

function valeurRattachement(o: Opportunity, champ: ChampRattachement): string {
  return champ === 'agence' ? (o.agence ?? '') : o.commercial;
}

/**
 * Calcule le pipeline d'une fiche à partir des opportunités importées.
 * `today` est injecté pour rester testable (même principe que isEnRetard dans one-on-one.ts).
 */
export function calculerPipeline(
  opps: Opportunity[],
  libelleBoond: string,
  today: string,
  champ: ChampRattachement = 'commercial',
): PipelineCommercial {
  if (!libelleBoond) return PIPELINE_VIDE;
  const siennes = opps.filter((o) => valeurRattachement(o, champ) === libelleBoond);
  if (siennes.length === 0) return PIPELINE_VIDE;

  const ouvertes = siennes.filter((o) => isOpen(o.etape));
  const ctrl = controlesCrm(siennes, today);
  return {
    rattache: true,
    nbOuvertes: ouvertes.length,
    brut: ouvertes.reduce((s, o) => s + o.montant, 0),
    pondere: ouvertes.reduce((s, o) => s + ponderation(o), 0),
    gagne: siennes.filter((o) => statutOf(o.etape) === 'won').reduce((s, o) => s + o.montant, 0),
    principales: [...ouvertes].sort((a, b) => ponderation(b) - ponderation(a)).slice(0, 6),
    enRetard: ouvertes.filter((o) => o.dateCloturePrev !== null && o.dateCloturePrev < today),
    demarrageDepasse: ctrl.demarrageDepasse,
    clotureDepassee: ctrl.clotureDepassee,
    poleBusinessDev: ctrl.poleBusinessDev,
  };
}

/** Version I/O : charge les opportunités puis délègue au calcul pur. */
export async function pipelineDuCommercial(
  espace: Espace,
  c: Pick<Commercial, 'libelleBoond'>,
  today: string,
): Promise<PipelineCommercial> {
  if (!c.libelleBoond) return PIPELINE_VIDE;
  // Import de l'espace : le rappel pipeline d'un OTO lit l'import France du DG, jamais celui
  // de l'agence.
  const opps = await listOpportunities(espace);
  return calculerPipeline(opps, c.libelleBoond, today, vocabulaire(espace).rattachement.champ);
}
