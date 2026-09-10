/**
 * Construction du planning d'une journee a partir du planning type,
 * des absences et des retouches manuelles du jour.
 */

import { retireDesBinomes } from '../affectations.ts';
import { quinzaineDeLaDate } from '../dates.ts';
import { jeunePresent, type EtatJour } from '../moteur/etatJour.ts';
import type { Referentiel } from '../referentiel.ts';
import type { CreneauType, Jour, Quinzaine } from '../types.ts';
import { Planning, type Creneau, type OrigineCreneau } from './planning.ts';

function versCreneau(
  ref: Referentiel,
  modele: CreneauType,
  origine: OrigineCreneau,
  epingle: boolean,
): Creneau {
  return {
    id: modele.id,
    origineId: origine === 'planning-type' ? modele.id : null,
    origine,
    jour: modele.jour,
    pasDebut: ref.grille.pasDeHeure(modele.debut),
    pas: modele.pas,
    activiteId: modele.activiteId,
    salleId: modele.salleId ?? null,
    jeunes: [...modele.jeunes],
    educateurs: [...modele.educateurs],
    affectations: (modele.affectations ?? []).map((a) => ({ ...a })),
    nominatif: (modele.affectations ?? []).length > 0,
    verrouille: modele.verrouille,
    epingle,
  };
}

/**
 * Quelle semaine de l'alternance tombe ce jour-la.
 *
 * `null` quand la question ne se pose pas — pas de date, ou pas d'ancre posee
 * dans la grille. Dans ce dernier cas les creneaux des deux semaines ressortent
 * ensemble : la validation le signale (`grille.alternance`) plutot que de
 * choisir une semaine au hasard.
 */
export function quinzaineDuJour(ref: Referentiel, etat: EtatJour): Quinzaine | undefined {
  const origine = ref.structure.grille.semaineAOrigine;
  if (!etat.date || !origine) return undefined;
  return quinzaineDeLaDate(origine, etat.date);
}

/**
 * Planning type d'un jour, sans aucune prise en compte des absences.
 *
 * `quinzaine` filtre l'alternance une semaine sur deux ; l'omettre rend TOUT,
 * semaine A et semaine B confondues — ce qui n'est un planning reel d'aucune
 * semaine, mais reste la bonne reponse quand personne n'a precise laquelle.
 */
export function planningTypeDuJour(ref: Referentiel, jour: Jour, quinzaine?: Quinzaine): Planning {
  return new Planning(
    jour,
    ref.creneauxTypeDuJour(jour, quinzaine).map((c) => versCreneau(ref, c, 'planning-type', false)),
  );
}

/**
 * Planning de depart du solveur : le planning type du jour, ampute des personnes
 * effectivement absentes, complete des affectations manuelles.
 *
 * Retirer un absent n'est pas une "modification" imputable au moteur : c'est le
 * point de depart. Le cout des changements se mesure par rapport a ce planning-ci.
 */
export function planningInitial(ref: Referentiel, etat: EtatJour): Planning {
  const planning = planningTypeDuJour(ref, etat.jour, quinzaineDuJour(ref, etat));

  for (const creneau of planning.creneaux) {
    const pas = Array.from({ length: creneau.pas }, (_, i) => creneau.pasDebut + i);
    creneau.epingle = etat.epingles.has(creneau.id);

    const jeunesRetires = new Set(
      creneau.jeunes.filter((id) => !pas.some((p) => jeunePresent(ref, etat, id, p))),
    );
    // Un educateur absent, meme partiellement, est retire du creneau : il ne peut
    // pas en assurer la totalite. Le solveur cherchera un remplacant.
    const educateursRetires = new Set(
      creneau.educateurs.filter((id) => pas.some((p) => etat.absencesEducateurs.get(id)?.has(p) ?? false)),
    );

    creneau.jeunes = creneau.jeunes.filter((id) => !jeunesRetires.has(id));
    creneau.educateurs = creneau.educateurs.filter((id) => !educateursRetires.has(id));
    // Les binomes suivent : un binome dont l'un des deux est absent n'existe
    // plus, et le laisser ferait croire au moteur que le jeune a un referent.
    creneau.affectations = retireDesBinomes(creneau.affectations, jeunesRetires, educateursRetires);
  }
  planning.invalide();
  return planning;
}

/** Applique les affectations manuelles de `jour.json` par-dessus un planning. */
export function appliqueAffectationsManuelles(
  ref: Referentiel,
  planning: Planning,
  affectations: readonly CreneauType[],
): void {
  for (const modele of affectations) {
    const existant = planning.creneau(modele.id);
    const nouveau = versCreneau(ref, modele, 'manuel', true);
    if (existant) planning.supprime(modele.id);
    planning.ajoute(nouveau);
  }
  planning.invalide();
}
