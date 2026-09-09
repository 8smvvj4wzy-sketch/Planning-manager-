/**
 * `perimetre_renfort` — restreint le champ d'intervention d'un educateur
 * (typiquement un interimaire) a certains jeunes et/ou certaines activites.
 *
 * params : `jeunesAutorises[]`, `activitesAutorisees[]` (au moins l'un des deux).
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { avertissement } from '../../validation/resultat.ts';
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

export const perimetreRenfort: EvaluateurRegle = {
  type: 'perimetre_renfort',
  dureParDefaut: true,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const jeunes = litListe(regle, 'jeunesAutorises');
    const activites = litListe(regle, 'activitesAutorisees');
    const problemes = [
      ...exigeCibles(regle, ref, 'educateurs'),
      ...exigeReferences(regle, ref, regle.cibles.educateurs ?? [], 'educateurs', '/cibles/educateurs'),
      ...exigeReferences(regle, ref, jeunes, 'jeunes', '/params/jeunesAutorises'),
      ...exigeReferences(regle, ref, activites, 'activites', '/params/activitesAutorisees'),
    ];
    if (jeunes.length === 0 && activites.length === 0) {
      problemes.push(
        avertissement(
          'regle.params',
          chemin(regle, ref, '/params'),
          'ni "jeunesAutorises" ni "activitesAutorisees" : la regle ne contraint rien',
        ),
      );
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const jeunesAutorises = litListe(regle, 'jeunesAutorises');
    const activitesAutorisees = litListe(regle, 'activitesAutorisees');
    const violations: Violation[] = [];

    for (const educateurId of regle.cibles.educateurs ?? []) {
      for (const creneau of ctx.planning.creneauxDeEducateur(educateurId)) {
        if (activitesAutorisees.length > 0 && !activitesAutorisees.includes(creneau.activiteId)) {
          violations.push(
            faitViolation(
              regle,
              ctx.options,
              `${ctx.ref.libelleEducateur(educateurId)} n'est pas autorise sur l'activite "${ctx.ref.activite(creneau.activiteId)?.nom ?? creneau.activiteId}"`,
              { creneaux: [creneau.id], educateurs: [educateurId] },
            ),
          );
        }
        if (jeunesAutorises.length > 0) {
          const horsPerimetre = creneau.jeunes.filter((id) => !jeunesAutorises.includes(id));
          if (horsPerimetre.length > 0) {
            violations.push(
              faitViolation(
                regle,
                ctx.options,
                `${ctx.ref.libelleEducateur(educateurId)} n'est pas autorise aupres de ${horsPerimetre
                  .map((id) => ctx.ref.libelleJeune(id))
                  .join(', ')}`,
                { creneaux: [creneau.id], educateurs: [educateurId], jeunes: horsPerimetre },
                horsPerimetre.length,
              ),
            );
          }
        }
      }
    }
    return violations;
  },
};
