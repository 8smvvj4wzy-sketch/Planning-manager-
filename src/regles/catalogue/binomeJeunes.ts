/**
 * `binome_jeunes` — ces jeunes fonctionnent bien ensemble : on cherche a les
 * placer sur le meme creneau, et quand ils y sont seuls l'effectif d'encadrement
 * requis tombe a `educateursRequis` (voir src/encadrement.ts).
 *
 * cibles : `jeunes` (2 minimum). params : `educateursRequis`.
 * Souple par defaut.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { jeunePresent } from '../../moteur/etatJour.ts';
import {
  exigeCibles,
  exigeNombre,
  exigeReferences,
  faitViolation,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

export const binomeJeunes: EvaluateurRegle = {
  type: 'binome_jeunes',
  dureParDefaut: false,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    return [
      ...exigeCibles(regle, ref, 'jeunes', 2),
      ...exigeNombre(regle, ref, 'educateursRequis'),
      ...exigeReferences(regle, ref, regle.cibles.jeunes ?? [], 'jeunes', '/cibles/jeunes'),
    ];
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const cibles = regle.cibles.jeunes ?? [];
    const violations: Violation[] = [];

    for (const pas of ctx.ref.grille.tousLesPas()) {
      if (ctx.ref.grille.estPause(pas)) continue;
      const presents = cibles.filter((id) => jeunePresent(ctx.ref, ctx.etat, id, pas));
      if (presents.length < 2) continue;

      const creneaux = new Set(
        presents.map((id) => ctx.planning.jeuneOccupeAuPas(id, pas)?.id).filter((x): x is string => !!x),
      );
      const places = presents.filter((id) => ctx.planning.jeuneOccupeAuPas(id, pas));
      if (places.length >= 2 && creneaux.size > 1) {
        violations.push(
          faitViolation(
            regle,
            ctx.options,
            `binome separe a ${ctx.ref.grille.heureDePas(pas)} : ${presents
              .map((id) => ctx.ref.libelleJeune(id))
              .join(' / ')}`,
            { creneaux: [...creneaux], jeunes: presents, pas: [pas] },
          ),
        );
      }
    }
    return violations;
  },
};
