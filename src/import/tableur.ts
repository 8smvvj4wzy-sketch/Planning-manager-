/**
 * Lecture d'un planning saisi dans un tableur.
 *
 * Ce module ne fait que DECOUPER et LIRE : il ne fabrique pas de structure.
 * Il rend ce qu'il a compris, avec les noms tels qu'ils sont ecrits, et c'est
 * l'ecran de correspondance qui tranche ensuite qui est jeune et qui est
 * educateur. Un CSV ne dit pas `e1`, il dit un prenom.
 *
 * Forme reconnue, celle d'un planning d'IME reel — plusieurs jours cote a
 * cote, en groupes de colonnes DE LARGEUR INEGALE, partageant une seule
 * colonne d'heures :
 *
 *   |        | Lundi                | Mardi          |
 *   |        | Accueil :            | Protocole :    |
 *   | 9h30   | Habib / Agathe       | Adiyan / Camille|
 *   |        | Helena / Sabrina     |                |
 *   | 10h30  | Mand :               |                |
 *   |        | Valentin / Simon     |                |
 *
 * Proprietes de cette forme qui commandent tout le reste :
 *  - la premiere colonne porte les heures ;
 *  - une ligne, avant la premiere heure, nomme les jours en tete de leurs
 *    groupes de colonnes respectifs — un seul jour est le cas particulier
 *    d'un seul groupe couvrant tout le reste de la ligne ;
 *  - a l'interieur d'un groupe, les colonnes sont des COULOIRS d'activites
 *    simultanees, sans identite fixe : un jeune peut decrocher du collectif
 *    pour une activite a lui, sur une duree qui n'est pas celle des autres ;
 *  - une cellule fusionnee sur plusieurs lignes ressort VIDE a l'export : un
 *    creneau court donc de sa ligne jusqu'a la prochaine cellule non vide de
 *    la meme colonne ;
 *  - une cellule peut nommer PLUSIEURS jeunes et PLUSIEURS educateurs a la
 *    fois (« Helena + Valentin / Camille+Callista ») : le signe `+` separe
 *    des personnes des DEUX cotes du `/`, pas seulement a droite.
 */

import { normaliseNom } from './identifiants.ts';
import { JOURS, type Jour } from '../types.ts';

/* ==================== Encodage ==================== */

/**
 * Decode des octets en texte, UTF-8 d'abord, repli sur windows-1252 si ce
 * n'en est pas — un export Numbers/Excel peut sortir dans l'un ou l'autre
 * selon la version et le systeme, et un fichier windows-1252 lu en UTF-8
 * ressort avec chaque caractere accentue corrompu, en silence.
 *
 * `TextDecoder` est un global standard, present en Node comme dans le
 * navigateur (meme raisonnement que `crypto.subtle` dans
 * src/transport/chiffrement.ts) : pas une API DOM, testable sans rien ouvrir.
 */
export function decodeOctets(octets: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

/* ==================== Decoupage ==================== */

/**
 * Devine le separateur. On compte les occurrences hors guillemets sur les
 * premieres lignes plutot que sur la premiere seule : une ligne de titre
 * fusionnee n'a souvent qu'un separateur, ce qui suffit a faire mentir le
 * comptage.
 */
export function devineSeparateur(texte: string): string {
  const candidats = ['\t', ';', ','];
  const echantillon = texte.slice(0, 20_000);
  let meilleur = ',';
  let record = -1;

  for (const separateur of candidats) {
    let compte = 0;
    let dansGuillemets = false;
    for (let i = 0; i < echantillon.length; i++) {
      const c = echantillon[i];
      if (c === '"') dansGuillemets = !dansGuillemets;
      else if (c === separateur && !dansGuillemets) compte++;
    }
    if (compte > record) {
      record = compte;
      meilleur = separateur;
    }
  }
  return meilleur;
}

/**
 * CSV/TSV vers tableau de cellules.
 *
 * Gere le BOM, les guillemets, les guillemets doubles a l'interieur d'un champ,
 * et surtout les SAUTS DE LIGNE DANS UNE CELLULE — c'est le cas de toutes les
 * cellules de ce planning, qui empilent leurs binomes.
 */
export function decoupeTableau(texte: string, separateur = devineSeparateur(texte)): string[][] {
  const source = texte.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cellule = '';
  let dansGuillemets = false;

  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;

    if (dansGuillemets) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cellule += '"';
          i++;
        } else dansGuillemets = false;
      } else cellule += c;
      continue;
    }

    if (c === '"') dansGuillemets = true;
    else if (c === separateur) {
      ligne.push(cellule);
      cellule = '';
    } else if (c === '\n') {
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = '';
    } else cellule += c;
  }

  ligne.push(cellule);
  lignes.push(ligne);

  // Une derniere ligne vide vient du saut final : elle ne porte rien.
  while (lignes.length > 0 && lignes[lignes.length - 1]!.every((c) => c.trim() === '')) lignes.pop();
  return lignes;
}

