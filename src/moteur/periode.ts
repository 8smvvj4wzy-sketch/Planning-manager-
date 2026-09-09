/**
 * Une absence qui dure, et la serie de plannings qu'elle appelle.
 *
 * « Lucas absent jusqu'au 19 » ne se traite pas en une fois : chaque jour
 * d'accueil de l'intervalle a ses propres presents, ses propres creneaux et sa
 * propre reparation. La periode se projette donc sur chaque date et delegue au
 * solveur journalier — rien de ce qui a ete ecrit pour une journee n'est
 * reecrit ici.
 *
 * Ce que cette couche ajoute et qu'une journee ne peut pas voir :
 *  - le retour au fonctionnement initial, qui est une propriete de la serie ;
 *  - les quotas hebdomadaires, verifies semaine par semaine.
 */

import { cleSemaineIso, comparerDates, dateDansIntervalle, dateSuivante, enTimestamp } from '../dates.ts';
import type { Referentiel } from '../referentiel.ts';
import type { Violation } from '../regles/base.ts';
import type {
  Absence,
  AbsencePeriode,
  DateIso,
  FichierJour,
  FichierPeriode,
  Jour,
} from '../types.ts';
import { jourDeLaDate } from './etatJour.ts';
import { optionsAvec, type OptionsPartielles } from './options.ts';
import { jeunesImpactes, repare, type Reparation } from './reparation.ts';
import { bilanDeSemaine } from './semaine.ts';

/** Garde-fou : une periode de plus d'un an trahit une erreur de saisie. */
const MAX_JOURS = 400;

export interface JourneeReparee {
  date: DateIso;
  jour: Jour;
  reparation: Reparation;
  /** Rien a changer : cette journee tourne comme le planning type. */
  nominale: boolean;
}

export interface ReparationPeriode {
  journees: JourneeReparee[];
  /**
   * Premiere date a partir de laquelle plus rien ne bouge jusqu'a la fin de la
   * periode — le « retour au fonctionnement initial ». `null` si la periode se
   * termine sans y revenir.
   */
  retourNominal: DateIso | null;
  /** Quotas hebdomadaires, evalues semaine ISO par semaine ISO. */
  violationsHebdomadaires: Violation[];
  cout: number;
  admissible: boolean;
}

/**
 * Dernier jour a examiner.
 *
 * Par defaut : la derniere fin d'absence, plus un jour — celui qui montre le
 * retour a la normale. Une absence sans terme oblige a borner explicitement,
 * sinon la serie n'aurait pas de fin.
 */
export function finDeLaPeriode(periode: FichierPeriode): DateIso {
  if (periode.au) return periode.au;

  const sansTerme = periode.absences.find((a) => !a.au);
  if (sansTerme) {
    throw new RangeError(
      `L'absence de "${sansTerme.id}" court sans terme : la periode doit alors porter un "au", ` +
        'sinon la serie de plannings n\'a pas de fin.',
    );
  }

  const derniere = periode.absences.reduce<DateIso | null>(
    (max, a) => (max === null || comparerDates(a.au!, max) > 0 ? a.au! : max),
    null,
  );
  // Sans absence du tout, on regarde le seul jour demande.
  return derniere === null ? periode.du : dateSuivante(derniere);
}

/** Jours d'accueil de la periode, dans l'ordre. Les autres sont ignores. */
export function datesDeLaPeriode(ref: Referentiel, periode: FichierPeriode): DateIso[] {
  const fin = finDeLaPeriode(periode);
  if (comparerDates(fin, periode.du) < 0) return [];
  if ((enTimestamp(fin) - enTimestamp(periode.du)) / 86_400_000 > MAX_JOURS) {
    throw new RangeError(
      `Periode de plus de ${MAX_JOURS} jours (${periode.du} → ${fin}) : verifiez les dates.`,
    );
  }

  const jours = new Set<Jour>(ref.structure.grille.jours);
  const dates: DateIso[] = [];
  for (let date = periode.du; comparerDates(date, fin) <= 0; date = dateSuivante(date)) {
    if (jours.has(jourDeLaDate(date))) dates.push(date);
  }
  return dates;
}

function absenceActive(absence: AbsencePeriode, date: DateIso): Absence | null {
  if (!dateDansIntervalle(date, absence.du, absence.au)) return null;
  const projetee: Absence = { type: absence.type, id: absence.id };
  if (absence.journee || (!absence.debut && !absence.fin)) projetee.journee = true;
  else {
    if (absence.debut) projetee.debut = absence.debut;
    if (absence.fin) projetee.fin = absence.fin;
  }
  if (absence.motif) projetee.motif = absence.motif;
  return projetee;
}

/** Projette la periode sur une date : le fichier du jour que le solveur attend. */
export function jourDeLaPeriode(periode: FichierPeriode, date: DateIso): FichierJour {
  return {
    structureVersion: periode.structureVersion,
    date,
    absences: periode.absences
      .map((a) => absenceActive(a, date))
      .filter((a): a is Absence => a !== null),
    renfortsDuJour: [...(periode.renforts ?? [])],
    epingles: [...(periode.epingles ?? [])],
  };
}

/**
 * Premiere date a partir de laquelle toutes les suivantes sont nominales.
 * On remonte depuis la fin : « revenu a la normale » veut dire que plus rien ne
 * bouge ensuite, pas qu'une journee calme s'est glissee au milieu.
 */
function chercheRetourNominal(journees: readonly JourneeReparee[]): DateIso | null {
  let retour: DateIso | null = null;
  for (let i = journees.length - 1; i >= 0; i--) {
    const journee = journees[i]!;
    if (!journee.nominale) break;
    retour = journee.date;
  }
  return retour;
}

