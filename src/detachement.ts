/**
 * Detachement : un educateur intervient hors de son perimetre de reference.
 *
 * Il est "detache" sur un creneau si aucun des jeunes presents n'appartient a un
 * groupe dont il est educateur de reference. C'est ce compte que plafonne la
 * regle `quota_detachement`, et c'est lui qui declenche le surcout de
 * mobilisation du solveur (voir OptionsMoteur.detachement).
 */

import type { Creneau } from './planning/planning.ts';
import type { Referentiel } from './referentiel.ts';

/** Groupes dont l'educateur est reference. */
export function groupesDeReference(ref: Referentiel, educateurId: string): Set<string> {
  const groupes = new Set<string>();
  for (const g of ref.structure.groupes) {
    if ((g.refEducateurs ?? []).includes(educateurId)) groupes.add(g.id);
  }
  return groupes;
}

/** L'educateur est-il detache sur ce creneau ? */
export function estDetacheSur(ref: Referentiel, educateurId: string, creneau: Creneau): boolean {
  const references = groupesDeReference(ref, educateurId);
  if (references.size === 0) return false; // sans groupe de reference, pas de detachement
  if (creneau.jeunes.length === 0) return false;
  return !creneau.jeunes.some((id) => {
    const groupe = ref.jeune(id)?.groupeId;
    return groupe !== undefined && references.has(groupe);
  });
}
