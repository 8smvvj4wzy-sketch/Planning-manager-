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
import { evaluateurDe } from './regles/registre.ts';
import type { TableCible } from './regles/base.ts';
import { heureEnMinutes } from './temps.ts';
import type {
  Activite,
  Affectation,
  Cibles,
  CreneauType,
  DateIso,
  Educateur,
  Heure,
  Groupe,
  Jeune,
  Jour,
  Pause,
  Plage,
  Quinzaine,
  Regle,
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
 * Efface un id partout ou une REGLE le nomme : dans ses `cibles`, et dans ceux
 * de ses params qui portent des ids de cette table.
 *
 * Les params ne se devinent pas : `educateurs_interdits` range sa liste sous
 * `educateurs`, `perimetre_renfort` sous `jeunesAutorises`, `salle_requise`
 * sous `salles`. Nettoyer les cibles sans eux laissait une reference cassee que
 * la validation refuse — trouve en sondant, apres que les descripteurs ont
 * rendu la verification possible.
 *
 * Ces descripteurs (`forme: 'ids'`, `table`) sont justement ce qui dit ou
 * chercher, et c'est la meme source qui construit les formulaires. Ecrire ici
 * une seconde table de correspondance aurait divergé du catalogue au premier
 * type ajoute.
 *
 * Une regle qui se retrouve avec une liste VIDE n'est pas silencieusement
 * effacee : la validation la signale. C'est voulu — supprimer le dernier
 * educateur autorise d'un jeune change ce que la regle veut dire, et c'est a
 * l'etablissement de trancher, pas au code.
 */
function reglesSansReferenceA(regles: readonly Regle[], id: string, table: TableCible): Regle[] {
  return regles.map((regle) => {
    let suite = regle;

    const cibles = regle.cibles[table];
    if (cibles?.includes(id)) {
      suite = { ...suite, cibles: { ...suite.cibles, [table]: cibles.filter((x) => x !== id) } };
    }

    for (const champ of evaluateurDe(regle.type)?.champs ?? []) {
      if (champ.forme !== 'ids' || champ.table !== table) continue;
      const liste = suite.params?.[champ.cle];
      if (!Array.isArray(liste) || !liste.includes(id)) continue;
      suite = {
        ...suite,
        params: { ...suite.params, [champ.cle]: liste.filter((x) => x !== id) },
      };
    }
    return suite;
  });
}

/**
 * Retire une personne de PARTOUT : c'est la seule facon de la supprimer sans
 * laisser une reference cassee derriere soi.
 *
 * Une personne est citee a cinq endroits en plus de sa propre liste — les
 * `jeunes`/`educateurs` d'un creneau, ses `affectations`, les `refEducateurs`
 * d'un groupe, les `cibles` d'une regle et les `params` d'une regle. En oublier
 * un rend la structure invalide juste apres un geste qui, a l'ecran, n'avait
 * rien d'ambigu. Meme lecon que `supprimeSalle`, ou l'oubli des
 * `sallesPossibles` avait ete rattrape par un test et non a la relecture.
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
    regles: reglesSansReferenceA(structure.regles, id, type === 'jeune' ? 'jeunes' : 'educateurs'),
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
  return {
    ...structure,
    activites: structure.activites.filter((a) => a.id !== id),
    regles: reglesSansReferenceA(structure.regles, id, 'activites'),
  };
}

/**
 * Supprime une salle, et efface partout ailleurs ce qui la nommait.
 *
 * Une salle est citee a quatre endroits en plus de sa propre liste : le creneau
 * qui s'y tient, les `sallesPossibles` des activites, les cibles d'une regle et
 * les `salles` d'une regle `salle_requise`. Laisser l'un d'eux derriere soi
 * casse une reference, et la validation refuse alors la structure — a cause
 * d'un geste qui, a l'ecran, n'avait rien d'ambigu.
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
    regles: reglesSansReferenceA(structure.regles, id, 'salles'),
  };
}

// --- regles -----------------------------------------------------------------

/**
 * Ajoute une regle d'un type connu.
 *
 * `dure` et les defauts des params viennent du descripteur du type, pas de
 * l'appelant : c'est le moteur qui sait ce qu'un type attend, et l'interface
 * n'a pas a le redire. Un type inconnu leve — mieux vaut refuser que poser
 * dans la structure une regle que rien n'evaluera jamais.
 */
export function ajouteRegle(
  structure: Structure,
  depart: { type: string; cibles?: Cibles; params?: Record<string, unknown>; commentaire?: string },
): Structure {
  const evaluateur = evaluateurDe(depart.type);
  if (!evaluateur) throw new Error(`Type de regle inconnu : "${depart.type}"`);

  const params: Record<string, unknown> = {};
  for (const champ of evaluateur.champs) {
    if ('defaut' in champ && champ.defaut !== undefined) params[champ.cle] = champ.defaut;
  }
  Object.assign(params, depart.params ?? {});

  const regle: Regle = {
    id: idUnique(depart.type, new Set(structure.regles.map((r) => r.id))),
    type: depart.type,
    dure: evaluateur.dureParDefaut,
    actif: true,
    cibles: depart.cibles ?? {},
    params,
    ...(depart.commentaire ? { commentaire: depart.commentaire } : {}),
  };
  return { ...structure, regles: [...structure.regles, regle] };
}

/**
 * Modifie une regle. Une cle posee explicitement a `undefined` la RETIRE.
 *
 * Ce n'est pas ce que fait un spread : `{ ...regle, poids: undefined }` garde
 * la cle, avec `undefined` pour valeur. `JSON.stringify` la laisserait tomber a
 * l'export, mais la validation en memoire, elle, verrait un `poids` present et
 * non numerique — un fichier refuse juste apres un geste anodin, exactement le
 * genre de piege que ce module existe pour eviter. Passer une regle de souple a
 * dure passe par la.
 */
export function modifieRegle(
  structure: Structure,
  id: string,
  changement: Partial<Omit<Regle, 'id' | 'type'>>,
): Structure {
  if (!structure.regles.some((r) => r.id === id)) throw new Error(`Regle inconnue : "${id}"`);
  return {
    ...structure,
    regles: structure.regles.map((r) => {
      if (r.id !== id) return r;
      const suite: Regle = { ...r };
      for (const [cle, valeur] of Object.entries(changement)) {
        const cible = suite as unknown as Record<string, unknown>;
        if (valeur === undefined) delete cible[cle];
        else cible[cle] = valeur;
      }
      return suite;
    }),
  };
}

/**
 * Change un parametre d'une regle sans toucher aux autres.
 *
 * `undefined` RETIRE la cle plutot que de la poser a `undefined` : un param
 * present et vide n'est pas la meme chose qu'un param absent — `litNombre` et
 * `litTexte` rendraient `undefined` dans les deux cas, mais le fichier ecrit
 * porterait un `null` que le schema refuse.
 */
export function modifieParamRegle(
  structure: Structure,
  id: string,
  cle: string,
  valeur: unknown,
): Structure {
  const regle = structure.regles.find((r) => r.id === id);
  if (!regle) throw new Error(`Regle inconnue : "${id}"`);
  const params = { ...(regle.params ?? {}) };
  if (valeur === undefined) delete params[cle];
  else params[cle] = valeur;
  return modifieRegle(structure, id, { params });
}

/**
 * Une regle ne se supprime pas a moitie : rien d'autre dans la structure ne la
 * nomme. C'est la seule suppression de ce module qui n'a aucune reference a
 * nettoyer — l'inverse exact de `supprimeSalle`.
 */
export function supprimeRegle(structure: Structure, id: string): Structure {
  if (!structure.regles.some((r) => r.id === id)) throw new Error(`Regle inconnue : "${id}"`);
  return { ...structure, regles: structure.regles.filter((r) => r.id !== id) };
}

/* ==================== Groupes ==================== */

export function ajouteGroupe(structure: Structure, groupe: Omit<Groupe, 'id'>): Structure {
  const id = idUnique(groupe.nom, new Set(structure.groupes.map((g) => g.id)));
  return { ...structure, groupes: [...structure.groupes, { ...groupe, id }] };
}

export function modifieGroupe(
  structure: Structure,
  id: string,
  changement: Partial<Omit<Groupe, 'id'>>,
): Structure {
  if (!structure.groupes.some((g) => g.id === id)) throw new Error(`Groupe inconnu : "${id}"`);
  return {
    ...structure,
    groupes: structure.groupes.map((g) => (g.id === id ? { ...g, ...changement } : g)),
  };
}

/**
 * Supprime un groupe, et delie les jeunes qui s'y rattachaient.
 *
 * Un jeune sans groupe reste un jeune : `groupeId` est facultatif, et le moteur
 * s'en passe partout sauf pour les regles qui ciblent des groupes. Le refus
 * qu'on applique aux activites (`supprimeActivite`) n'aurait pas de sens ici —
 * un creneau ne peut pas exister sans activite, un jeune existe tres bien sans
 * groupe.
 */
export function supprimeGroupe(structure: Structure, id: string): Structure {
  if (!structure.groupes.some((g) => g.id === id)) throw new Error(`Groupe inconnu : "${id}"`);
  return {
    ...structure,
    groupes: structure.groupes.filter((g) => g.id !== id),
    jeunes: structure.jeunes.map((j) => {
      if (j.groupeId !== id) return j;
      const { groupeId: _retire, ...reste } = j;
      return reste as Jeune;
    }),
    regles: reglesSansReferenceA(structure.regles, id, 'groupes'),
  };
}

/* ==================== Pauses ==================== */

/**
 * Les pauses de la grille : les temps communs ou le moteur n'affecte personne
 * et ne reclame aucun encadrement (voir `docs/decisions.md` §23).
 *
 * Sans un endroit pour les saisir, ce correctif restait inatteignable pour un
 * planning construit a la main : seul un fichier ecrit a la main pouvait en
 * porter. C'est le sens de ces trois fonctions.
 *
 * `pas` est borne a 1 : une pause de duree nulle ne couvre aucun pas et ne
 * ferait rien, tout en ayant l'air posee.
 */
export function ajoutePause(structure: Structure, pause: Pause): Structure {
  return {
    ...structure,
    grille: {
      ...structure.grille,
      pauses: [...(structure.grille.pauses ?? []), { ...pause, pas: Math.max(1, Math.round(pause.pas)) }],
    },
  };
}

export function modifiePause(structure: Structure, index: number, changement: Partial<Pause>): Structure {
  const pauses = structure.grille.pauses ?? [];
  if (!pauses[index]) throw new Error(`Pause inconnue a l'index ${index}`);
  return {
    ...structure,
    grille: {
      ...structure.grille,
      pauses: pauses.map((p, i) => {
        if (i !== index) return p;
        const suite = { ...p, ...changement };
        return { ...suite, pas: Math.max(1, Math.round(suite.pas)) };
      }),
    },
  };
}

export function supprimePause(structure: Structure, index: number): Structure {
  const pauses = structure.grille.pauses ?? [];
  if (!pauses[index]) throw new Error(`Pause inconnue a l'index ${index}`);
  return {
    ...structure,
    grille: { ...structure.grille, pauses: pauses.filter((_, i) => i !== index) },
  };
}

/**
 * Ancre de l'alternance une semaine sur deux. `null` la retire.
 *
 * Passait jusqu'ici par une reconstruction de `grille` dans l'interface, avec
 * un `delete` deguise en destructuration — un geste de moteur ecrit dans le
 * JSX. Il n'y a aucune regle metier ici, mais il y a un invariant : la cle
 * ABSENTE et la cle a `undefined` ne valent pas la meme chose pour le schema.
 */
export function fixeSemaineAOrigine(structure: Structure, date: DateIso | null): Structure {
  if (date === null) {
    const { semaineAOrigine: _retire, ...grille } = structure.grille;
    return { ...structure, grille };
  }
  return { ...structure, grille: { ...structure.grille, semaineAOrigine: date } };
}