export function reparePeriode(
  ref: Referentiel,
  periode: FichierPeriode,
  options?: OptionsPartielles,
): ReparationPeriode {
  const completes = optionsAvec(options);

  const journees: JourneeReparee[] = datesDeLaPeriode(ref, periode).map((date) => {
    const reparation = repare(ref, jourDeLaPeriode(periode, date), completes);
    return {
      date,
      jour: jourDeLaDate(date),
      reparation,
      nominale: reparation.changements.length === 0 && reparation.conflits.length === 0,
    };
  });

  // Les quotas hebdomadaires se comptent par semaine ISO : une periode a cheval
  // sur deux semaines a deux plafonds distincts, pas un seul etale sur dix jours.
  const parSemaine = new Map<string, JourneeReparee[]>();
  for (const journee of journees) {
    const cle = cleSemaineIso(journee.date);
    const existant = parSemaine.get(cle);
    if (existant) existant.push(journee);
    else parSemaine.set(cle, [journee]);
  }

  const violationsHebdomadaires = [...parSemaine.values()].flatMap(
    (semaine) =>
      bilanDeSemaine(
        ref,
        semaine.map((j) => ({ jour: j.jour, reparation: j.reparation })),
        completes,
      ).violationsHebdomadaires,
  );

  const coutJournees = journees.reduce((total, j) => total + j.reparation.cout, 0);
  const coutHebdo = violationsHebdomadaires.reduce((total, v) => total + v.cout, 0);

  return {
    journees,
    retourNominal: chercheRetourNominal(journees),
    violationsHebdomadaires,
    cout: coutJournees + coutHebdo,
    admissible:
      journees.every((j) => j.reparation.admissible) && !violationsHebdomadaires.some((v) => v.dure),
  };
}

/* ==================== Comparaison de deux series ====================
   Un planning enregistre est fige : c'est ce qui a ete imprime et annonce a
   l'equipe, il ne doit plus bouger. Mais la structure, elle, evolue. Comparer
   le gel au resultat d'un nouveau calcul dit exactement ce qui aurait change —
   sans rien ecraser. */

export interface DifferenceJournee {
  date: DateIso;
  /** La journee existait-elle de chaque cote ? Une periode peut avoir bouge. */
  dansAvant: boolean;
  dansApres: boolean;
  jeunesImpactes: string[];
  /** Creneaux dont la composition a change, par id. */
  creneauxModifies: string[];
  /** Creneaux presents d'un seul cote. */
  creneauxAjoutes: string[];
  creneauxRetires: string[];
}

function empreinteCreneau(creneau: {
  jeunes: readonly string[];
  educateurs: readonly string[];
  salleId: string | null;
  activiteId: string;
  affectations: readonly { jeuneId: string; educateurId: string }[];
}): string {
  const paires = creneau.affectations.map((a) => `${a.jeuneId}>${a.educateurId}`).sort();
  return [
    creneau.activiteId,
    creneau.salleId ?? '-',
    [...creneau.jeunes].sort().join('+'),
    [...creneau.educateurs].sort().join('+'),
    paires.join('+'),
  ].join('|');
}

/**
 * Ce qui differe entre deux series. Ne rend que les journees qui ont bouge :
 * une liste vide veut dire que le recalcul redonne exactement le gel.
 */
export function comparePeriodes(
  avant: ReparationPeriode,
  apres: ReparationPeriode,
): DifferenceJournee[] {
  const parDate = new Map<DateIso, { avant?: JourneeReparee; apres?: JourneeReparee }>();
  for (const j of avant.journees) parDate.set(j.date, { ...parDate.get(j.date), avant: j });
  for (const j of apres.journees) parDate.set(j.date, { ...parDate.get(j.date), apres: j });

  const differences: DifferenceJournee[] = [];

  for (const date of [...parDate.keys()].sort(comparerDates)) {
    const { avant: a, apres: b } = parDate.get(date)!;

    if (!a || !b) {
      differences.push({
        date,
        dansAvant: !!a,
        dansApres: !!b,
        jeunesImpactes: [],
        creneauxModifies: [],
        creneauxAjoutes: b ? b.reparation.planning.creneaux.map((c) => c.id) : [],
        creneauxRetires: a ? a.reparation.planning.creneaux.map((c) => c.id) : [],
      });
      continue;
    }

    const empreintesAvant = new Map(
      a.reparation.planning.creneaux.map((c) => [c.id, empreinteCreneau(c)]),
    );
    const empreintesApres = new Map(
      b.reparation.planning.creneaux.map((c) => [c.id, empreinteCreneau(c)]),
    );

    const modifies: string[] = [];
    const ajoutes: string[] = [];
    const retires: string[] = [];

    for (const [id, empreinte] of empreintesApres) {
      const ancienne = empreintesAvant.get(id);
      if (ancienne === undefined) ajoutes.push(id);
      else if (ancienne !== empreinte) modifies.push(id);
    }
    for (const id of empreintesAvant.keys()) {
      if (!empreintesApres.has(id)) retires.push(id);
    }

    const impactes = jeunesImpactes(a.reparation.planning, b.reparation.planning);

    if (modifies.length + ajoutes.length + retires.length + impactes.length > 0) {
      differences.push({
        date,
        dansAvant: true,
        dansApres: true,
        jeunesImpactes: impactes,
        creneauxModifies: modifies.sort(),
        creneauxAjoutes: ajoutes.sort(),
        creneauxRetires: retires.sort(),
      });
    }
  }

  return differences;
}
