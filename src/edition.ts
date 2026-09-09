/**
 * Modifier une structure a la main.
 *
 * Un planning importe d'un tableur arrive presque toujours avec de vraies
 * collisions : deux activites au meme moment, un educateur nomme a deux
 * endroits. Ce sont des erreurs de DONNEES, pas de lecture — aucune heuristique
 * ne les resoudra, il faut trancher. Ce module porte les gestes de cet
 * arbitrage, pour que l'interface n'ait qu'a les appeler.
 *
 * Comme `repare`, rien n'est modifie sur place : chaque fonction rend une
 * NOUVELLE structure. L'appelant garde la precedente, ce qui rend l'annulation
 * possible et evite qu'un rendu React parte d'un objet mute sous lui.
 *
 * Ces fonctions maintiennent les invariants que la validation exige, plutot que
 * de laisser l'interface les reconstituer :
 *  - un binome (`affectations`) ne peut nommer que des gens presents sur le
 *    creneau — retirer quelqu'un retire donc ses binomes ;
 *  - supprimer une salle la retire des creneaux qui s'y tenaient ;
 *  - un identifiant de creneau reste unique dans la structure.
 * Sans ca, une modification anodine a l'ecran produirait un fichier invalide
 * juste apres — exactement ce que l'utilisateur venait corriger.
 */

import { idUnique } from './import/identifiants.ts';
import { heureEnMinutes } from './temps.ts';
import type { Affectation, CreneauType, Heure, Jour, Salle, Structure } from './types.ts';

/**
 * Ce qu'on peut changer sur un creneau. Chaque champ absent est laisse tel
 * quel : `{ pas: 3 }` ne touche qu'a la duree.
 */
export interface ChangementCreneau {
  jour?: Jour;
  debut?: Heure;
  /** Duree en nombre de pas. */
  pas?: number;
  activiteId?: string;
  salleId?: string | null;
  jeunes?: string[];
  educateurs?: string[];
  affectations?: Affectation[];
  verrouille?: boolean;
}

function creneauOuLeve(structure: Structure, id: string): CreneauType {
  const creneau = structure.planningType.find((c) => c.id === id);
  if (!creneau) throw new Error(`Creneau inconnu : "${id}"`);
  return creneau;
}

/**
 * Retire les binomes qui nomment quelqu'un qui n'est plus la.
 *
 * C'est la contrepartie invisible d'un geste tres visible : sortir un jeune
 * d'un creneau parce qu'il y etait en double. Son binome doit partir avec lui,
 * sinon le fichier reference un jeune absent du creneau et la validation le
 * refuse — apres une modification qui, a l'ecran, avait l'air d'avoir marche.
 */
function affectationsTenables(
  affectations: readonly Affectation[] | undefined,
  jeunes: readonly string[],
  educateurs: readonly string[],
): Affectation[] | undefined {
  if (!affectations) return undefined;
  const gardees = affectations.filter(
    (a) => jeunes.includes(a.jeuneId) && educateurs.includes(a.educateurId),
  );
  return gardees.length === affectations.length ? [...affectations] : gardees;
}

/** Applique un changement a un creneau. Leve si l'identifiant n'existe pas. */
export function modifieCreneau(
  structure: Structure,
  id: string,
  changement: ChangementCreneau,
): Structure {
  const actuel = creneauOuLeve(structure, id);

  const jeunes = changement.jeunes ? [...new Set(changement.jeunes)] : actuel.jeunes;
  const educateurs = changement.educateurs ? [...new Set(changement.educateurs)] : actuel.educateurs;
  const affectations = affectationsTenables(
    changement.affectations ?? actuel.affectations,
    jeunes,
    educateurs,
  );

  const modifie: CreneauType = {
    ...actuel,
    ...(changement.jour !== undefined ? { jour: changement.jour } : {}),
    ...(changement.debut !== undefined ? { debut: changement.debut } : {}),
    ...(changement.pas !== undefined ? { pas: Math.max(1, Math.round(changement.pas)) } : {}),
    ...(changement.activiteId !== undefined ? { activiteId: changement.activiteId } : {}),
    ...(changement.salleId !== undefined ? { salleId: changement.salleId } : {}),
    ...(changement.verrouille !== undefined ? { verrouille: changement.verrouille } : {}),
    jeunes,
    educateurs,
    ...(affectations ? { affectations } : {}),
  };

  return {
    ...structure,
    planningType: structure.planningType.map((c) => (c.id === id ? modifie : c)),
  };
}

