/**
 * Etat d'une journee donnee : qui est la, quand, et a quel titre.
 * Croise `structure.json` (presences et disponibilites hebdomadaires)
 * avec `jour.json` (absences ponctuelles, renforts, epingles).
 */

import type { Referentiel } from '../referentiel.ts';
import type { Absence, DateIso, FichierJour, Jour } from '../types.ts';
import { JOURS } from '../types.ts';
import type { ModeDetachement } from './options.ts';

export interface EtatJour {
  jour: Jour;
  date: DateIso | null;
  /** Pas d'absence, par id. Un jeune/educateur absent la journee a tous les pas. */
  absencesJeunes: ReadonlyMap<string, ReadonlySet<number>>;
  absencesEducateurs: ReadonlyMap<string, ReadonlySet<number>>;
  /** Renforts mobilisables aujourd'hui uniquement. */
  renforts: ReadonlySet<string>;
  /** Ids de creneaux du planning type a ne pas toucher aujourd'hui. */
  epingles: ReadonlySet<string>;
}

/** Jour de la semaine d'une date "AAAA-MM-JJ". */
export function jourDeLaDate(date: DateIso): Jour {
  const [a, m, j] = date.split('-').map(Number);
  const d = new Date(Date.UTC(a ?? 1970, (m ?? 1) - 1, j ?? 1));
  // getUTCDay : 0 = dimanche.
  const index = (d.getUTCDay() + 6) % 7; // 0 = lundi
  const jour = JOURS[index];
  if (!jour) throw new RangeError(`Date invalide : ${date}`);
  return jour;
}

function pasAbsents(ref: Referentiel, absence: Absence): Set<number> {
  if (absence.journee || !absence.debut || !absence.fin) {
    return new Set(ref.grille.tousLesPas());
  }
  const debut = ref.grille.pasDeHeure(absence.debut);
  const finExclue = ref.grille.pasDeHeure(absence.fin);
  const pas = new Set<number>();
  for (let p = Math.max(0, debut); p < Math.min(ref.grille.nbPas, finExclue); p++) pas.add(p);
  return pas;
}

function fusionne(cible: Map<string, Set<number>>, id: string, ajout: Set<number>): void {
  const existant = cible.get(id);
  if (existant) for (const p of ajout) existant.add(p);
  else cible.set(id, ajout);
}

export function construitEtatJour(ref: Referentiel, fichier: FichierJour): EtatJour {
  const jour = jourDeLaDate(fichier.date);
  const absencesJeunes = new Map<string, Set<number>>();
  const absencesEducateurs = new Map<string, Set<number>>();

  for (const absence of fichier.absences) {
    const cible = absence.type === 'jeune' ? absencesJeunes : absencesEducateurs;
    fusionne(cible, absence.id, pasAbsents(ref, absence));
  }

  return {
    jour,
    date: fichier.date,
    absencesJeunes,
    absencesEducateurs,
    renforts: new Set(fichier.renfortsDuJour ?? []),
    epingles: new Set(fichier.epingles ?? []),
  };
}

/** Journee ordinaire : le planning type tel quel, sans absence ni renfort. */
export function etatJourNominal(jour: Jour): EtatJour {
  return {
    jour,
    date: null,
    absencesJeunes: new Map(),
    absencesEducateurs: new Map(),
    renforts: new Set(),
    epingles: new Set(),
  };
}

/** Le jeune est-il accueilli et present sur ce pas ? */
export function jeunePresent(ref: Referentiel, etat: EtatJour, jeuneId: string, pas: number): boolean {
  const jeune = ref.jeune(jeuneId);
  if (!jeune || !jeune.actif) return false;
  if (etat.absencesJeunes.get(jeuneId)?.has(pas)) return false;
  const plage = jeune.presence[etat.jour];
  return plage ? ref.grille.plageCouvre(plage, pas) : false;
}

/**
 * L'educateur est-il mobilisable sur ce pas ?
 * `renfortsSeulementSiDeclares` : un educateur de statut `renfort` n'est
 * disponible que s'il figure dans `renfortsDuJour`.
 */
export function educateurDisponible(
  ref: Referentiel,
  etat: EtatJour,
  educateurId: string,
  pas: number,
): boolean {
  const educateur = ref.educateur(educateurId);
  if (!educateur || !educateur.actif) return false;
  if (educateur.statut === 'renfort' && !etat.renforts.has(educateurId)) return false;
  if (etat.absencesEducateurs.get(educateurId)?.has(pas)) return false;
  const plage = educateur.disponibilites[etat.jour];
  return plage ? ref.grille.plageCouvre(plage, pas) : false;
}

/** Disponible sur tous les pas d'un creneau. */
export function educateurDisponibleSur(
  ref: Referentiel,
  etat: EtatJour,
  educateurId: string,
  pas: readonly number[],
): boolean {
  return pas.every((p) => educateurDisponible(ref, etat, educateurId, p));
}

/**
 * Un educateur detache (mission transversale, autre batiment) est-il
 * mobilisable, et a quel cout ? Voir `ModeDetachement`.
 */
export function estDetache(ref: Referentiel, educateurId: string): boolean {
  const e = ref.educateur(educateurId);
  return e?.statut === 'autre-batiment';
}

export function mobilisationPossible(mode: ModeDetachement, detache: boolean): boolean {
  return !detache || mode !== 'indisponible';
}
