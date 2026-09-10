/**
 * Combien d'educateurs faut-il sur un creneau ?
 *
 * Ordre de decision :
 *  0. un creneau entierement en pause ne reclame rien — c'est un temps commun ;
 *  1. une regle `binome_jeunes` active qui couvre exactement les jeunes presents ;
 *  2. `activite.educateursRequis` s'il est renseigne ;
 *  3. selon `options.encadrement` :
 *     - `individuel`  : somme des `encadrement` des jeunes presents, arrondie au superieur ;
 *     - `ratioGroupe` : effectif / ratio, le ratio venant d'une regle `taux_encadrement`
 *       ou de `options.ratioParDefaut`.
 */

import type { Creneau } from './planning/planning.ts';
import type { Referentiel } from './referentiel.ts';
import { jeunePresent, type EtatJour } from './moteur/etatJour.ts';
import type { OptionsMoteur } from './moteur/options.ts';
import { pasDuCreneau } from './planning/planning.ts';

/**
 * Le creneau tient-il ENTIEREMENT dans des pauses ?
 *
 * Un creneau a cheval (moitie pause, moitie non) garde son besoin entier :
 * l'encadrement se calcule par creneau, pas par pas, et inventer un besoin
 * partiel serait une regle que personne n'a demandee. La bonne reponse a un
 * creneau a cheval est de le couper — l'editeur le permet.
 */
function entierementEnPause(ref: Referentiel, creneau: Creneau): boolean {
  const pas = pasDuCreneau(creneau);
  return pas.length > 0 && pas.every((p) => ref.grille.estPause(p));
}

/** Jeunes du creneau reellement presents (accueillis ce jour, non absents). */
export function jeunesPresentsDu(ref: Referentiel, etat: EtatJour, creneau: Creneau): string[] {
  const pas = pasDuCreneau(creneau);
  return creneau.jeunes.filter((id) => pas.some((p) => jeunePresent(ref, etat, id, p)));
}

function reglesActives(ref: Referentiel, type: string) {
  return ref.structure.regles.filter((r) => r.actif && r.type === type);
}

/** Surcharge d'effectif issue d'une regle `binome_jeunes`, si elle s'applique. */
function surchargeBinome(ref: Referentiel, jeunes: readonly string[]): number | null {
  if (jeunes.length === 0) return null;
  for (const regle of reglesActives(ref, 'binome_jeunes')) {
    const cibles = regle.cibles.jeunes ?? [];
    const requis = regle.params?.['educateursRequis'];
    if (typeof requis !== 'number' || cibles.length < 2) continue;
    const tousPresents = cibles.every((id) => jeunes.includes(id));
    const rienDAutre = jeunes.every((id) => cibles.includes(id));
    if (tousPresents && rienDAutre) return requis;
  }
  return null;
}

/** Ratio jeunes/educateur applicable au creneau (mode `ratioGroupe`). */
export function ratioApplicable(
  ref: Referentiel,
  creneau: Creneau,
  jeunes: readonly string[],
  options: OptionsMoteur,
): number {
  for (const regle of reglesActives(ref, 'taux_encadrement')) {
    const ratio = regle.params?.['ratioJeunesParEduc'];
    if (typeof ratio !== 'number' || ratio <= 0) continue;
    if ((regle.cibles.activites ?? []).includes(creneau.activiteId)) return ratio;
    const groupes = regle.cibles.groupes ?? [];
    if (groupes.length > 0 && jeunes.some((id) => groupes.includes(ref.jeune(id)?.groupeId ?? ''))) {
      return ratio;
    }
  }
  return options.ratioParDefaut;
}

/** Nombre d'educateurs necessaires sur le creneau, compte tenu des presents. */
export function educateursRequis(
  ref: Referentiel,
  etat: EtatJour,
  creneau: Creneau,
  options: OptionsMoteur,
  jeunesPresents = jeunesPresentsDu(ref, etat, creneau),
): number {
  // Un temps de pause ne reclame aucun encadrement : personne n'y est
  // mobilisable (`calculDisponibilite`), donc en exiger un ferait de chaque
  // repas un manque impossible a combler — strictement pire que de n'avoir
  // rien fait. Les deux moities du correctif vont ensemble.
  if (entierementEnPause(ref, creneau)) return 0;

  if (jeunesPresents.length === 0) return 0;

  const binome = surchargeBinome(ref, jeunesPresents);
  if (binome !== null) return binome;

  const activite = ref.activite(creneau.activiteId);
  if (activite && typeof activite.educateursRequis === 'number') return activite.educateursRequis;

  if (options.encadrement === 'ratioGroupe') {
    const ratio = ratioApplicable(ref, creneau, jeunesPresents, options);
    return Math.max(1, Math.ceil(jeunesPresents.length / ratio));
  }

  const somme = jeunesPresents.reduce((total, id) => total + (ref.jeune(id)?.encadrement ?? 1), 0);
  return Math.max(1, Math.ceil(arrondiStable(somme)));
}

/**
 * 0.33 * 3 vaut 0.99 en flottant : sans ce lissage, un groupe de trois jeunes
 * "un tiers" demanderait 1 educateur ici et 2 ailleurs selon les arrondis.
 */
function arrondiStable(x: number): number {
  return Math.round(x * 1000) / 1000;
}
