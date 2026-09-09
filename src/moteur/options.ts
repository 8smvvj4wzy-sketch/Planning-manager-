/**
 * Les trois arbitrages laissés ouverts par la spec, rendus explicites et
 * modifiables. Voir docs/decisions.md pour le raisonnement.
 */

/** Que cherche-t-on a preserver en priorite quand le moteur repare ? */
export type PrioriteReparation = 'jeunes' | 'educateurs';

/**
 * - `indisponible` : un educateur detache est retire du terrain, point.
 * - `mobilisable` : il reste rappelable, mais son rappel a un cout (defaut).
 * - `libre`       : le detachement n'a aucun effet sur la disponibilite.
 */
export type ModeDetachement = 'indisponible' | 'mobilisable' | 'libre';

/**
 * - `individuel`  : on somme les `encadrement` de chaque jeune (defaut).
 * - `ratioGroupe` : on applique un ratio jeunes/educateur par groupe.
 */
export type ModeEncadrement = 'individuel' | 'ratioGroupe';

export interface CoutsMoteur {
  /** Par jeune dont la journee change par rapport au planning type. */
  jeuneImpacte: number;
  /** Par educateur deplace d'un creneau a un autre. */
  educateurDeplace: number;
  /** Par creneau modifie, quelle que soit l'ampleur. */
  creneauModifie: number;
  /** Par creneau que le moteur n'a pas su encadrer : doit dominer tout le reste. */
  creneauNonResolu: number;
  /** Rappel d'un educateur detache (mode `mobilisable`). */
  mobilisationDetache: number;
  /** Recours a un renfort du jour plutot qu'a l'equipe en place. */
  recoursRenfort: number;
}

export interface OptionsMoteur {
  priorite: PrioriteReparation;
  couts: CoutsMoteur;
  detachement: ModeDetachement;
  encadrement: ModeEncadrement;
  /** Ratio jeunes/educateur applique en mode `ratioGroupe`. */
  ratioParDefaut: number;
  /** Poids retenu pour une regle souple qui n'en declare pas. */
  poidsSoupleParDefaut: number;
  /** Garde-fou de la passe d'amelioration. */
  maxIterationsAmelioration: number;
}

const COUTS_PRIORITE_JEUNES: CoutsMoteur = {
  jeuneImpacte: 100,
  educateurDeplace: 40,
  creneauModifie: 10,
  creneauNonResolu: 10_000,
  mobilisationDetache: 150,
  recoursRenfort: 25,
};

const COUTS_PRIORITE_EDUCATEURS: CoutsMoteur = {
  ...COUTS_PRIORITE_JEUNES,
  jeuneImpacte: 40,
  educateurDeplace: 100,
};

export const OPTIONS_PAR_DEFAUT: OptionsMoteur = {
  priorite: 'jeunes',
  couts: COUTS_PRIORITE_JEUNES,
  detachement: 'mobilisable',
  encadrement: 'individuel',
  ratioParDefaut: 3,
  poidsSoupleParDefaut: 50,
  maxIterationsAmelioration: 200,
};

export interface OptionsPartielles extends Partial<Omit<OptionsMoteur, 'couts'>> {
  couts?: Partial<CoutsMoteur>;
}

/**
 * Fusionne des options partielles avec les defauts.
 * `priorite` choisit le bareme de couts ; `couts` peut ensuite l'affiner.
 */
export function optionsAvec(partielles: OptionsPartielles = {}): OptionsMoteur {
  const priorite = partielles.priorite ?? OPTIONS_PAR_DEFAUT.priorite;
  const base = priorite === 'educateurs' ? COUTS_PRIORITE_EDUCATEURS : COUTS_PRIORITE_JEUNES;
  return {
    ...OPTIONS_PAR_DEFAUT,
    ...partielles,
    priorite,
    couts: { ...base, ...(partielles.couts ?? {}) },
  };
}
