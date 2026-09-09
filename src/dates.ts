/**
 * Arithmetique de dates, en UTC.
 *
 * Toujours UTC : construire un `Date` local et ajouter 24 h se decale d'une
 * heure au passage a l'heure d'hiver, et une serie de journees finit par sauter
 * ou repeter un jour. Les dates du modele sont des jours calendaires, pas des
 * instants.
 */

import type { DateIso } from './types.ts';

const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

export function estDateValide(date: unknown): date is DateIso {
  if (typeof date !== 'string' || !FORMAT.test(date)) return false;
  return versUTC(date as DateIso) !== null;
}

function versUTC(date: DateIso): number | null {
  const m = FORMAT.exec(date);
  if (!m) return null;
  const [a, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(a, mois - 1, jour);
  const d = new Date(t);
  // Rejette le 31 fevrier, que Date.UTC accepterait en le reportant sur mars.
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mois - 1 || d.getUTCDate() !== jour) return null;
  return t;
}

function depuisUTC(t: number): DateIso {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function enTimestamp(date: DateIso): number {
  const t = versUTC(date);
  if (t === null) throw new RangeError(`Date invalide : ${JSON.stringify(date)} (attendu "AAAA-MM-JJ")`);
  return t;
}

export function dateSuivante(date: DateIso, jours = 1): DateIso {
  return depuisUTC(enTimestamp(date) + jours * 86_400_000);
}

/** Negatif si `a` precede `b`, positif sinon, zero si egales. */
export function comparerDates(a: DateIso, b: DateIso): number {
  return enTimestamp(a) - enTimestamp(b);
}

export function dateDansIntervalle(date: DateIso, du: DateIso, au?: DateIso): boolean {
  if (comparerDates(date, du) < 0) return false;
  return au === undefined || comparerDates(date, au) <= 0;
}

/**
 * Cle de semaine ISO, « 2026-W38 ». Sert a regrouper les journees d'une periode
 * pour verifier les quotas hebdomadaires : une periode a cheval sur deux
 * semaines a deux plafonds distincts, pas un seul etale.
 */
export function cleSemaineIso(date: DateIso): string {
  const t = enTimestamp(date);
  const d = new Date(t);
  // Jeudi de la semaine courante : c'est lui qui porte l'annee ISO.
  const jour = (d.getUTCDay() + 6) % 7; // 0 = lundi
  const jeudi = new Date(t + (3 - jour) * 86_400_000);
  const annee = jeudi.getUTCFullYear();
  const premierJanvier = Date.UTC(annee, 0, 1);
  const semaine = Math.floor((jeudi.getTime() - premierJanvier) / 86_400_000 / 7) + 1;
  return `${annee}-W${String(semaine).padStart(2, '0')}`;
}
