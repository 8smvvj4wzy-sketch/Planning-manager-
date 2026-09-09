/**
 * Lecture des binomes d'un creneau.
 *
 * Regle de repli, valable partout : quand le creneau ne declare aucun binome
 * pour un jeune, tous les educateurs du creneau comptent comme etant aupres de
 * lui. C'est ce qui permet aux plannings qui ne nomment pas les paires de
 * continuer a fonctionner exactement comme avant, tout en rendant les regles
 * plus precises des que l'information existe.
 */

import type { Creneau } from './planning/planning.ts';
import type { Affectation, CreneauType } from './types.ts';

type PorteurAffectations = Pick<Creneau | CreneauType, 'jeunes' | 'educateurs'> & {
  affectations?: Affectation[];
};

/** Le creneau nomme-t-il au moins un binome ? */
export function declareDesBinomes(creneau: PorteurAffectations): boolean {
  return (creneau.affectations ?? []).length > 0;
}

/** Educateurs explicitement places aupres de ce jeune, sinon tous ceux du creneau. */
export function educateursAupresDe(creneau: PorteurAffectations, jeuneId: string): string[] {
  const nommes = (creneau.affectations ?? [])
    .filter((a) => a.jeuneId === jeuneId)
    .map((a) => a.educateurId);
  return nommes.length > 0 ? nommes : creneau.educateurs;
}

/** Jeunes explicitement confies a cet educateur, sinon tous ceux du creneau. */
export function jeunesEncadresPar(creneau: PorteurAffectations, educateurId: string): string[] {
  const nommes = (creneau.affectations ?? [])
    .filter((a) => a.educateurId === educateurId)
    .map((a) => a.jeuneId);
  if (nommes.length > 0) return nommes;
  // Un educateur qui n'apparait dans aucun binome d'un creneau qui en declare
  // n'est le referent de personne : il est la en appui, pas en accompagnement.
  if (declareDesBinomes(creneau) && creneau.affectations!.some((a) => a.educateurId === educateurId)) {
    return [];
  }
  return creneau.jeunes;
}

/** Jeunes du creneau qui n'ont aucun accompagnant nomme. */
export function jeunesSansReferent(creneau: PorteurAffectations): string[] {
  if (!declareDesBinomes(creneau)) return [];
  const nommes = new Set(creneau.affectations!.map((a) => a.jeuneId));
  return creneau.jeunes.filter((id) => !nommes.has(id));
}

/** Retire tous les binomes touchant l'une de ces personnes. */
export function retireDesBinomes(
  affectations: readonly Affectation[] | undefined,
  jeunesRetires: ReadonlySet<string>,
  educateursRetires: ReadonlySet<string>,
): Affectation[] {
  return (affectations ?? []).filter(
    (a) => !jeunesRetires.has(a.jeuneId) && !educateursRetires.has(a.educateurId),
  );
}
