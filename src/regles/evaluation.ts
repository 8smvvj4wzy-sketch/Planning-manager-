/**
 * Evaluation d'un jeu de regles sur un planning.
 */

import type { Regle } from '../types.ts';
import { estDetacheSur } from '../detachement.ts';
import { pasDuCreneau, type Planning } from '../planning/planning.ts';
import { COUT_REGLE_DURE, type ContexteEvaluation, type Violation } from './base.ts';
import { evaluateurDe } from './registre.ts';

export interface Bilan {
  violations: Violation[];
  /** Somme des couts. Une seule violation dure suffit a rendre le total prohibitif. */
  cout: number;
  /** Vrai si aucune regle dure n'est violee. */
  admissible: boolean;
}

export function reglesActives(regles: readonly Regle[]): Regle[] {
  return regles.filter((r) => r.actif);
}

export function evalue(ctx: ContexteEvaluation, regles?: readonly Regle[]): Bilan {
  const aEvaluer = reglesActives(regles ?? ctx.ref.structure.regles);
  const violations: Violation[] = [];

  for (const regle of aEvaluer) {
    const evaluateur = evaluateurDe(regle.type);
    if (!evaluateur) continue; // type inconnu : signale a la validation, ignore ici
    violations.push(...evaluateur.evalue(regle, ctx));
  }

  const cout = violations.reduce((total, v) => total + v.cout, 0);
  return { violations, cout, admissible: !violations.some((v) => v.dure) };
}

/** N'evalue que les regles dures : chemin chaud du solveur. */
export function evalueDures(ctx: ContexteEvaluation): Violation[] {
  return evalue(ctx, ctx.ref.structure.regles.filter((r) => r.actif && r.dure)).violations;
}

/**
 * Verifie les quotas hebdomadaires (`quota_detachement.maxPasParSemaine`),
 * qui ne sont pas evaluables sur une journee isolee.
 */
export function evalueSemaine(
  ctx: Omit<ContexteEvaluation, 'planning'>,
  planningsParJour: readonly Planning[],
): Violation[] {
  const violations: Violation[] = [];

  for (const regle of reglesActives(ctx.ref.structure.regles)) {
    if (regle.type !== 'quota_detachement') continue;
    const maximum = regle.params?.['maxPasParSemaine'];
    if (typeof maximum !== 'number') continue;

    for (const educateurId of regle.cibles.educateurs ?? []) {
      let total = 0;
      const creneaux: string[] = [];
      for (const planning of planningsParJour) {
        for (const creneau of planning.creneauxDeEducateur(educateurId)) {
          if (!estDetacheSur(ctx.ref, educateurId, creneau)) continue;
          total += pasDuCreneau(creneau).length;
          creneaux.push(creneau.id);
        }
      }
      if (total > maximum) {
        violations.push({
          regleId: regle.id,
          type: regle.type,
          dure: regle.dure,
          cout: regle.dure ? COUT_REGLE_DURE : (regle.poids ?? ctx.options.poidsSoupleParDefaut) * (total - maximum),
          message: `${ctx.ref.libelleEducateur(educateurId)} detache ${total} pas sur la semaine (maximum ${maximum})`,
          creneaux,
          educateurs: [educateurId],
        });
      }
    }
  }
  return violations;
}
