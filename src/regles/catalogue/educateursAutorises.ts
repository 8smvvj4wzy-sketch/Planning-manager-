/**
 * `educateurs_autorises` — ce jeune ne peut etre encadre que par ces educateurs.
 *
 * params :
 *   - `educateurs` : liste blanche (obligatoire)
 *   - `mode` : "exclusif" (defaut) = tout educateur du creneau doit figurer dans
 *              la liste ; "au-moins-un" = il suffit qu'un educateur de la liste
 *              soit present sur le creneau.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import {
  chemin,
  exigeCibles,
  exigeReferences,
  faitViolation,
  litListe,
  litTexte,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';
import { erreur } from '../../validation/resultat.ts';

export const educateursAutorises: EvaluateurRegle = {
  type: 'educateurs_autorises',
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
    const mode = litTexte(regle, 'mode');
    if (mode && mode !== 'exclusif' && mode !== 'au-moins-un') {
      problemes.push(
        erreur('regle.params', chemin(regle, ref, '/params/mode'), `mode inconnu : "${mode}"`),
      );
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const autorises = new Set(litListe(regle, 'educateurs'));
    const exclusif = (litTexte(regle, 'mode') ?? 'exclusif') === 'exclusif';
    const violations: Violation[] = [];

    for (const jeuneId of regle.cibles.jeunes ?? []) {
      for (const creneau of ctx.planning.creneauxDeJeune(jeuneId)) {
        if (exclusif) {
          const intrus = creneau.educateurs.filter((e) => !autorises.has(e));
          if (intrus.length > 0) {
            violations.push(
              faitViolation(
                regle,
                ctx.options,
                `${ctx.ref.libelleJeune(jeuneId)} est encadre par ${intrus
                  .map((e) => ctx.ref.libelleEducateur(e))
                  .join(', ')}, hors liste autorisee`,
                { creneaux: [creneau.id], jeunes: [jeuneId], educateurs: intrus },
                intrus.length,
              ),
            );
          }
        } else if (creneau.educateurs.length > 0 && !creneau.educateurs.some((e) => autorises.has(e))) {
          violations.push(
            faitViolation(
              regle,
              ctx.options,
              `aucun educateur autorise aupres de ${ctx.ref.libelleJeune(jeuneId)}`,
              { creneaux: [creneau.id], jeunes: [jeuneId], educateurs: [...creneau.educateurs] },
            ),
          );
        }
      }
    }
    return violations;
  },
};
