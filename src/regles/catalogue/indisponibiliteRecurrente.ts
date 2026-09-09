/**
 * `indisponibilite_recurrente` — creneau hebdomadaire ou l'educateur n'est pas
 * mobilisable (reunion institutionnelle, temps de synthese, mi-temps...).
 *
 * cibles : `educateurs`. params : `jour`, `debut`, `fin`.
 *
 * Le solveur consulte ces regles avant d'affecter qui que ce soit
 * (voir `indisponibilitesRecurrentes` dans src/moteur/disponibilite.ts) ;
 * l'evaluation sert a detecter les violations deja presentes dans le planning type.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { erreur } from '../../validation/resultat.ts';
import { estHeureValide } from '../../temps.ts';
import { JOURS } from '../../types.ts';
import { pasDuCreneau } from '../../planning/planning.ts';
import {
  chemin,
  exigeCibles,
  exigeReferences,
  faitViolation,
  litTexte,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

export const indisponibiliteRecurrente: EvaluateurRegle = {
  type: 'indisponibilite_recurrente',
  dureParDefaut: true,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const problemes = [
      ...exigeCibles(regle, ref, 'educateurs'),
      ...exigeReferences(regle, ref, regle.cibles.educateurs ?? [], 'educateurs', '/cibles/educateurs'),
    ];
    const jour = litTexte(regle, 'jour');
    if (!jour || !JOURS.includes(jour as never)) {
      problemes.push(erreur('regle.params', chemin(regle, ref, '/params/jour'), `jour invalide : "${jour ?? ''}"`));
    }
    for (const cle of ['debut', 'fin'] as const) {
      if (!estHeureValide(litTexte(regle, cle))) {
        problemes.push(
          erreur('regle.params', chemin(regle, ref, `/params/${cle}`), `heure invalide pour "${cle}"`),
        );
      }
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const jour = litTexte(regle, 'jour');
    const debut = litTexte(regle, 'debut');
    const fin = litTexte(regle, 'fin');
    if (jour !== ctx.planning.jour || !estHeureValide(debut) || !estHeureValide(fin)) return [];

    const indisponibles = new Set(ctx.ref.grille.pasDePlage({ debut, fin }));
    const violations: Violation[] = [];

    for (const educateurId of regle.cibles.educateurs ?? []) {
      for (const creneau of ctx.planning.creneauxDeEducateur(educateurId)) {
        const conflits = pasDuCreneau(creneau).filter((p) => indisponibles.has(p));
        if (conflits.length > 0) {
          violations.push(
            faitViolation(
              regle,
              ctx.options,
              `${ctx.ref.libelleEducateur(educateurId)} est indisponible le ${jour} de ${debut} a ${fin}`,
              { creneaux: [creneau.id], educateurs: [educateurId], pas: conflits },
            ),
          );
        }
      }
    }
    return violations;
  },
};
