/**
 * `salle_requise` — impose une salle, ou une salle portant un tag donne.
 *
 * cibles : `activites` et/ou `jeunes`. params : `salles[]` ou `tag`.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { avertissement, erreur } from '../../validation/resultat.ts';
import {
  chemin,
  exigeReferences,
  faitViolation,
  litListe,
  litTexte,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

export const salleRequise: EvaluateurRegle = {
  type: 'salle_requise',
  dureParDefaut: true,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const salles = litListe(regle, 'salles');
    const tag = litTexte(regle, 'tag');
    const problemes = [
      ...exigeReferences(regle, ref, salles, 'salles', '/params/salles'),
      ...exigeReferences(regle, ref, regle.cibles.activites ?? [], 'activites', '/cibles/activites'),
      ...exigeReferences(regle, ref, regle.cibles.jeunes ?? [], 'jeunes', '/cibles/jeunes'),
    ];
    if (salles.length === 0 && !tag) {
      problemes.push(
        erreur('regle.params', chemin(regle, ref, '/params'), 'attend "salles" ou "tag"'),
      );
    }
    if (tag && ref.sallesAvecTag(tag).length === 0) {
      problemes.push(
        avertissement('regle.params', chemin(regle, ref, '/params/tag'), `aucune salle ne porte le tag "${tag}"`),
      );
    }
    if ((regle.cibles.activites ?? []).length === 0 && (regle.cibles.jeunes ?? []).length === 0) {
      problemes.push(
        erreur('regle.cibles', chemin(regle, ref, '/cibles'), 'attend au moins une activite ou un jeune'),
      );
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const salles = litListe(regle, 'salles');
    const tag = litTexte(regle, 'tag');
    const activites = regle.cibles.activites ?? [];
    const jeunes = regle.cibles.jeunes ?? [];
    const acceptees = new Set(salles.length > 0 ? salles : tag ? ctx.ref.sallesAvecTag(tag).map((s) => s.id) : []);
    if (acceptees.size === 0) return [];
    const violations: Violation[] = [];

    for (const creneau of ctx.planning.creneaux) {
      const concerne =
        activites.includes(creneau.activiteId) || creneau.jeunes.some((id) => jeunes.includes(id));
      if (!concerne) continue;
      if (creneau.salleId !== null && acceptees.has(creneau.salleId)) continue;

      violations.push(
        faitViolation(
          regle,
          ctx.options,
          creneau.salleId === null
            ? `creneau sans salle alors que ${tag ? `une salle "${tag}"` : 'une salle precise'} est requise`
            : `salle "${ctx.ref.salle(creneau.salleId)?.nom ?? creneau.salleId}" non conforme (attendu : ${[...acceptees].join(', ')})`,
          { creneaux: [creneau.id], jeunes: [...creneau.jeunes] },
        ),
      );
    }
    return violations;
  },
};
