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
import type {
  Activite,
  Affectation,
  CreneauType,
  Educateur,
  Heure,
  Jeune,
  Jour,
  Plage,
  Quinzaine,
  Salle,
  Semaine,
  Structure,
} from './types.ts';

export interface DepartVierge {
  auteur: string;
  etablissement: string;
  libelle?: string;
  jours: readonly Jour[];
  debut: Heure;
  fin: Heure;
  pasMinutes: number;
}

/**
 * Une structure neuve, sans personne ni activite.
 *
 * Il faut pouvoir commencer un planning SANS tableur : l'application etait un
 * mur pour qui n'avait pas de fichier a importer — pas de structure, donc pas
 * de grille, donc rien a editer.
 *
 * `src/import/assemblage.ts` construit la sienne par ici aussi, avec des bornes
 * volontairement extremes (23:59–00:00) que le premier elargissement ramene aux
 * bornes reelles du fichier. Un seul constructeur, deux usages : une structure
 * vide n'a pas a exister en deux versions qui divergeront.
 */
export function structureVierge(depart: DepartVierge): Structure {
  return {
    meta: {
      version: 1,
      dateModification: new Date().toISOString().slice(0, 10),
      auteur: depart.auteur,
      etablissement: depart.etablissement,
      ...(depart.libelle ? { libelle: depart.libelle } : {}),
    },
    grille: {
      pasMinutes: depart.pasMinutes,
      jours: [...depart.jours],
      debut: depart.debut,
      fin: depart.fin,
      pauses: [],
    },
    salles: [],
    groupes: [],
    jeunes: [],
    educateurs: [],
    activites: [],
    planningType: [],
    regles: [],
  };
}

/**
 * Ce qu'on peut changer sur un creneau. Chaque champ absent est laisse tel
 * quel : `{ pas: 3 }` ne touche qu'a la duree.
 */
export interface ChangementCreneau {
  jour?: Jour;
  /**
   * Alternance une semaine sur deux. `null` la RETIRE — le creneau redevient
   * hebdomadaire. Sans ce sentinel, « toutes les semaines » serait indistinct
   * de « ne touche pas a ce champ ».
   */
  quinzaine?: Quinzaine | null;
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