/**
 * Raccourcit un creneau pour qu'il s'arrete a une heure donnee.
 *
 * C'est la correction la plus frequente d'un chevauchement venu d'un import :
 * une activite qui deborde sur la suivante. Exprimee en heure plutot qu'en pas
 * parce que c'est ainsi qu'on la lit dans la grille — « ca doit s'arreter a
 * 13h30 », pas « ca doit faire quatre pas ».
 */
export function termineCreneauA(structure: Structure, id: string, fin: Heure): Structure {
  const creneau = creneauOuLeve(structure, id);
  const duree = heureEnMinutes(fin) - heureEnMinutes(creneau.debut);
  if (duree <= 0) {
    throw new RangeError(`${fin} n'est pas apres le debut du creneau (${creneau.debut})`);
  }
  return modifieCreneau(structure, id, { pas: duree / structure.grille.pasMinutes });
}

/** Retire un jeune ou un educateur d'un creneau, binomes compris. */
export function retireDuCreneau(
  structure: Structure,
  id: string,
  personne: { type: 'jeune' | 'educateur'; id: string },
): Structure {
  const creneau = creneauOuLeve(structure, id);
  return personne.type === 'jeune'
    ? modifieCreneau(structure, id, { jeunes: creneau.jeunes.filter((j) => j !== personne.id) })
    : modifieCreneau(structure, id, {
        educateurs: creneau.educateurs.filter((e) => e !== personne.id),
      });
}

export function supprimeCreneau(structure: Structure, id: string): Structure {
  creneauOuLeve(structure, id);
  return { ...structure, planningType: structure.planningType.filter((c) => c.id !== id) };
}

/**
 * Ajoute un creneau, avec un identifiant lisible et sans collision.
 *
 * Meme forme d'identifiant que l'import (`lundi-13-30-courses`) : un id se lit
 * dans les messages de validation, et deux origines differentes ne doivent pas
 * produire deux conventions.
 */
export function ajouteCreneau(structure: Structure, creneau: Omit<CreneauType, 'id'>): Structure {
  const nomActivite = structure.activites.find((a) => a.id === creneau.activiteId)?.nom ?? 'creneau';
  const id = idUnique(
    `${creneau.jour}-${creneau.debut}-${nomActivite}`,
    new Set(structure.planningType.map((c) => c.id)),
  );
  const affectations = affectationsTenables(creneau.affectations, creneau.jeunes, creneau.educateurs);
  return {
    ...structure,
    planningType: [
      ...structure.planningType,
      { ...creneau, id, ...(affectations ? { affectations } : {}) },
    ],
  };
}

/**
 * Ajoute une salle.
 *
 * Un planning saisi dans un tableur ne nomme presque jamais ses salles : elles
 * se completent ici, et l'axe « par salle » de la grille n'a d'interet qu'une
 * fois qu'elles existent.
 */
export function ajouteSalle(structure: Structure, salle: Omit<Salle, 'id'>): Structure {
  const id = idUnique(salle.nom, new Set(structure.salles.map((s) => s.id)));
  return { ...structure, salles: [...structure.salles, { ...salle, id }] };
}

export function modifieSalle(
  structure: Structure,
  id: string,
  changement: Partial<Omit<Salle, 'id'>>,
): Structure {
  if (!structure.salles.some((s) => s.id === id)) throw new Error(`Salle inconnue : "${id}"`);
  return {
    ...structure,
    salles: structure.salles.map((s) => (s.id === id ? { ...s, ...changement } : s)),
  };
}

/**
 * Supprime une salle, et efface partout ailleurs ce qui la nommait.
 *
 * Une salle est citee a deux endroits en plus de sa propre liste : le creneau
 * qui s'y tient, et les `sallesPossibles` des activites. Laisser l'une ou
 * l'autre derriere soi casse une reference, et la validation refuse alors la
 * structure — a cause d'un geste qui, a l'ecran, n'avait rien d'ambigu.
 */
export function supprimeSalle(structure: Structure, id: string): Structure {
  if (!structure.salles.some((s) => s.id === id)) throw new Error(`Salle inconnue : "${id}"`);
  return {
    ...structure,
    salles: structure.salles.filter((s) => s.id !== id),
    activites: structure.activites.map((a) =>
      a.sallesPossibles?.includes(id)
        ? { ...a, sallesPossibles: a.sallesPossibles.filter((s) => s !== id) }
        : a,
    ),
    planningType: structure.planningType.map((c) => (c.salleId === id ? { ...c, salleId: null } : c)),
  };
}
