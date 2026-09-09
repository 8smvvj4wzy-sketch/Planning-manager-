/**
 * Conversions temps <-> pas. Tout le moteur raisonne en index de pas entiers ;
 * les "HH:MM" ne servent qu'aux entrees/sorties.
 */

import type { Grille, Heure, Jour, Plage } from './types.ts';

const FORMAT_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function estHeureValide(h: unknown): h is Heure {
  return typeof h === 'string' && FORMAT_HEURE.test(h);
}

/** "09:30" -> 570. Leve si le format est invalide. */
export function heureEnMinutes(h: Heure): number {
  const m = FORMAT_HEURE.exec(h);
  if (!m) throw new RangeError(`Heure invalide : ${JSON.stringify(h)} (attendu "HH:MM")`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 570 -> "09:30". */
export function minutesEnHeure(minutes: number): Heure {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Grille compilee : bornes en minutes, nombre de pas, et index des pas de pause.
 * Construite une fois par structure, puis partagee.
 */
export class GrilleTemps {
  readonly pasMinutes: number;
  readonly debutMinutes: number;
  readonly finMinutes: number;
  readonly nbPas: number;
  readonly jours: readonly Jour[];
  private readonly pasPause: ReadonlySet<number>;

  constructor(grille: Grille) {
    if (!Number.isInteger(grille.pasMinutes) || grille.pasMinutes <= 0) {
      throw new RangeError(`grille.pasMinutes doit etre un entier positif (recu ${grille.pasMinutes})`);
    }
    this.pasMinutes = grille.pasMinutes;
    this.debutMinutes = heureEnMinutes(grille.debut);
    this.finMinutes = heureEnMinutes(grille.fin);
    if (this.finMinutes <= this.debutMinutes) {
      throw new RangeError(`grille.fin (${grille.fin}) doit etre apres grille.debut (${grille.debut})`);
    }
    this.nbPas = Math.floor((this.finMinutes - this.debutMinutes) / this.pasMinutes);
    this.jours = [...grille.jours];

    const pauses = new Set<number>();
    for (const pause of grille.pauses ?? []) {
      const premier = this.pasDeHeure(pause.debut);
      for (let i = 0; i < pause.pas; i++) {
        const p = premier + i;
        if (p >= 0 && p < this.nbPas) pauses.add(p);
      }
    }
    this.pasPause = pauses;
  }

  /** Index du pas contenant cette heure. Peut sortir de [0, nbPas[ si l'heure est hors grille. */
  pasDeHeure(h: Heure): number {
    return Math.floor((heureEnMinutes(h) - this.debutMinutes) / this.pasMinutes);
  }

  /** Heure de debut du pas `p`. */
  heureDePas(p: number): Heure {
    return minutesEnHeure(this.debutMinutes + p * this.pasMinutes);
  }

  /** Vrai si l'heure tombe exactement sur une frontiere de pas. */
  estAlignee(h: Heure): boolean {
    return (heureEnMinutes(h) - this.debutMinutes) % this.pasMinutes === 0;
  }

  estPause(p: number): boolean {
    return this.pasPause.has(p);
  }

  /** Tous les index de pas de la journee, pauses comprises. */
  tousLesPas(): number[] {
    return Array.from({ length: this.nbPas }, (_, i) => i);
  }

  /**
   * Pas couverts par une plage horaire, intersectes avec la grille.
   * Un pas est couvert s'il est entierement contenu dans la plage.
   */
  pasDePlage(plage: Plage): number[] {
    const debut = heureEnMinutes(plage.debut);
    const fin = heureEnMinutes(plage.fin);
    const pas: number[] = [];
    for (let p = 0; p < this.nbPas; p++) {
      const d = this.debutMinutes + p * this.pasMinutes;
      if (d >= debut && d + this.pasMinutes <= fin) pas.push(p);
    }
    return pas;
  }

  /** Pas occupes par un creneau demarrant a `debut` et durant `pas` pas. */
  pasDeCreneau(debut: Heure, duree: number): number[] {
    const premier = this.pasDeHeure(debut);
    return Array.from({ length: duree }, (_, i) => premier + i);
  }

  /** Vrai si la plage couvre entierement le pas `p`. */
  plageCouvre(plage: Plage, p: number): boolean {
    const d = this.debutMinutes + p * this.pasMinutes;
    return heureEnMinutes(plage.debut) <= d && heureEnMinutes(plage.fin) >= d + this.pasMinutes;
  }
}
