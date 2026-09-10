/**
 * Vues derivees du planning. Elles ne stockent rien : ce sont des lectures.
 *
 * « La vue "salles libres" n'est pas un module a part : c'est la grille des
 *   salles moins les salles occupees a chaque pas. »
 */

import { educateursAupresDe, jeunesSelonPorte } from './affectations.ts';
import type { Creneau, Planning } from './planning/planning.ts';
import type { Referentiel } from './referentiel.ts';
import { jeunePresent, type EtatJour } from './moteur/etatJour.ts';

export interface CaseSalle {
  pas: number;
  heure: string;
  /** Ids des salles libres a ce pas. */
  libres: string[];
  /** Id de creneau occupant, par salle. */
  occupees: Record<string, string>;
}

export function sallesLibres(ref: Referentiel, planning: Planning): CaseSalle[] {
  return ref.grille.tousLesPas().map((pas) => {
    const occupees: Record<string, string> = {};
    for (const creneau of planning.creneauxAuPas(pas)) {
      if (creneau.salleId) occupees[creneau.salleId] = creneau.id;
    }
    return {
      pas,
      heure: ref.grille.heureDePas(pas),
      libres: ref.structure.salles.map((s) => s.id).filter((id) => !(id in occupees)),
      occupees,
    };
  });
}

export interface CaseEducateur {
  pas: number;
  heure: string;
  /** Educateurs mobilisables et non affectes. */
  libres: string[];
  /** Id de creneau, par educateur affecte. */
  affectes: Record<string, string>;
}

export function educateursLibres(
  ref: Referentiel,
  planning: Planning,
  mobilisable: (educateurId: string, pas: number) => boolean,
): CaseEducateur[] {
  return ref.grille.tousLesPas().map((pas) => {
    const affectes: Record<string, string> = {};
    for (const creneau of planning.creneauxAuPas(pas)) {
      for (const id of creneau.educateurs) affectes[id] = creneau.id;
    }
    return {
      pas,
      heure: ref.grille.heureDePas(pas),
      libres: ref.structure.educateurs
        .map((e) => e.id)
        .filter((id) => !(id in affectes) && mobilisable(id, pas)),
      affectes,
    };
  });
}

/**
 * Range les creneaux d'une journee en COULOIRS d'activites simultanees.
 *
 * C'est la forme d'un planning d'IME tel qu'il s'ecrit vraiment : le temps a
 * gauche, et en face les activites cote a cote — l'accueil collectif, le
 * protocole d'un jeune, l'educateur detache. Un couloir n'est pas une
 * ressource (ni salle, ni personne) : c'est juste une colonne libre. Deux
 * activites qui ne se recouvrent pas partagent donc le meme couloir, et le
 * planning tient en trois ou quatre colonnes au lieu d'une par personne.
 *
 * Rangement d'intervalles : creneaux tries par debut puis par id, chacun prend
 * le PREMIER couloir dont le dernier occupant s'est termine. Deterministe — a
 * planning egal, meme disposition d'un rendu a l'autre.
 */
export interface Couloirs {
  /** Index de couloir, par id de creneau. */
  parCreneau: Map<string, number>;
  /** Nombre de couloirs necessaires : la largeur de la grille. */
  nombre: number;
}

export function couloirsDuJour(planning: Planning): Couloirs {
  const parCreneau = new Map<string, number>();
  /** Fin (exclue) du dernier creneau de chaque couloir. */
  const fins: number[] = [];

  const ordonnes = [...planning.creneaux].sort(
    (a, b) => a.pasDebut - b.pasDebut || a.id.localeCompare(b.id),
  );

  for (const creneau of ordonnes) {
    let couloir = fins.findIndex((fin) => fin <= creneau.pasDebut);
    if (couloir < 0) couloir = fins.length;
    fins[couloir] = creneau.pasDebut + creneau.pas;
    parCreneau.set(creneau.id, couloir);
  }

  return { parCreneau, nombre: fins.length };
}

/**
 * Les pas ou quelque chose commence ou finit, dans l'ordre.
 *
 * Ce sont les seules heures qui meritent une etiquette sur l'axe. Les etiqueter
 * tous ferait 78 lignes pour une journee au pas de 5 minutes, la ou le document
 * d'origine en porte treize.
 */
