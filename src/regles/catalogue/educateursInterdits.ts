/**
 * `educateurs_interdits` — ces educateurs ne doivent jamais encadrer ce jeune.
 *
 * params : `educateurs` (liste noire, obligatoire).
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { erreur } from '../../validation/resultat.ts';
import {
  chemin,
  exigeCibles,
  exigeReferences,
  faitViolation,
  litListe,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

export const educateursInterdits: EvaluateurRegle = {
  type: 'educateurs_interdits',
  dureParDefaut: true,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const problemes = exigeCibles(regle, ref, 'jeunes');
    const educateurs = litListe(regle, 'educateurs');
    if (educateurs.length === 0) {
      problemes.push(
        erreur('regle.params', chemin(regle, ref, '/params/educateurs'), 'liste "educateurs" vide ou absente'),
      );
    }
    problemes.push(...exigeReferences(regle, ref, educateurs, 'educateurs', '/params/educateurs'));
    problemes.push(...exigeReferences(regle, ref, regle.cibles.jeunes ?? [], 'jeunes', '/cibles/jeunes'));
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const interdits = new Set(litListe(regle, 'educateurs'));
    const violations: Violation[] = [];

    for (const jeuneId of regle.cibles.jeunes ?? []) {
      for (const creneau of ctx.planning.creneauxDeJeune(jeuneId)) {
        const presents = creneau.educateurs.filter((e) => interdits.has(e));
        if (presents.length > 0) {
          violations.push(
            faitViolation(
              regle,
              ctx.options,
              `${presents.map((e) => ctx.ref.libelleEducateur(e)).join(', ')} ne doit pas encadrer ${ctx.ref.libelleJeune(jeuneId)}`,
              { creneaux: [creneau.id], jeunes: [jeuneId], educateurs: presents },
              presents.length,
            ),
          );
        }
      }
    }
    return violations;
  },
};
