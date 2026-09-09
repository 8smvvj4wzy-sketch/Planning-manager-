/**
 * Lecture des binomes d'un creneau.
 *
 * Un planning reel ne dit pas seulement « ces jeunes et ces educateurs sont
 * ensemble » : il dit « Habib avec Agathe, Helena avec Sabrina ». Sans cette
 * paire, une regle d'autorisation ne peut verifier que la co-presence dans la
 * salle, et `rotation_educateur` ne sait pas de quel educateur le jeune change.
 *
 * REPLI, valable partout : quand le creneau ne nomme aucun binome pour un
 * jeune, tous les educateurs du creneau comptent comme etant aupres de lui.
 * C'est ce qui laisse fonctionner a l'identique les plannings qui ne nomment
 * pas leurs paires.
 */

import type { Affectation, PorteRegle } from './types.ts';

type PorteurAffectations = {
  jeunes: readonly string[];
  educateurs: readonly string[];
  affectations?: readonly Affectation[];
  /** Presente cote planning resolu ; absente sur un `CreneauType` brut. */
  nominatif?: boolean;
};

/** Le creneau porte-t-il au moins un binome, ici et maintenant ? */
export function declareDesBinomes(creneau: PorteurAffectations): boolean {
  return (creneau.affectations ?? []).length > 0;
}

/**
 * Le creneau releve-t-il de l'accompagnement nomme ?
 *
 * Sur un planning resolu, c'est `nominatif`, qui survit aux absences. Sur un
 * `CreneauType` brut on retombe sur les paires effectivement ecrites, faute de
 * mieux — c'est le cas de la validation, ou rien n'a encore ete retire.
 */
export function estNominatif(creneau: PorteurAffectations): boolean {
  return creneau.nominatif ?? declareDesBinomes(creneau);
}

/** Educateurs explicitement places aupres de ce jeune, sinon tous ceux du creneau. */
export function educateursAupresDe(creneau: PorteurAffectations, jeuneId: string): string[] {
  const nommes = (creneau.affectations ?? [])
    .filter((a) => a.jeuneId === jeuneId)
    .map((a) => a.educateurId);
  return nommes.length > 0 ? nommes : [...creneau.educateurs];
}

/**
 * Point d'entree unique des regles : une seule definition de la portee, pas
 * une par regle. `presence` regarde tout le creneau, `binome` la paire nommee
 * — avec le repli ci-dessus quand elle n'existe pas.
 */
export function educateursSelonPorte(
  creneau: PorteurAffectations,
  jeuneId: string,
  porte: PorteRegle,
): string[] {
  return porte === 'binome' ? educateursAupresDe(creneau, jeuneId) : [...creneau.educateurs];
}

/**
 * L'inverse, pour les regles qui partent de l'educateur (`perimetre_renfort`).
 * Symetrique de `educateursAupresDe` : repli sur tous les jeunes quand le
 * creneau ne nomme aucune paire, ensemble vide quand il en nomme mais qu'aucune
 * ne concerne cet educateur — il est la en appui, il n'accompagne personne.
 */
export function jeunesSelonPorte(
  creneau: PorteurAffectations,
  educateurId: string,
  porte: PorteRegle,
): string[] {
  if (porte === 'presence' || !estNominatif(creneau)) return [...creneau.jeunes];
  return (creneau.affectations ?? [])
    .filter((a) => a.educateurId === educateurId)
    .map((a) => a.jeuneId);
}

/**
 * Jeunes du creneau qui n'ont aucun accompagnant nomme, sur un creneau qui en
 * nomme par ailleurs. C'est a eux que le solveur rattache un remplacant : sans
 * ca la paire perdue a l'absence n'est jamais reformee et les regles en
 * `porte: "binome"` retombent silencieusement sur le repli.
 */
export function jeunesSansReferent(creneau: PorteurAffectations): string[] {
  if (!estNominatif(creneau)) return [];
  const nommes = new Set((creneau.affectations ?? []).map((a) => a.jeuneId));
  return creneau.jeunes.filter((id) => !nommes.has(id));
}

/** Retire tous les binomes touchant l'une de ces personnes. */
export function retireDesBinomes(
  affectations: readonly Affectation[] | undefined,
  jeunesRetires: ReadonlySet<string>,
  educateursRetires: ReadonlySet<string>,
): Affectation[] {
  return (affectations ?? [])
    .filter((a) => !jeunesRetires.has(a.jeuneId) && !educateursRetires.has(a.educateurId))
    .map((a) => ({ ...a }));
}

/** Retire un educateur de tous les binomes d'un creneau. */
export function retireEducateurDesBinomes(
  affectations: readonly Affectation[],
  educateurId: string,
): Affectation[] {
  return affectations.filter((a) => a.educateurId !== educateurId).map((a) => ({ ...a }));
}

/**
 * Rattache un educateur aux jeunes restes sans referent. Ne fait rien sur un
 * creneau qui ne nomme aucune paire : y en ajouter une transformerait un
 * collectif en accompagnement nomme, ce que personne n'a demande.
 */
export function rattacheAuxJeunesSansReferent(
  creneau: PorteurAffectations & { affectations?: Affectation[] },
  educateurId: string,
): Affectation[] {
  const orphelins = jeunesSansReferent(creneau);
  if (orphelins.length === 0) return [...(creneau.affectations ?? [])];
  return [...(creneau.affectations ?? []), ...orphelins.map((jeuneId) => ({ jeuneId, educateurId }))];
}

/** Un educateur en remplace un autre : il reprend ses binomes. */
export function remplaceEducateurDansBinomes(
  affectations: readonly Affectation[],
  sortant: string,
  entrant: string,
): Affectation[] {
  const vues = new Set<string>();
  const resultat: Affectation[] = [];
  for (const a of affectations) {
    const educateurId = a.educateurId === sortant ? entrant : a.educateurId;
    const cle = `${a.jeuneId}\u0000${educateurId}`;
    if (vues.has(cle)) continue; // l'entrant avait deja ce jeune : pas de doublon
    vues.add(cle);
    resultat.push({ jeuneId: a.jeuneId, educateurId });
  }
  return resultat;
}

/** Rendu lisible d'un binome, pour les messages : « Sabrina aupres de H.M. ». */
export function decritRattachement(
  jeunes: readonly string[],
  libelleJeune: (id: string) => string,
): string {
  return jeunes.map(libelleJeune).join(', ');
}