  if (changement.quinzaine !== undefined) {
    if (changement.quinzaine === null) delete modifie.quinzaine;
    else modifie.quinzaine = changement.quinzaine;
  }

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

/* ==================== Jeunes, educateurs, activites ==================== */

/**
 * Retire une personne de PARTOUT : c'est la seule facon de la supprimer sans
 * laisser une reference cassee derriere soi.
 *
 * Une personne est citee a quatre endroits en plus de sa propre liste — les
 * `jeunes`/`educateurs` d'un creneau, ses `affectations`, les `refEducateurs`
 * d'un groupe, et les `cibles` d'une regle. En oublier un rend la structure
 * invalide juste apres un geste qui, a l'ecran, n'avait rien d'ambigu. Meme
 * lecon que `supprimeSalle`, ou l'oubli des `sallesPossibles` avait ete
 * rattrape par un test et non a la relecture.
 */
function sansLaPersonne(structure: Structure, id: string, type: 'jeune' | 'educateur'): Structure {
  const planningType = structure.planningType.map((creneau) => {
    const jeunes = type === 'jeune' ? creneau.jeunes.filter((x) => x !== id) : creneau.jeunes;
    const educateurs = type === 'educateur' ? creneau.educateurs.filter((x) => x !== id) : creneau.educateurs;
    const affectations = affectationsTenables(creneau.affectations, jeunes, educateurs);
    return { ...creneau, jeunes, educateurs, ...(affectations ? { affectations } : {}) };
  });

  return {
    ...structure,
    planningType,
    groupes:
      type === 'educateur'
        ? structure.groupes.map((g) =>
            g.refEducateurs?.includes(id) ? { ...g, refEducateurs: g.refEducateurs.filter((x) => x !== id) } : g,
          )
        : structure.groupes,
    regles: structure.regles.map((regle) => {
      const cle = type === 'jeune' ? 'jeunes' : 'educateurs';
      const cibles = regle.cibles[cle];
      if (!cibles?.includes(id)) return regle;
      return { ...regle, cibles: { ...regle.cibles, [cle]: cibles.filter((x) => x !== id) } };
    }),
  };
}

/**
 * Presence par defaut d'une personne creee a la main : tous les jours
 * d'accueil, d'un bout a l'autre de la grille.
 *
 * Ce n'est pas un detail de confort. `jeunePresent` et `educateurDisponible`
 * rendent `false` quand le jour est absent de la semaine : un jeune cree avec
 * `presence: {}` etait donc INVISIBLE pour le moteur — aucun encadrement
 * demande, aucun educateur mobilisable — pendant que la grille l'affichait
 * normalement, puisqu'elle lit `planningType` en direct. Rien ne le signalait.
 *
 * Le defaut va donc dans ce sens : un jeune qu'on inscrit dans son IME est la,
 * c'est l'absence qui se declare. Les presences reelles (temps partiel) se
 * saisissent ensuite.
 */
function semaineComplete(structure: Structure): Semaine<Plage> {
  const semaine: Semaine<Plage> = {};
  for (const jour of structure.grille.jours) {
    semaine[jour] = { debut: structure.grille.debut, fin: structure.grille.fin };
  }
  return semaine;
}

export function ajouteJeune(
  structure: Structure,
  jeune: Omit<Jeune, 'id' | 'presence'> & { presence?: Semaine<Plage> },
): Structure {
  const id = idUnique(jeune.initiales, new Set(structure.jeunes.map((j) => j.id)));
  const presence = jeune.presence ?? semaineComplete(structure);
  return { ...structure, jeunes: [...structure.jeunes, { ...jeune, presence, id }] };
}

export function modifieJeune(
  structure: Structure,
  id: string,
  changement: Partial<Omit<Jeune, 'id'>>,
): Structure {
  if (!structure.jeunes.some((j) => j.id === id)) throw new Error(`Jeune inconnu : "${id}"`);
  return {
    ...structure,
    jeunes: structure.jeunes.map((j) => (j.id === id ? { ...j, ...changement } : j)),
  };
}

export function supprimeJeune(structure: Structure, id: string): Structure {
  if (!structure.jeunes.some((j) => j.id === id)) throw new Error(`Jeune inconnu : "${id}"`);
  const nettoyee = sansLaPersonne(structure, id, 'jeune');
  return { ...nettoyee, jeunes: nettoyee.jeunes.filter((j) => j.id !== id) };
}

export function ajouteEducateur(
  structure: Structure,
  educateur: Omit<Educateur, 'id' | 'disponibilites'> & { disponibilites?: Semaine<Plage> },
): Structure {
  const id = idUnique(educateur.nom, new Set(structure.educateurs.map((e) => e.id)));
  const disponibilites = educateur.disponibilites ?? semaineComplete(structure);
  return { ...structure, educateurs: [...structure.educateurs, { ...educateur, disponibilites, id }] };
}

export function modifieEducateur(
  structure: Structure,
  id: string,
  changement: Partial<Omit<Educateur, 'id'>>,
): Structure {
  if (!structure.educateurs.some((e) => e.id === id)) throw new Error(`Educateur inconnu : "${id}"`);
  return {
    ...structure,
    educateurs: structure.educateurs.map((e) => (e.id === id ? { ...e, ...changement } : e)),
  };
}

export function supprimeEducateur(structure: Structure, id: string): Structure {
  if (!structure.educateurs.some((e) => e.id === id)) throw new Error(`Educateur inconnu : "${id}"`);
  const nettoyee = sansLaPersonne(structure, id, 'educateur');
  return { ...nettoyee, educateurs: nettoyee.educateurs.filter((e) => e.id !== id) };
}

export function ajouteActivite(structure: Structure, activite: Omit<Activite, 'id'>): Structure {
  const id = idUnique(activite.nom, new Set(structure.activites.map((a) => a.id)));
  return { ...structure, activites: [...structure.activites, { ...activite, id }] };
}

export function modifieActivite(
  structure: Structure,
  id: string,
  changement: Partial<Omit<Activite, 'id'>>,
): Structure {
  if (!structure.activites.some((a) => a.id === id)) throw new Error(`Activite inconnue : "${id}"`);
  return {
    ...structure,
    activites: structure.activites.map((a) => (a.id === id ? { ...a, ...changement } : a)),
  };
}

/**
 * Supprime une activite — REFUSE tant qu'un creneau s'en sert.
 *
 * Une activite n'est pas une personne : la retirer d'un creneau ne veut rien
 * dire, un creneau sans activite n'existe pas. Les deux issues seraient donc
 * de supprimer les creneaux dans la foulee, ce qui detruirait du travail sans
 * le dire, ou de refuser. On refuse, en disant combien de creneaux sont
 * concernes pour que l'appelant sache quoi faire ensuite.
 */
export function supprimeActivite(structure: Structure, id: string): Structure {
  if (!structure.activites.some((a) => a.id === id)) throw new Error(`Activite inconnue : "${id}"`);
  const utilisee = structure.planningType.filter((c) => c.activiteId === id).length;
  if (utilisee > 0) {
    throw new Error(
      `"${id}" sert encore a ${utilisee} creneau(x) : supprimez-les ou changez leur activite d'abord.`,
    );
  }
  return { ...structure, activites: structure.activites.filter((a) => a.id !== id) };
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
