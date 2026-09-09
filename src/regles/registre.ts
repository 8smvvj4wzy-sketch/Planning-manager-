/**
 * Registre des types de regles connus.
 *
 * Ajouter un type = ecrire un evaluateur dans `catalogue/` et l'ajouter ici.
 * Rien d'autre dans le moteur n'a besoin de le connaitre.
 */

import type { EvaluateurRegle } from './base.ts';
import { binomeJeunes } from './catalogue/binomeJeunes.ts';
import { continuiteJournee } from './catalogue/continuiteJournee.ts';
import { educateursAutorises } from './catalogue/educateursAutorises.ts';
import { educateursInterdits } from './catalogue/educateursInterdits.ts';
import { indisponibiliteRecurrente } from './catalogue/indisponibiliteRecurrente.ts';
import { jeunesIncompatibles } from './catalogue/jeunesIncompatibles.ts';
import { perimetreRenfort } from './catalogue/perimetreRenfort.ts';
import { presenceMinimale } from './catalogue/presenceMinimale.ts';
import { quotaDetachement } from './catalogue/quotaDetachement.ts';
import { rotationEducateur } from './catalogue/rotationEducateur.ts';
import { salleRequise } from './catalogue/salleRequise.ts';
import { tauxEncadrement } from './catalogue/tauxEncadrement.ts';

const EVALUATEURS: readonly EvaluateurRegle[] = [
  educateursAutorises,
  educateursInterdits,
  binomeJeunes,
  jeunesIncompatibles,
  rotationEducateur,
  quotaDetachement,
  perimetreRenfort,
  tauxEncadrement,
  salleRequise,
  continuiteJournee,
  presenceMinimale,
  indisponibiliteRecurrente,
];

const PAR_TYPE = new Map(EVALUATEURS.map((e) => [e.type, e]));

export function evaluateurDe(type: string): EvaluateurRegle | undefined {
  return PAR_TYPE.get(type);
}

export function typesConnus(): string[] {
  return [...PAR_TYPE.keys()];
}

export function catalogue(): readonly EvaluateurRegle[] {
  return EVALUATEURS;
}
