/**
 * Vues derivees du planning. Elles ne stockent rien : ce sont des lectures.
 *
 * « La vue "salles libres" n'est pas un module a part : c'est la grille des
 *   salles moins les salles occupees a chaque pas. »
 */

import type { Planning } from './planning/planning.ts';
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
