/**
 * Analyse d'une semaine entiere.
 *
 * Ce n'est pas seulement cinq analyses journalieres mises bout a bout : les
 * quotas hebdomadaires (`quota_detachement.maxPasParSemaine`) ne sont visibles
 * qu'ici. Un educateur peut respecter son plafond journalier tous les jours et
 * depasser son plafond de semaine — aucune journee prise separement ne le dit.
 */

import type { Referentiel } from '../referentiel.ts';
import type { Violation } from '../regles/base.ts';
import { evalueSemaine } from '../regles/evaluation.ts';
import type { Jour } from '../types.ts';
import { etatJourNominal } from './etatJour.ts';
import { optionsAvec, type OptionsMoteur, type OptionsPartielles } from './options.ts';
import { auditeJourNominal, type Reparation } from './reparation.ts';

export interface JourDeSemaine {
  jour: Jour;
  reparation: Reparation;
}

export interface AuditSemaine {
  journees: JourDeSemaine[];
  /** Violations que seule une lecture a la semaine peut detecter. */
  violationsHebdomadaires: Violation[];
  cout: number;
  admissible: boolean;
}

/**
 * Audite le planning type sur tous les jours d'accueil de la grille.
 * Aucune absence : c'est la semaine telle qu'elle tourne quand tout le monde
 * est la, et donc la reference a laquelle toute reparation se compare.
 */
export function auditeSemaine(ref: Referentiel, options?: OptionsPartielles): AuditSemaine {
  const completes = optionsAvec(options);
  const journees = ref.structure.grille.jours.map((jour) => ({
    jour,
    reparation: auditeJourNominal(ref, jour, completes),
  }));
  return bilanDeSemaine(ref, journees, completes);
}

/** Agrege des journees deja reparees. Partage avec l'analyse sur periode. */
export function bilanDeSemaine(
  ref: Referentiel,
  journees: readonly JourDeSemaine[],
  options: OptionsMoteur,
): AuditSemaine {
  const premier = journees[0]?.jour ?? ref.structure.grille.jours[0] ?? 'lundi';
  const violationsHebdomadaires = evalueSemaine(
    { ref, etat: etatJourNominal(premier), options },
    journees.map((j) => j.reparation.planning),
  );

  const coutJournees = journees.reduce((total, j) => total + j.reparation.cout, 0);
  const coutHebdo = violationsHebdomadaires.reduce((total, v) => total + v.cout, 0);

  return {
    journees: [...journees],
    violationsHebdomadaires,
    cout: coutJournees + coutHebdo,
    admissible:
      journees.every((j) => j.reparation.admissible) && !violationsHebdomadaires.some((v) => v.dure),
  };
}
