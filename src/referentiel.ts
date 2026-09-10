/**
 * Vue indexee d'un `structure.json` : evite de rebalayer les tableaux
 * a chaque regle et a chaque pas du solveur.
 */

import { GrilleTemps } from './temps.ts';
import type {
  Activite,
  CreneauType,
  Educateur,
  Groupe,
  Jeune,
  Jour,
  Quinzaine,
  Salle,
  Structure,
} from './types.ts';

function indexe<T extends { id: string }>(elements: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of elements) m.set(e.id, e);
  return m;
}

export class Referentiel {
  readonly structure: Structure;
  readonly grille: GrilleTemps;
  readonly jeunes: ReadonlyMap<string, Jeune>;
  readonly educateurs: ReadonlyMap<string, Educateur>;
  readonly salles: ReadonlyMap<string, Salle>;
  readonly groupes: ReadonlyMap<string, Groupe>;
  readonly activites: ReadonlyMap<string, Activite>;
  readonly creneauxType: ReadonlyMap<string, CreneauType>;

  constructor(structure: Structure) {
    this.structure = structure;
    this.grille = new GrilleTemps(structure.grille);
    this.jeunes = indexe(structure.jeunes);
    this.educateurs = indexe(structure.educateurs);
    this.salles = indexe(structure.salles);
    this.groupes = indexe(structure.groupes);
    this.activites = indexe(structure.activites);
    this.creneauxType = indexe(structure.planningType);
  }

  jeune(id: string): Jeune | undefined {
    return this.jeunes.get(id);
  }

  educateur(id: string): Educateur | undefined {
    return this.educateurs.get(id);
  }

  activite(id: string): Activite | undefined {
    return this.activites.get(id);
  }

  salle(id: string): Salle | undefined {
    return this.salles.get(id);
  }

  /** Initiales du jeune, ou son id si inconnu. Sert aux messages lisibles. */
  libelleJeune(id: string): string {
    return this.jeunes.get(id)?.initiales ?? id;
  }

  /** "Prenom Nom" de l'educateur, ou son id si inconnu. */
  libelleEducateur(id: string): string {
    const e = this.educateurs.get(id);
    if (!e) return id;
    return e.prenom ? `${e.prenom} ${e.nom}` : e.nom;
  }

  /** Jeunes rattaches a un groupe. */
  jeunesDuGroupe(groupeId: string): Jeune[] {
    return this.structure.jeunes.filter((j) => j.groupeId === groupeId);
  }

  /** Salles portant ce tag. */
  sallesAvecTag(tag: string): Salle[] {
    return this.structure.salles.filter((s) => (s.tags ?? []).includes(tag));
  }

  /**
   * Creneaux d'un jour, filtres sur une quinzaine si on en demande une.
   *
   * Un creneau sans `quinzaine` a lieu TOUTES les semaines : il ressort aussi
   * bien cote A que cote B. C'est le filtre pivot de l'alternance — tout ce qui
   * enumere les creneaux d'un jour passe par ici.
   */
  creneauxTypeDuJour(jour: Jour, quinzaine?: Quinzaine): CreneauType[] {
    return this.structure.planningType.filter(
      (c) => c.jour === jour && (quinzaine === undefined || c.quinzaine === undefined || c.quinzaine === quinzaine),
    );
  }

  /** La structure fait-elle alterner des semaines ? */
  get aDesQuinzaines(): boolean {
    return this.structure.planningType.some((c) => c.quinzaine !== undefined);
  }
}
