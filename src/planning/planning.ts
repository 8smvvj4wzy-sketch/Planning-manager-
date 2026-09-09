/**
 * Planning resolu d'une journee : la sortie du moteur, et l'entree de
 * l'evaluation des regles.
 *
 * Un `Creneau` est la version "du jour" d'un `CreneauType` : meme contenu,
 * mais exprime en index de pas et enrichi de son statut (verrouille, epingle,
 * derive d'une affectation manuelle...).
 */

import type { Affectation, Jour } from '../types.ts';

export type OrigineCreneau = 'planning-type' | 'manuel' | 'moteur';

export interface Creneau {
  id: string;
  /** Id du creneau du `planningType` dont il derive, s'il en derive un. */
  origineId: string | null;
  origine: OrigineCreneau;
  jour: Jour;
  pasDebut: number;
  /** Duree en pas. */
  pas: number;
  activiteId: string;
  salleId: string | null;
  jeunes: string[];
  educateurs: string[];
  /**
   * Qui accompagne qui. Toujours present cote planning resolu (tableau vide
   * plutot qu'absent : moins de `?? []` dans tout le moteur), facultatif dans
   * le fichier. Voir src/affectations.ts pour la regle de repli.
   */
  affectations: Affectation[];
  /**
   * Le creneau d'origine nommait-il ses binomes ?
   *
   * Distinct de `affectations.length > 0` : une absence peut vider les paires
   * d'un creneau nominatif, et sans ce drapeau il passerait pour un collectif
   * — le solveur ne refermerait alors jamais la paire qu'il vient de rompre.
   * La nature du creneau appartient au planning type, pas a ce qui survit a une
   * absence.
   */
  nominatif: boolean;
  /** Intouchable meme en cas d'absence (structure.json). */
  verrouille: boolean;
  /** Intouchable pour aujourd'hui seulement (jour.json). */
  epingle: boolean;
}

export function pasDuCreneau(c: Creneau): number[] {
  return Array.from({ length: c.pas }, (_, i) => c.pasDebut + i);
}

export function creneauxSeChevauchent(a: Creneau, b: Creneau): boolean {
  return a.pasDebut < b.pasDebut + b.pas && b.pasDebut < a.pasDebut + a.pas;
}

/** Un creneau fige ne doit jamais etre modifie par le moteur. */
export function estFige(c: Creneau): boolean {
  return c.verrouille || c.epingle;
}

interface Index {
  parId: Map<string, Creneau>;
  parEducateur: Map<string, Creneau[]>;
  parJeune: Map<string, Creneau[]>;
  parPas: Map<number, Creneau[]>;
}

export class Planning {
  readonly jour: Jour;
  private _creneaux: Creneau[];
  private _index: Index | null = null;

  constructor(jour: Jour, creneaux: Creneau[] = []) {
    this.jour = jour;
    this._creneaux = creneaux;
  }

  get creneaux(): readonly Creneau[] {
    return this._creneaux;
  }

  /** Copie profonde : le solveur explore des variantes sans abimer l'original. */
  clone(): Planning {
    return new Planning(
      this.jour,
      // Les affectations se copient comme le reste : sans ca deux plannings
      // partagent leurs binomes et le solveur corrompt l'original qu'il
      // explore.
      this._creneaux.map((c) => ({
        ...c,
        jeunes: [...c.jeunes],
        educateurs: [...c.educateurs],
        affectations: c.affectations.map((a) => ({ ...a })),
      })),
    );
  }

  /** A appeler apres toute mutation directe d'un creneau. */
  invalide(): void {
    this._index = null;
  }

  ajoute(creneau: Creneau): void {
    this._creneaux.push(creneau);
    this.invalide();
  }

  supprime(id: string): void {
    this._creneaux = this._creneaux.filter((c) => c.id !== id);
    this.invalide();
  }

  private get index(): Index {
    if (this._index) return this._index;
    const idx: Index = {
      parId: new Map(),
      parEducateur: new Map(),
      parJeune: new Map(),
      parPas: new Map(),
    };
    for (const c of this._creneaux) {
      idx.parId.set(c.id, c);
      for (const e of c.educateurs) {
        const l = idx.parEducateur.get(e);
        if (l) l.push(c);
        else idx.parEducateur.set(e, [c]);
      }
      for (const j of c.jeunes) {
        const l = idx.parJeune.get(j);
        if (l) l.push(c);
        else idx.parJeune.set(j, [c]);
      }
      for (const p of pasDuCreneau(c)) {
        const l = idx.parPas.get(p);
        if (l) l.push(c);
        else idx.parPas.set(p, [c]);
      }
    }
    this._index = idx;
    return idx;
  }

  creneau(id: string): Creneau | undefined {
    return this.index.parId.get(id);
  }

  creneauxDeEducateur(educateurId: string): readonly Creneau[] {
    return this.index.parEducateur.get(educateurId) ?? [];
  }

  creneauxDeJeune(jeuneId: string): readonly Creneau[] {
    return this.index.parJeune.get(jeuneId) ?? [];
  }

  creneauxAuPas(pas: number): readonly Creneau[] {
    return this.index.parPas.get(pas) ?? [];
  }

  educateurOccupeAuPas(educateurId: string, pas: number): Creneau | undefined {
    return this.creneauxAuPas(pas).find((c) => c.educateurs.includes(educateurId));
  }

  jeuneOccupeAuPas(jeuneId: string, pas: number): Creneau | undefined {
    return this.creneauxAuPas(pas).find((c) => c.jeunes.includes(jeuneId));
  }

  /** Creneaux du jeune, tries par ordre chronologique. */
  journeeDuJeune(jeuneId: string): Creneau[] {
    return [...this.creneauxDeJeune(jeuneId)].sort((a, b) => a.pasDebut - b.pasDebut);
  }

  /** Creneaux de l'educateur, tries par ordre chronologique. */
  journeeDeEducateur(educateurId: string): Creneau[] {
    return [...this.creneauxDeEducateur(educateurId)].sort((a, b) => a.pasDebut - b.pasDebut);
  }
}
