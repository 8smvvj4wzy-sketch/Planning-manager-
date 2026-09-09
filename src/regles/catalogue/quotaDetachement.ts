/**
 * `quota_detachement` — plafonne le temps qu'un educateur passe hors de son
 * perimetre de reference.
 *
 * params : `maxPasParJour`, `maxPasParSemaine`.
 * `maxPasParSemaine` ne peut pas s'evaluer sur un planning d'une seule journee :
 * il est verifie par `evalueSemaine` (src/regles/evaluation.ts) sur le planning type.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { avertissement } from '../../validation/resultat.ts';
import { estDetacheSur } from '../../detachement.ts';
import { pasDuCreneau } from '../../planning/planning.ts';
import {
  chemin,
  exigeCibles,
  exigeReferences,
  faitViolation,
  litNombre,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

export const quotaDetachement: EvaluateurRegle = {
  type: 'quota_detachement',
  dureParDefaut: true,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const problemes = [
      ...exigeCibles(regle, ref, 'educateurs'),
      ...exigeReferences(regle, ref, regle.cibles.educateurs ?? [], 'educateurs', '/cibles/educateurs'),
    ];
    if (litNombre(regle, 'maxPasParJour') === undefined && litNombre(regle, 'maxPasParSemaine') === undefined) {
      problemes.push(
        avertissement(
          'regle.params',
          chemin(regle, ref, '/params'),
          'ni "maxPasParJour" ni "maxPasParSemaine" : la regle ne contraint rien',
        ),
      );
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const maximum = litNombre(regle, 'maxPasParJour');
    if (maximum === undefined) return [];
    const violations: Violation[] = [];

    for (const educateurId of regle.cibles.educateurs ?? []) {
      const creneaux = ctx.planning
        .creneauxDeEducateur(educateurId)
        .filter((c) => estDetacheSur(ctx.ref, educateurId, c));
      const pas = creneaux.reduce((total, c) => total + pasDuCreneau(c).length, 0);
      if (pas > maximum) {
        violations.push(
          faitViolation(
            regle,
            ctx.options,
            `${ctx.ref.libelleEducateur(educateurId)} detache ${pas} pas aujourd'hui (maximum ${maximum})`,
            { creneaux: creneaux.map((c) => c.id), educateurs: [educateurId] },
            pas - maximum,
          ),
        );
      }
    }
    return violations;
  },
};