export function bornesDuJour(planning: Planning): number[] {
  const bornes = new Set<number>();
  for (const creneau of planning.creneaux) {
    bornes.add(creneau.pasDebut);
    bornes.add(creneau.pasDebut + creneau.pas);
  }
  return [...bornes].sort((a, b) => a - b);
}

/** Une ligne de la journee d'une personne : une occupation, ou un trou. */
export type LigneJournee =
  | {
      type: 'creneau';
      creneau: Creneau;
      /** Qui est en face : les educateurs d'un jeune, les jeunes d'un educateur. */
      enFace: string[];
    }
  | { type: 'trou'; pasDebut: number; pas: number };

/**
 * La journee d'UNE personne, en lignes chronologiques.
 *
 * « Le planning d'un jeune avec les differents educateurs qu'il va avoir, et
 * inversement pour les educateurs » : une seule fonction pour les deux sens,
 * le sujet et le vis-a-vis s'echangent. Le vis-a-vis vient de
 * `src/affectations.ts`, repli compris — sans binome nomme, tous les educateurs
 * du creneau comptent comme etant aupres du jeune.
 *
 * Les trous ne sont rendus qu'ENTRE deux creneaux. Avant le premier et apres le
 * dernier, la personne n'est pas encore la ou n'est plus la : ce n'est pas un
 * trou dans sa journee, c'est le bord de la journee.
 */
export function journeeDe(
  planning: Planning,
  cible: { type: 'jeune' | 'educateur'; id: string },
): LigneJournee[] {
  const creneaux =
    cible.type === 'jeune' ? planning.journeeDuJeune(cible.id) : planning.journeeDeEducateur(cible.id);

  const lignes: LigneJournee[] = [];
  let finPrecedente: number | null = null;

  for (const creneau of creneaux) {
    if (finPrecedente !== null && creneau.pasDebut > finPrecedente) {
      lignes.push({ type: 'trou', pasDebut: finPrecedente, pas: creneau.pasDebut - finPrecedente });
    }
    lignes.push({
      type: 'creneau',
      creneau,
      enFace:
        cible.type === 'jeune'
          ? educateursAupresDe(creneau, cible.id)
          : jeunesSelonPorte(creneau, cible.id, 'binome'),
    });
    // Un chevauchement ferait reculer la fin : on garde la plus tardive, sinon
    // le creneau suivant inventerait un trou negatif.
    finPrecedente = Math.max(finPrecedente ?? 0, creneau.pasDebut + creneau.pas);
  }

  return lignes;
}

/**
 * Regroupe des pas isoles en plages continues.
 *
 * Le moteur raisonne pas par pas — c'est le seul moyen de comparer des
 * creneaux qui ne s'alignent pas. Mais personne ne lit « 11:15, 11:20, 11:25,
 * 11:30... » : au pas de 5 minutes, deux heures de creux font vingt-quatre
 * entrees pour une seule information. Meme lecon que le regroupement des
 * chevauchements.
 */
export function plagesDePas(pas: readonly number[]): { debut: number; fin: number }[] {
  const ordonnes = [...new Set(pas)].sort((a, b) => a - b);
  const plages: { debut: number; fin: number }[] = [];

  for (const p of ordonnes) {
    const derniere = plages[plages.length - 1];
    if (derniere && derniere.fin === p) derniere.fin = p + 1;
    else plages.push({ debut: p, fin: p + 1 });
  }
  return plages;
}

/** Jeunes presents mais affectes a aucun creneau : les oublies du planning. */
export function jeunesSansAffectation(
  ref: Referentiel,
  planning: Planning,
  etat: EtatJour,
): { jeuneId: string; pas: number[] }[] {
  const resultat: { jeuneId: string; pas: number[] }[] = [];

  for (const jeune of ref.structure.jeunes) {
    if (!jeune.actif) continue;
    const trous = ref.grille
      .tousLesPas()
      .filter(
        (p) =>
          !ref.grille.estPause(p) &&
          jeunePresent(ref, etat, jeune.id, p) &&
          !planning.jeuneOccupeAuPas(jeune.id, p),
      );
    if (trous.length > 0) resultat.push({ jeuneId: jeune.id, pas: trous });
  }
  return resultat;
}
