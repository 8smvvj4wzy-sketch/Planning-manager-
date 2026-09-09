/**
 * planning-ime — socle du moteur de planning.
 *
 * Trois briques, utilisables independamment :
 *   - `valideStructure` / `valideJour` : les fichiers sont-ils exploitables ?
 *   - `evalue` : quelles regles ce planning viole-t-il, et a quel cout ?
 *   - `repare` : que devient la journee quand untel est absent ?
 */

export * from './types.ts';
export { GrilleTemps, estHeureValide, heureEnMinutes, minutesEnHeure } from './temps.ts';
export { Referentiel } from './referentiel.ts';

export {
  Planning,
  creneauxSeChevauchent,
  estFige,
  pasDuCreneau,
  type Creneau,
  type OrigineCreneau,
} from './planning/planning.ts';
export {
  appliqueAffectationsManuelles,
  planningInitial,
  planningTypeDuJour,
} from './planning/construction.ts';

export {
  chargeStructure,
  formate,
  valideJour,
  valideStructure,
  verifieCoherenceJour,
  verifieCoherenceStructure,
  type Gravite,
  type Probleme,
  type Resultat,
} from './validation/index.ts';

export {
  COUT_REGLE_DURE,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from './regles/base.ts';
export { catalogue, evaluateurDe, typesConnus } from './regles/registre.ts';
export { evalue, evalueDures, evalueSemaine, type Bilan } from './regles/evaluation.ts';

export {
  OPTIONS_PAR_DEFAUT,
  optionsAvec,
  type CoutsMoteur,
  type ModeDetachement,
  type ModeEncadrement,
  type OptionsMoteur,
  type OptionsPartielles,
  type PrioriteReparation,
} from './moteur/options.ts';
export {
  construitEtatJour,
  educateurDisponible,
  etatJourNominal,
  jeunePresent,
  jourDeLaDate,
  type EtatJour,
} from './moteur/etatJour.ts';
export { calculDisponibilite, indisponibilitesRecurrentes } from './moteur/disponibilite.ts';
export {
  auditeJourNominal,
  jeunesImpactes,
  repare,
  reparePlanning,
  type Changement,
  type Conflit,
  type Reparation,
} from './moteur/reparation.ts';

export { educateursRequis, jeunesPresentsDu, ratioApplicable } from './encadrement.ts';
export { estDetacheSur, groupesDeReference } from './detachement.ts';
export { educateursLibres, jeunesSansAffectation, sallesLibres } from './vues.ts';
