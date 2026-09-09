/**
 * `taux_encadrement` — plafonne le nombre de jeunes par educateur.
 *
 * cibles : `groupes` et/ou `activites`. params : `ratioJeunesParEduc`.
 * Un creneau est concerne si son activite est ciblee, ou si l'un de ses jeunes
 * appartient a un groupe cible.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { erreur } from '../../validation/resultat.ts';
import { jeunesPresentsDu } from '../../encadrement.ts';
import {
  chemin,
  exigeNombre,
  exigeReferences,
  faitViolation,
  litNombre,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

export const tauxEncadrement: EvaluateurRegle = {
  type: 'taux_encadrement',
  dureParDefaut: true,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const problemes = [
      ...exigeNombre(regle, ref, 'ratioJeunesParEduc'),
      ...exigeReferences(regle, ref, regle.cibles.groupes ?? [], 'groupes', '/cibles/groupes'),
      ...exigeReferences(regle, ref, regle.cibles.activites ?? [], 'activites', '/cibles/activites'),
    ];
    if ((regle.cibles.groupes ?? []).length === 0 && (regle.cibles.activites ?? []).length === 0) {
      problemes.push(
        erreur('regle.cibles', chemin(regle, ref, '/cibles'), 'attend au moins un groupe ou une activite'),
      );
    }
    const ratio = litNombre(regle, 'ratioJeunesParEduc');
    if (ratio !== undefined && ratio <= 0) {
      problemes.push(
        erreur('regle.params', chemin(regle, ref, '/params/ratioJeunesParEduc'), 'le ratio doit etre > 0'),
      );
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const ratio = litNombre(regle, 'ratioJeunesParEduc');
    if (!ratio || ratio <= 0) return [];
    const groupes = regle.cibles.groupes ?? [];
    const activites = regle.cibles.activites ?? [];
    const violations: Violation[] = [];

    for (const creneau of ctx.planning.creneaux) {
      const presents = jeunesPresentsDu(ctx.ref, ctx.etat, creneau);
      if (presents.length === 0) continue;
      const concerne =
        activites.includes(creneau.activiteId) ||
        presents.some((id) => groupes.includes(ctx.ref.jeune(id)?.groupeId ?? ''));
      if (!concerne) continue;

      const maximum = creneau.educateurs.length * ratio;
      if (presents.length > maximum) {
        violations.push(
          faitViolation(
            regle,
            ctx.options,
            `${presents.length} jeunes pour ${creneau.educateurs.length} educateur(s) : ratio ${ratio} depasse`,
            { creneaux: [creneau.id], jeunes: presents, educateurs: [...creneau.educateurs] },
            Math.ceil(presents.length - maximum),
          ),
        );
      }
    }
    return violations;
  },
};