/* ==================== Heures ==================== */

const HEURE = /^\s*(\d{1,2})\s*[h:]\s*(\d{2})?\s*$/;

/** « 9h30 », « 9h », « 09:30 » → « 09:30 ». `null` si ce n'est pas une heure. */
export function normaliseHeure(texte: string): string | null {
  const m = HEURE.exec(texte);
  if (!m) return null;
  const heures = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (heures > 23 || minutes > 59) return null;
  return `${String(heures).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Colonne des heures : celle qui en contient le plus, a condition d'en avoir au
 * moins deux. On ne suppose pas que c'est la premiere — un export peut trainer
 * une colonne de numeros de ligne devant.
 */
export function trouveColonneHeures(table: readonly (readonly string[])[]): number {
  let meilleure = -1;
  let record = 1;
  const largeur = Math.max(0, ...table.map((l) => l.length));

  for (let col = 0; col < largeur; col++) {
    const compte = table.reduce(
      (total, ligne) => total + (normaliseHeure(ligne[col] ?? '') !== null ? 1 : 0),
      0,
    );
    if (compte > record) {
      record = compte;
      meilleure = col;
    }
  }
  return meilleure;
}

function pgcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : pgcd(b, a % b);
}

function enMinutes(heure: string): number {
  const [h, m] = heure.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Le pas de la grille : le plus grand qui tombe juste sur toutes les bornes
 * relevees. La specification supposait 30 minutes ; un planning reel descend a
 * 5 des qu'il porte un « 11h15 » et un « 12h10 ».
 */
export function pasDesBornes(bornes: readonly string[]): number {
  if (bornes.length < 2) return 30;
  const origine = enMinutes(bornes[0]!);
  const ecarts = bornes.slice(1).map((b) => enMinutes(b) - origine);
  return Math.max(1, ecarts.reduce((acc, e) => pgcd(acc, e), 0));
}

/* ==================== Jours en tete de colonnes ==================== */

/** Le texte d'un en-tete correspond-il a un jour de la grille ? Accents et casse ignores. */
function jourDeLIntitule(texte: string): Jour | null {
  const cle = normaliseNom(texte);
  return JOURS.find((j) => normaliseNom(j) === cle) ?? null;
}

export interface GroupeJour {
  /** Le texte tel qu'ecrit dans le fichier. */
  brut: string;
  /** `null` si le texte ne correspond a aucun jour connu — jamais devine. */
  jour: Jour | null;
  /** Premiere colonne du groupe, heures exclue. */
  colonneDebut: number;
}

/**
 * Cherche, parmi les lignes qui precedent la premiere heure, celle qui nomme
 * des jours en tete de groupes de colonnes. Un seul groupe trouve = un seul
 * jour couvrant tout le reste de la ligne : c'est le meme chemin de code que
 * plusieurs jours cote a cote, pas un cas particulier a part.
 *
 * Rend un tableau vide si aucune ligne de ce genre n'est trouvee — dans ce
 * cas `litPlanning` traite tout le tableau comme un seul groupe sans jour
 * identifie (`jour: null`), a resoudre par l'ecran de correspondance.
 */
export function trouveGroupesJours(
  table: readonly (readonly string[])[],
  colonneHeures: number,
): GroupeJour[] {
  for (const ligne of table) {
    if (normaliseHeure(ligne[colonneHeures] ?? '') !== null) break; // entre dans les donnees

    // La ligne est retenue des qu'elle nomme AU MOINS UN jour connu — c'est ce
    // qui la distingue d'une ligne de titre ou de commentaire ordinaire.
    // Une fois retenue, TOUTES ses cellules non vides deviennent des groupes,
    // reconnues ou non : un en-tete non reconnu marque quand meme le debut
    // d'un vrai groupe de colonnes. Le passer sous silence l'aurait fait
    // absorber par le groupe precedent au lieu d'etre signale.
    const candidats: GroupeJour[] = [];
    let connus = 0;
    ligne.forEach((cellule, col) => {
      if (col === colonneHeures) return;
      const texte = cellule.trim();
      if (texte === '') return;
      const jour = jourDeLIntitule(texte);
      if (jour !== null) connus++;
      candidats.push({ brut: texte, jour, colonneDebut: col });
    });

    if (connus > 0) return candidats;
  }
  return [];
}

/**
 * Le jour du groupe couvrant cette colonne, ou `null` si aucun groupe ne la
 * couvre. Exportee : `assemble()` (src/import/assemblage.ts) en a besoin pour
 * retrouver le texte brut d'un groupe non resolu a partir d'un creneau.
 */
export function groupePourColonne(groupes: readonly GroupeJour[], col: number): GroupeJour | null {
  let courant: GroupeJour | null = null;
  for (const g of groupes) {
    if (g.colonneDebut <= col) courant = g;
    else break;
  }
  return courant;
}

/* ==================== Contenu d'une cellule ==================== */

export interface BinomeLu {
  /** Un creneau peut grouper plusieurs jeunes : « Helena + Valentin / Camille ». */
  jeunes: string[];
  /** Un jeune peut avoir plusieurs accompagnants : « Valentin / Angie + Simon ». */
  educateurs: string[];
}

export interface CelluleLue {
  /** Ce qui precede les deux-points, ou la cellule entiere si elle n'en a pas. */
  activite: string;
  binomes: BinomeLu[];
  /** Lignes qu'on n'a pas su lire comme un binome : « Angie (pas dispo) ». */
  restes: string[];
}

function nettoie(texte: string): string {
  return texte.replace(/\s+/g, ' ').trim();
}

/** Scinde un cote de binome sur `+`, nettoie chaque nom, retire les vides. */
function scindePersonnes(texte: string): string[] {
  return texte
    .split('+')
    .map(nettoie)
    .filter((n) => n !== '');
}

/**
 * « Mand :\nValentin / Simon\nHabib / Agathe » →
 *   activite « Mand », binomes [Valentin/Simon, Habib/Agathe].
 *
 * « Helena + Valentin + Ilian / Camille+Callista » → un seul binome,
 *   jeunes [Helena, Valentin, Ilian], educateurs [Camille, Callista] : le
 *   groupe entier est accompagne par l'ensemble des educateurs listes,
 *   pas apparie un a un.
 *
 * L'ordre `Jeune(s) / Educateur(s)` est celui du planning d'origine ; il est
 * pose ici et l'ecran de correspondance permet de le corriger si un fichier
 * fait l'inverse.
 */
export function analyseCellule(brut: string): CelluleLue | null {
  const lignes = brut
    .split('\n')
    .map(nettoie)
    .filter((l) => l !== '');
  if (lignes.length === 0) return null;

  let activite = '';
  const binomes: BinomeLu[] = [];
  const restes: string[] = [];

  lignes.forEach((ligne, index) => {
    let contenu = ligne;

    // Les deux-points de la premiere ligne portent le nom de l'activite. La
    // suite de cette meme ligne peut deja etre un binome : « Protocole :
    // Adiyan / Camille » tient sur une seule ligne.
    if (index === 0) {
      const coupe = ligne.indexOf(':');
      if (coupe >= 0) {
        activite = nettoie(ligne.slice(0, coupe));
        contenu = nettoie(ligne.slice(coupe + 1));
      } else {
        activite = ligne;
        contenu = '';
      }
    }

    if (contenu === '') return;

    const parts = contenu.split('/');
    if (parts.length < 2) {
      restes.push(contenu);
      return;
    }

    const jeunes = scindePersonnes(parts[0]!);
    const educateurs = scindePersonnes(parts.slice(1).join('/'));

    if (jeunes.length === 0 || educateurs.length === 0) restes.push(contenu);
    else binomes.push({ jeunes, educateurs });
  });

  return { activite, binomes, restes };
}

/* ==================== Lecture d'un tableau entier ==================== */

export interface CreneauLu {
  /** Index de colonne dans le tableau d'origine — un couloir, sans autre sens. */
  couloir: number;
  /** Jour du groupe de colonnes auquel appartient ce couloir. */
  jour: Jour | null;
  debut: string;
  /** Heure de fin, deduite de la prochaine cellule non vide du meme couloir. */
  fin: string;
  /**
   * `true` quand `fin` n'a pas ete trouvee dans le fichier — ce couloir ne
   * comporte plus aucune cellule non vide apres celle-ci. Un CSV ne distingue
   * pas « fusionne jusqu'ici puis vraiment vide » de « fusionne plus loin » :
   * la fusion d'origine ne survit pas a l'export. Dans ce cas `fin` est repliee
   * sur la PROCHAINE borne de la grille, pas sur la fermeture de la journee —
   * un repli minimal plutot que maximal. Fermer sur la fin de journee a
   * produit, sur un fichier reel, des creneaux de 15 minutes gonfles a 5
   * heures, qui chevauchaient mecaniquement toutes les activites suivantes du
   * meme jeune dans d'autres couloirs (des centaines de `creneau.chevauchement`
   * sans rapport apparent avec la cause). Peut arriver a n'importe quel
   * couloir, pas seulement a celui de la toute derniere ligne.
   */
  finDeduite: boolean;
  activite: string;
  binomes: BinomeLu[];
  restes: string[];
}

export interface PlanningLu {
  /** Bornes horaires relevees, dans l'ordre. */
  bornes: string[];
  pasMinutes: number;
  debut: string;
  fin: string;
  creneaux: CreneauLu[];
  /**
   * Groupes de colonnes detectes, dans l'ordre. Vide si aucune ligne de jours
   * n'a ete trouvee — tout le tableau forme alors un seul groupe implicite
   * sans jour resolu, visible via `creneaux[].jour === null`.
   */
  jours: GroupeJour[];
  /** Ce que la lecture a du supposer, et qui merite d'etre relu. */
  remarques: string[];
}

/**
 * Lit un tableau decoupe.
 *
 * La duree du dernier creneau de chaque couloir n'est pas dans le fichier : la
 * derniere ligne n'a pas de ligne suivante pour la borner. On la clot a la fin
 * de la journee, et on le dit dans `remarques` plutot que de le taire.
 */
export function litPlanning(table: readonly (readonly string[])[]): PlanningLu {
  const remarques: string[] = [];
  const colonneHeures = trouveColonneHeures(table);
  if (colonneHeures < 0) {
    throw new Error(
      "Aucune colonne d'heures trouvee : le tableau doit en porter une (« 9h30 », « 10h », « 09:30 »).",
    );
  }

  // Les lignes qui portent une heure, et leur position dans le tableau.
  const rangees: { ligne: number; heure: string }[] = [];
  table.forEach((ligne, i) => {
    const heure = normaliseHeure(ligne[colonneHeures] ?? '');
    if (heure !== null) rangees.push({ ligne: i, heure });
  });

  if (rangees.length < 2) {
    throw new Error('Il faut au moins deux bornes horaires pour deduire une grille.');
  }

  const bornes = rangees.map((r) => r.heure);
  const pasMinutes = pasDesBornes(bornes);
  const debut = bornes[0]!;

  // La derniere borne clot la journee : rien ne dit ce qui se passe apres.
  const fin = bornes[bornes.length - 1]!;
  if (pasMinutes !== 30) {
    remarques.push(
      `Pas de grille deduit : ${pasMinutes} minutes (et non 30). Toute regle exprimee en pas ` +
        "change d'echelle avec lui.",
    );
  }

  let jours = trouveGroupesJours(table, colonneHeures);
  if (jours.length === 0) {
    // Aucune ligne de jours trouvee : tout le tableau forme UN SEUL groupe
    // implicite, non resolu (`brut: ''`, une cle stable et sans collision
    // possible — un groupe reellement detecte a toujours un texte non vide).
    // C'est le meme mecanisme de resolution que pour un en-tete illisible :
    // l'ecran de correspondance demande un jour, jamais une supposition.
    jours = [{ brut: '', jour: null, colonneDebut: 0 }];
    remarques.push(
      'Aucune ligne de jours reconnue avant les heures : un seul jour est a choisir pour tout le tableau.',
    );
  } else if (jours.some((g) => g.jour === null)) {
    const inconnus = jours.filter((g) => g.jour === null).map((g) => `« ${g.brut} »`);
    remarques.push(`En-tete(s) non reconnu(s) comme un jour de la grille : ${inconnus.join(', ')}.`);
  }

  const largeur = Math.max(0, ...table.map((l) => l.length));
  const creneaux: CreneauLu[] = [];

  for (let col = 0; col < largeur; col++) {
    if (col === colonneHeures) continue;
    const jourDuCouloir = groupePourColonne(jours, col)?.jour ?? null;

    for (let r = 0; r < rangees.length; r++) {
      const brut = table[rangees[r]!.ligne]?.[col] ?? '';
      const cellule = analyseCellule(brut);
      if (!cellule) continue;

      // Cellule fusionnee : elle court jusqu'a la prochaine rangee dont la
      // cellule de ce couloir est non vide. Si ce couloir ne comporte plus
      // rien ensuite (`finDeduite`), le repli est la PROCHAINE borne de la
      // grille — le minimum plausible, pas la fermeture de journee (le
      // maximum) : voir le commentaire de `CreneauLu.finDeduite`.
      let suivante = r + 1;
      while (suivante < rangees.length && (table[rangees[suivante]!.ligne]?.[col] ?? '').trim() === '') {
        suivante++;
      }
      const finTrouvee = suivante < rangees.length;

      creneaux.push({
        couloir: col,
        jour: jourDuCouloir,
        debut: rangees[r]!.heure,
        fin: finTrouvee ? rangees[suivante]!.heure : (rangees[r + 1]?.heure ?? fin),
        finDeduite: !finTrouvee,
        activite: cellule.activite,
        binomes: cellule.binomes,
        restes: cellule.restes,
      });
    }
  }

  // Un creneau qui commence et finit a la meme heure ne dure rien : il vient
  // d'une cellule posee sur la derniere ligne du tableau.
  const vides = creneaux.filter((c) => c.debut === c.fin);
  if (vides.length > 0) {
    remarques.push(
      `${vides.length} cellule(s) sur la derniere ligne n'ont pas de duree : elles sont ignorees.`,
    );
  }

  // Un couloir qui ne comporte plus rien apres une cellule voit sa duree
  // repliee sur la PROCHAINE borne de la grille — un CSV ne distingue pas ca
  // d'une vraie fusion plus longue. Ca peut arriver a n'importe quel couloir,
  // pas seulement a la derniere ligne : compte precis plutot qu'une phrase
  // generique qui laisserait croire que seule la toute derniere cellule est
  // concernee.
  const dureeIncertaine = creneaux.filter((c) => c.finDeduite && c.debut !== c.fin);
  if (dureeIncertaine.length > 0) {
    remarques.push(
      `${dureeIncertaine.length} creneau(x) sont replies sur le prochain creneau de la grille ` +
        "faute de cellule suivante dans leur couloir : leur duree reelle est peut-etre plus longue, " +
        'a verifier.',
    );
  }

  return {
    bornes,
    pasMinutes,
    debut,
    fin,
    creneaux: creneaux.filter((c) => c.debut !== c.fin),
    jours,
    remarques,
  };
}

/** Tous les noms rencontres, dans l'ordre d'apparition, sans doublon. */
export function nomsRencontres(planning: PlanningLu): { jeunes: string[]; educateurs: string[] } {
  const jeunes: string[] = [];
  const educateurs: string[] = [];
  for (const creneau of planning.creneaux) {
    for (const binome of creneau.binomes) {
      for (const j of binome.jeunes) if (!jeunes.includes(j)) jeunes.push(j);
      for (const e of binome.educateurs) if (!educateurs.includes(e)) educateurs.push(e);
    }
  }
  return { jeunes, educateurs };
}
