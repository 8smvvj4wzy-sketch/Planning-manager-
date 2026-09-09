/**
 * `continuite_journee` — limite le nombre de ruptures dans la journee d'un jeune.
 *
 * params :
 *   - `maxChangements` : nombre de ruptures tolerees ;
 *   - `sur` : "educateurs" (defaut), "salle" ou "activite".
 *
 * Souple par defaut : chaque rupture au-dela du seuil coute un poids.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { erreur } from '../../validation/resultat.ts';
import type { Creneau } from '../../planning/planning.ts';
import {
  chemin,
  exigeCibles,
  exigeNombre,
  exigeReferences,
  faitViolation,
  litNombre,
  litTexte,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

type Dimension = 'educateurs' | 'salle' | 'activite';

function empreinte(creneau: Creneau, sur: Dimension): string {
  if (sur === 'salle') return creneau.salleId ?? '—';
  if (sur === 'activite') return creneau.activiteId;
  return [...creneau.educateurs].sort().join('+');
}

export const continuiteJournee: EvaluateurRegle = {
  type: 'continuite_journee',
  dureParDefaut: false,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const problemes = [
      ...exigeCibles(regle, ref, 'jeunes'),
      ...exigeNombre(regle, ref, 'maxChangements'),
      ...exigeReferences(regle, ref, regle.cibles.jeunes ?? [], 'jeunes', '/cibles/jeunes'),
    ];
    const sur = litTexte(regle, 'sur');
    if (sur && !['educateurs', 'salle', 'activite'].includes(sur)) {
      problemes.push(erreur('regle.params', chemin(regle, ref, '/params/sur'), `dimension inconnue : "${sur}"`));
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const maximum = litNombre(regle, 'maxChangements');
    if (maximum === undefined) return [];
    const sur = (litTexte(regle, 'sur') ?? 'educateurs') as Dimension;
    const violations: Violation[] = [];

    for (const jeuneId of regle.cibles.jeunes ?? []) {
      const journee = ctx.planning.journeeDuJeune(jeuneId);
      let changements = 0;
      for (let i = 1; i < journee.length; i++) {
        const precedent = journee[i - 1];
        const courant = journee[i];
        if (precedent && courant && empreinte(precedent, sur) !== empreinte(courant, sur)) changements++;
      }
      if (changements > maximum) {
        violations.push(
          faitViolation(
            regle,
            ctx.options,
            `${ctx.ref.libelleJeune(jeuneId)} : ${changements} changements de ${sur} dans la journee (maximum ${maximum})`,
            { creneaux: journee.map((c) => c.id), jeunes: [jeuneId] },
            changements - maximum,
          ),
        );
      }
    }
    return violations;
  },
};
