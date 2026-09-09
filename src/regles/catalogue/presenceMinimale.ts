/**
 * `presence_minimale` — a tout moment ou le groupe accueille au moins un jeune,
 * un nombre plancher d'educateurs doit lui etre affecte.
 *
 * cibles : `groupes`. params : `educMin`.
 * Les pas de pause sont ignores : le moteur n'y affecte rien automatiquement.
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
  litNombre,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

export const presenceMinimale: EvaluateurRegle = {
  type: 'presence_minimale',
  dureParDefaut: true,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    return [
      ...exigeCibles(regle, ref, 'groupes'),
      ...exigeNombre(regle, ref, 'educMin'),
      ...exigeReferences(regle, ref, regle.cibles.groupes ?? [], 'groupes', '/cibles/groupes'),
    ];
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const minimum = litNombre(regle, 'educMin');
    if (minimum === undefined) return [];
    const violations: Violation[] = [];

    for (const groupeId of regle.cibles.groupes ?? []) {
      const membres = ctx.ref.jeunesDuGroupe(groupeId).map((j) => j.id);
      for (const pas of ctx.ref.grille.tousLesPas()) {
        if (ctx.ref.grille.estPause(pas)) continue;
        const presents = membres.filter((id) => jeunePresent(ctx.ref, ctx.etat, id, pas));
        if (presents.length === 0) continue;

        const creneaux = ctx.planning.creneauxAuPas(pas).filter((c) => c.jeunes.some((id) => membres.includes(id)));
        const educateurs = new Set(creneaux.flatMap((c) => c.educateurs));
        if (educateurs.size < minimum) {
          violations.push(
            faitViolation(
              regle,
              ctx.options,
              `${ctx.ref.groupes.get(groupeId)?.nom ?? groupeId} : ${educateurs.size} educateur(s) a ${ctx.ref.grille.heureDePas(pas)} (minimum ${minimum})`,
              {
                creneaux: creneaux.map((c) => c.id),
                jeunes: presents,
                educateurs: [...educateurs],
                pas: [pas],
              },
              minimum - educateurs.size,
            ),
          );
        }
      }
    }
    return violations;
  },
};
