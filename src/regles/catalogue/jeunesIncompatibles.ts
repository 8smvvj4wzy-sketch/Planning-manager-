/**
 * `jeunes_incompatibles` — ces jeunes ne doivent pas se retrouver sur le meme
 * creneau. Dure par defaut, sans params.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import {
  exigeCibles,
  exigeReferences,
  faitViolation,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

export const jeunesIncompatibles: EvaluateurRegle = {
  type: 'jeunes_incompatibles',
  dureParDefaut: true,
  libelle: 'Jeunes incompatibles',
  resume: 'Ces jeunes ne doivent pas se retrouver sur le même créneau.',
  cibles: { cles: ['jeunes'], minimum: 2 },
  champs: [],

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    return [
      ...exigeCibles(regle, ref, 'jeunes', 2),
      ...exigeReferences(regle, ref, regle.cibles.jeunes ?? [], 'jeunes', '/cibles/jeunes'),
    ];
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const cibles = regle.cibles.jeunes ?? [];
    const violations: Violation[] = [];

    for (const creneau of ctx.planning.creneaux) {
      const ensemble = cibles.filter((id) => creneau.jeunes.includes(id));
      if (ensemble.length >= 2) {
        violations.push(
          faitViolation(
            regle,
            ctx.options,
            `${ensemble.map((id) => ctx.ref.libelleJeune(id)).join(' et ')} ne doivent pas etre sur le meme creneau`,
            { creneaux: [creneau.id], jeunes: ensemble },
            ensemble.length - 1,
          ),
        );
      }
    }
    return violations;
  },
};
