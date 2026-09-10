/**
 * Disponibilite effective d'un educateur : disponibilites hebdomadaires,
 * moins les absences du jour, moins les indisponibilites recurrentes,
 * moins ce qu'il fait deja ailleurs dans le planning.
 */

import type { Planning } from '../planning/planning.ts';
import type { Referentiel } from '../referentiel.ts';
import { estHeureValide } from '../temps.ts';
import type { Jour } from '../types.ts';
import { educateurDisponible, type EtatJour } from './etatJour.ts';

/** Pas ou chaque educateur est bloque par une regle `indisponibilite_recurrente`. */
export function indisponibilitesRecurrentes(ref: Referentiel, jour: Jour): Map<string, Set<number>> {
  const parEducateur = new Map<string, Set<number>>();

  for (const regle of ref.structure.regles) {
    if (!regle.actif || regle.type !== 'indisponibilite_recurrente') continue;
    const params = regle.params ?? {};
    if (params['jour'] !== jour) continue;
    const debut = params['debut'];
    const fin = params['fin'];
    if (!estHeureValide(debut) || !estHeureValide(fin)) continue;

    const pas = ref.grille.pasDePlage({ debut, fin });
    for (const educateurId of regle.cibles.educateurs ?? []) {
      const existant = parEducateur.get(educateurId) ?? new Set<number>();
      for (const p of pas) existant.add(p);
      parEducateur.set(educateurId, existant);
    }
  }
  return parEducateur;
}

export interface CalculDisponibilite {
  /** L'educateur peut-il travailler sur ce pas, hors occupation courante ? */
  mobilisable(educateurId: string, pas: number): boolean;
  /** ... et sans etre deja pris ailleurs dans ce planning. */
  libre(educateurId: string, pas: number, planning: Planning): boolean;
  libreSur(educateurId: string, pas: readonly number[], planning: Planning): boolean;
}

export function calculDisponibilite(ref: Referentiel, etat: EtatJour): CalculDisponibilite {
  const bloques = indisponibilitesRecurrentes(ref, etat.jour);

  const mobilisable = (educateurId: string, pas: number): boolean => {
    // Une pause est un temps commun : le moteur n'y affecte personne. C'est la
    // porte unique par laquelle le solveur recrute (`reparation.ts`), donc la
    // fermer ici suffit — il n'y a pas de second chemin a garder en tete.
    // Les educateurs deja inscrits sur un creneau de pause y RESTENT : c'est la
    // donnee de l'utilisateur. Le moteur cesse d'en ajouter, il n'en retire pas.
    if (ref.grille.estPause(pas)) return false;
    if (bloques.get(educateurId)?.has(pas)) return false;
    return educateurDisponible(ref, etat, educateurId, pas);
  };

  const libre = (educateurId: string, pas: number, planning: Planning): boolean =>
    mobilisable(educateurId, pas) && !planning.educateurOccupeAuPas(educateurId, pas);

  return {
    mobilisable,
    libre,
    libreSur: (educateurId, pas, planning) => pas.every((p) => libre(educateurId, p, planning)),
  };
}
