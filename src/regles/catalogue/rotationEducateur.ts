/**
 * `rotation_educateur` — ce jeune doit changer d'educateur regulierement.
 *
 * params :
 *   - `tousLesPas` : duree maximale d'une sequence continue avec le meme educateur ;
 *   - `fenetre` (optionnel) : sur toute fenetre glissante de N pas de presence,
 *     au moins deux educateurs differents doivent s'etre succede.
 *
 * Souple par defaut : le cout croit avec le depassement.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
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

/** Educateurs presents aupres du jeune, pas par pas. */
function sequence(ctx: ContexteEvaluation, jeuneId: string): (readonly string[] | null)[] {
  return ctx.ref.grille.tousLesPas().map((p) => {
    const creneau = ctx.planning.jeuneOccupeAuPas(jeuneId, p);
    return creneau ? creneau.educateurs : null;
  });
}

export const rotationEducateur: EvaluateurRegle = {
  type: 'rotation_educateur',
  dureParDefaut: false,

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    return [
      ...exigeCibles(regle, ref, 'jeunes'),
      ...exigeNombre(regle, ref, 'tousLesPas'),
      ...exigeReferences(regle, ref, regle.cibles.jeunes ?? [], 'jeunes', '/cibles/jeunes'),
    ];
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const maximum = litNombre(regle, 'tousLesPas') ?? 0;
    const fenetre = litNombre(regle, 'fenetre');
    if (maximum <= 0) return [];
    const violations: Violation[] = [];

    for (const jeuneId of regle.cibles.jeunes ?? []) {
      const suite = sequence(ctx, jeuneId);

      // 1. sequences continues avec le meme educateur
      const compteurs = new Map<string, number>();
      suite.forEach((educateurs, p) => {
        const presents = new Set(educateurs ?? []);
        for (const [id, longueur] of [...compteurs]) {
          if (!presents.has(id)) compteurs.delete(id);
          else compteurs.set(id, longueur + 1);
        }
        for (const id of presents) if (!compteurs.has(id)) compteurs.set(id, 1);

        for (const [id, longueur] of compteurs) {
          if (longueur === maximum + 1) {
            const creneau = ctx.planning.jeuneOccupeAuPas(jeuneId, p);
            violations.push(
              faitViolation(
                regle,
                ctx.options,
                `${ctx.ref.libelleEducateur(id)} reste plus de ${maximum} pas d'affilee avec ${ctx.ref.libelleJeune(jeuneId)} (a partir de ${ctx.ref.grille.heureDePas(p - maximum)})`,
                {
                  creneaux: creneau ? [creneau.id] : [],
                  jeunes: [jeuneId],
                  educateurs: [id],
                  pas: [p],
                },
              ),
            );
          }
        }
      });

      // 2. diversite sur fenetre glissante
      if (fenetre && fenetre > 1) {
        for (let debut = 0; debut + fenetre <= suite.length; debut++) {
          const tranche = suite.slice(debut, debut + fenetre);
          if (tranche.some((e) => e === null)) continue;
          const distincts = new Set(tranche.flatMap((e) => [...(e ?? [])]));
          if (distincts.size < 2) {
            violations.push(
              faitViolation(
                regle,
                ctx.options,
                `aucune rotation pour ${ctx.ref.libelleJeune(jeuneId)} entre ${ctx.ref.grille.heureDePas(debut)} et ${ctx.ref.grille.heureDePas(debut + fenetre)}`,
                { creneaux: [], jeunes: [jeuneId], educateurs: [...distincts], pas: [debut] },
              ),
            );
          }
        }
      }
    }
    return violations;
  },
};
