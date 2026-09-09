/**
 * Solveur de reparation.
 *
 * Le planning type est la reference : le moteur cherche a le modifier le moins
 * possible. Il procede en deux temps.
 *
 *  1. **Comblement des deficits.** Pour chaque creneau sous-encadre (absence,
 *     retrait), on cherche le remplacant le moins couteux qui ne viole aucune
 *     regle dure. A defaut, le creneau est signale comme conflit — le moteur ne
 *     bricole pas une solution qui violerait une regle dure.
 *  2. **Passe d'amelioration.** Tant que le cout total baisse, on tente des
 *     substitutions d'educateurs pour resorber les violations souples.
 *
 * Le cout d'un changement est parametrable : voir OptionsMoteur / docs/decisions.md.
 */

import {
  jeunesSansReferent,
  rattacheAuxJeunesSansReferent,
  remplaceEducateurDansBinomes,
  retireEducateurDesBinomes,
} from '../affectations.ts';
import { educateursRequis, jeunesPresentsDu } from '../encadrement.ts';
import { estDetacheSur } from '../detachement.ts';
import {
  estFige,
  pasDuCreneau,
  type Creneau,
  type Planning,
} from '../planning/planning.ts';
import { planningInitial, appliqueAffectationsManuelles } from '../planning/construction.ts';
import type { Referentiel } from '../referentiel.ts';
import { evalue, type Bilan } from '../regles/evaluation.ts';
import { evaluateurDe } from '../regles/registre.ts';
import type { ContexteEvaluation, Violation } from '../regles/base.ts';
import type { FichierJour, Jour, Regle } from '../types.ts';
import { calculDisponibilite, type CalculDisponibilite } from './disponibilite.ts';
import { construitEtatJour, etatJourNominal, type EtatJour } from './etatJour.ts';
import { optionsAvec, type OptionsMoteur, type OptionsPartielles } from './options.ts';

export type ActionChangement = 'ajout' | 'retrait' | 'deplacement';

export interface Changement {
  action: ActionChangement;
  creneauId: string;
  educateurId: string;
  /** Creneau d'origine, pour un deplacement. */
  depuisCreneauId?: string;
  cout: number;
  motif: string;
}

export interface Conflit {
  creneauId: string;
  /** Nombre d'educateurs encore manquants. */
  manque: number;
  jeunes: string[];
  message: string;
}

export interface Reparation {
  /** Planning repare. */
  planning: Planning;
  /** Planning de depart (planning type moins les absents), pour comparaison. */
  initial: Planning;
  changements: Changement[];
  conflits: Conflit[];
  violations: Violation[];
  /** Cout total : changements + violations + conflits. */
  cout: number;
  /** Ni conflit, ni regle dure violee. */
  admissible: boolean;
  jeunesImpactes: string[];
  educateursDeplaces: string[];
}

interface Candidat {
  educateurId: string;
  cout: number;
  /** Creneaux dont il faut le retirer pour le liberer. */
  liberer: Creneau[];
  motif: string;
}

// --------------------------------------------------------------------------

/** Repare la journee decrite par `fichier` (absences, renforts, epingles). */
export function repare(
  ref: Referentiel,
  fichier: FichierJour,
  options?: OptionsPartielles,
): Reparation {
  const etat = construitEtatJour(ref, fichier);
  const planning = planningInitial(ref, etat);
  if (fichier.affectationsManuelles?.length) {
    appliqueAffectationsManuelles(ref, planning, fichier.affectationsManuelles);
  }
  return reparePlanning(ref, etat, planning, optionsAvec(options));
}

/** Repare une journee nominale (aucune absence) : sert a auditer le planning type. */
export function auditeJourNominal(
  ref: Referentiel,
  jour: Jour,
  options?: OptionsPartielles,
): Reparation {
  const etat = etatJourNominal(jour);
  return reparePlanning(ref, etat, planningInitial(ref, etat), optionsAvec(options));
}

export function reparePlanning(
  ref: Referentiel,
  etat: EtatJour,
  depart: Planning,
  options: OptionsMoteur,
): Reparation {
  const initial = depart.clone();
  const planning = depart.clone();
  const dispo = calculDisponibilite(ref, etat);
  const moteur = new Moteur(ref, etat, options, dispo);

  const changements: Changement[] = [];
  const conflits = moteur.combleDeficits(planning, changements);
  moteur.ameliore(planning, changements);

  const bilan = evalue(moteur.contexte(planning));
  const coutChangements = changements.reduce((t, c) => t + c.cout, 0);
  const coutConflits = conflits.reduce((t, c) => t + c.manque * options.couts.creneauNonResolu, 0);
  const impactes = jeunesImpactes(initial, planning);

  return {
    planning,
    initial,
    changements,
    conflits,
    violations: bilan.violations,
    cout:
      coutChangements +
      bilan.cout +
      coutConflits +
      impactes.length * options.couts.jeuneImpacte,
    admissible: conflits.length === 0 && bilan.admissible,
    jeunesImpactes: impactes,
    educateursDeplaces: [...new Set(changements.filter((c) => c.action === 'deplacement').map((c) => c.educateurId))],
  };
}

// --------------------------------------------------------------------------

class Moteur {
  private readonly ref: Referentiel;
  private readonly etat: EtatJour;
  private readonly options: OptionsMoteur;
  private readonly dispo: CalculDisponibilite;

  constructor(
    ref: Referentiel,
    etat: EtatJour,
    options: OptionsMoteur,
    dispo: CalculDisponibilite,
  ) {
    this.ref = ref;
    this.etat = etat;
    this.options = options;
    this.dispo = dispo;
  }

  contexte(planning: Planning): ContexteEvaluation {
    return { ref: this.ref, planning, etat: this.etat, options: this.options };
  }

  /** Ecart entre l'effectif requis et l'effectif present sur un creneau. */
  deficit(creneau: Creneau): number {
    const presents = jeunesPresentsDu(this.ref, this.etat, creneau);
    if (presents.length === 0) return 0;
    const requis = educateursRequis(this.ref, this.etat, creneau, this.options, presents);
    return Math.max(0, requis - creneau.educateurs.length);
  }

  // --- 1. comblement des deficits ------------------------------------------

  combleDeficits(planning: Planning, changements: Changement[]): Conflit[] {
    const conflits: Conflit[] = [];
    // Les creneaux figes d'abord (on ne peut pas les contourner), puis les plus
    // deficitaires, puis les plus matinaux : le choix se resserre avec la journee.
    const ordre = [...planning.creneaux].sort((a, b) => {
      if (estFige(a) !== estFige(b)) return estFige(a) ? -1 : 1;
      const da = this.deficit(a);
      const db = this.deficit(b);
      if (da !== db) return db - da;
      return a.pasDebut - b.pasDebut;
    });

    for (const creneau of ordre) {
      let manque = this.deficit(creneau);
      while (manque > 0) {
        const candidat = this.meilleurCandidat(planning, creneau);
        if (!candidat) break;
        this.affecte(planning, creneau, candidat, changements);
        manque = this.deficit(creneau);
      }
      if (manque > 0) {
        const presents = jeunesPresentsDu(this.ref, this.etat, creneau);
        conflits.push({
          creneauId: creneau.id,
          manque,
          jeunes: presents,
          message: `${creneau.id} (${this.ref.activite(creneau.activiteId)?.nom ?? creneau.activiteId}, ${this.ref.grille.heureDePas(creneau.pasDebut)}) : ${manque} educateur(s) manquant(s) pour ${presents.map((j) => this.ref.libelleJeune(j)).join(', ')}`,
        });
      }
    }
    return conflits;
  }

  /**
   * Applique un candidat sur un planning : retrait des creneaux liberes, ajout
   * sur la cible, et rattachement de l'educateur aux jeunes restes sans
   * referent.
   *
   * Une seule definition, utilisee par l'essai d'admissibilite comme par
   * l'application reelle. Deux chemins separes finiraient par diverger, et le
   * solveur jugerait une affectation pour en appliquer une autre.
   *
   * Rend les jeunes que l'educateur reprend, pour que le motif du changement
   * puisse le dire.
   */
  private applique(
    planning: Planning,
    creneauId: string,
    educateurId: string,
    liberer: readonly string[],
  ): string[] {
    for (const id of liberer) {
      const source = planning.creneau(id);
      if (!source) continue;
      source.educateurs = source.educateurs.filter((e) => e !== educateurId);
      // Le binome part avec lui : le laisser ferait croire que le jeune a
      // encore un referent sur un creneau que l'educateur a quitte.
      source.affectations = retireEducateurDesBinomes(source.affectations, educateurId);
    }

    const cible = planning.creneau(creneauId);
    if (!cible) return [];
    cible.educateurs.push(educateurId);
    const repris = jeunesSansReferent(cible);
    cible.affectations = rattacheAuxJeunesSansReferent(cible, educateurId);
    planning.invalide();
    return repris;
  }

  private affecte(
    planning: Planning,
    creneau: Creneau,
    candidat: Candidat,
    changements: Changement[],
  ): void {
    for (const source of candidat.liberer) {
      changements.push({
        action: 'retrait',
        creneauId: source.id,
        educateurId: candidat.educateurId,
        cout: 0, // le cout du deplacement est porte par l'affectation
        motif: `libere pour ${creneau.id}`,
      });
    }

    const repris = this.applique(
      planning,
      creneau.id,
      candidat.educateurId,
      candidat.liberer.map((c) => c.id),
    );

    const motif = repris.length > 0
      ? `${candidat.motif} — reprend ${repris.map((id) => this.ref.libelleJeune(id)).join(', ')}`
      : candidat.motif;

    changements.push({
      action: candidat.liberer.length > 0 ? 'deplacement' : 'ajout',
      creneauId: creneau.id,
      educateurId: candidat.educateurId,
      ...(candidat.liberer[0] ? { depuisCreneauId: candidat.liberer[0].id } : {}),
      cout: candidat.cout,
      motif,
    });
  }

  private meilleurCandidat(planning: Planning, creneau: Creneau): Candidat | null {
    const candidats = this.candidats(planning, creneau);
    candidats.sort((a, b) => a.cout - b.cout || a.educateurId.localeCompare(b.educateurId));
    for (const candidat of candidats) {
      if (this.affectationAdmissible(planning, creneau, candidat)) return candidat;
    }
    return null;
  }

  private candidats(planning: Planning, creneau: Creneau): Candidat[] {
    const pas = pasDuCreneau(creneau);
    const candidats: Candidat[] = [];

    for (const educateur of this.ref.structure.educateurs) {
      const id = educateur.id;
      if (creneau.educateurs.includes(id)) continue;
      if (!pas.every((p) => this.dispo.mobilisable(id, p))) continue;

      const occupations = new Set<Creneau>();
      for (const p of pas) {
        const occupe = planning.educateurOccupeAuPas(id, p);
        if (occupe) occupations.add(occupe);
      }

      const liberer = [...occupations];
      if (liberer.some((c) => estFige(c))) continue;
      // On ne deshabille pas Pierre pour habiller Paul.
      if (liberer.some((c) => this.deficitApresRetrait(c, id) > 0)) continue;

      const cout = this.coutCandidat(id, creneau, liberer);
      if (cout === null) continue;
      candidats.push({
        educateurId: id,
        cout,
        liberer,
        motif:
          liberer.length > 0
            ? `deplace depuis ${liberer.map((c) => c.id).join(', ')}`
            : 'disponible et non affecte',
      });
    }
    return candidats;
  }

  private deficitApresRetrait(creneau: Creneau, educateurId: string): number {
    const restants = creneau.educateurs.filter((id) => id !== educateurId).length;
    const presents = jeunesPresentsDu(this.ref, this.etat, creneau);
    if (presents.length === 0) return 0;
    const requis = educateursRequis(this.ref, this.etat, creneau, this.options, presents);
    return Math.max(0, requis - restants);
  }

  /** `null` = candidat ecarte (detachement non mobilisable). */
  private coutCandidat(educateurId: string, creneau: Creneau, liberer: readonly Creneau[]): number | null {
    const couts = this.options.couts;
    const educateur = this.ref.educateur(educateurId);
    let cout = couts.creneauModifie;

    if (liberer.length > 0) cout += couts.educateurDeplace * liberer.length;
    if (educateur?.statut === 'renfort') cout += couts.recoursRenfort;

    const detacheAilleurs =
      educateur?.statut === 'autre-batiment' ||
      liberer.some((c) => estDetacheSur(this.ref, educateurId, c));
    if (detacheAilleurs) {
      if (this.options.detachement === 'indisponible') return null;
      if (this.options.detachement === 'mobilisable') cout += couts.mobilisationDetache;
    }

    // Un educateur non detachable ne quitte pas son perimetre de reference.
    const detacheIci = estDetacheSur(this.ref, educateurId, creneau);
    if (detacheIci && educateur && !educateur.detachable) return null;
    if (detacheIci) cout += couts.mobilisationDetache / 2;

    return cout;
  }

  // --- admissibilite vis-a-vis des regles dures -----------------------------

  /** Regles dures susceptibles d'etre affectees par une modification du creneau. */
  private reglesLiees(creneau: Creneau, educateurId: string): Regle[] {
    const jeunes = new Set(creneau.jeunes);
    const groupes = new Set(creneau.jeunes.map((id) => this.ref.jeune(id)?.groupeId).filter(Boolean));
    return this.ref.structure.regles.filter((regle) => {
      if (!regle.actif || !regle.dure) return false;
      const c = regle.cibles;
      return (
        (c.jeunes ?? []).some((id) => jeunes.has(id)) ||
        (c.educateurs ?? []).includes(educateurId) ||
        (c.groupes ?? []).some((id) => groupes.has(id)) ||
        (c.activites ?? []).includes(creneau.activiteId) ||
        (c.salles ?? []).includes(creneau.salleId ?? '')
      );
    });
  }

  private affectationAdmissible(planning: Planning, creneau: Creneau, candidat: Candidat): boolean {
    const regles = this.reglesLiees(creneau, candidat.educateurId);
    if (regles.length === 0) return true;

    const essai = planning.clone();
    if (!essai.creneau(creneau.id)) return false;
    this.applique(
      essai,
      creneau.id,
      candidat.educateurId,
      candidat.liberer.map((c) => c.id),
    );

    return !this.introduitViolationDure(planning, essai, regles);
  }

  /**
   * Un planning en cours de reparation viole deja des regles dures (c'est
   * precisement ce qu'on repare). Le critere n'est donc pas « l'essai est-il
   * irreprochable ? » mais « l'essai ajoute-t-il une violation qui n'existait
   * pas ? ». Sans cela, un planning casse quelque part bloque toute reparation
   * ailleurs.
   */
  private introduitViolationDure(avant: Planning, apres: Planning, regles: readonly Regle[]): boolean {
    const signatures = (planning: Planning): Set<string> => {
      const ctx = this.contexte(planning);
      const vues = new Set<string>();
      for (const regle of regles) {
        for (const v of evaluateurDe(regle.type)?.evalue(regle, ctx) ?? []) {
          // Le compteur suffixe distingue deux violations identiques de la meme regle.
          const cle = `${v.regleId}|${[...v.creneaux].sort().join(',')}|${v.message}`;
          let n = 0;
          while (vues.has(`${cle}#${n}`)) n++;
          vues.add(`${cle}#${n}`);
        }
      }
      return vues;
    };

    const initiales = signatures(avant);
    for (const s of signatures(apres)) if (!initiales.has(s)) return true;
    return false;
  }

  // --- 2. passe d'amelioration ---------------------------------------------

  /**
   * Substitutions simples tant qu'elles font baisser le cout total.
   * Recherche gloutonne : on s'arrete au premier palier, ce qui suffit en
   * pratique sur des plannings de cette taille et garde le resultat explicable.
   */
  ameliore(planning: Planning, changements: Changement[]): void {
    let meilleur = this.coutTotal(planning, changements);

    for (let i = 0; i < this.options.maxIterationsAmelioration; i++) {
      const bilan = evalue(this.contexte(planning));
      const souples = bilan.violations.filter((v) => !v.dure);
      if (souples.length === 0) return;

      const mouvement = this.chercheSubstitution(planning, changements, souples, meilleur);
      if (!mouvement) return;

      meilleur = mouvement;
    }
  }

  private chercheSubstitution(
    planning: Planning,
    changements: Changement[],
    souples: readonly Violation[],
    coutActuel: number,
  ): number | null {
    const creneauxVises = new Set(souples.flatMap((v) => v.creneaux));

    for (const creneauId of creneauxVises) {
      const creneau = planning.creneau(creneauId);
      if (!creneau || estFige(creneau)) continue;

      for (const sortant of [...creneau.educateurs]) {
        for (const entrant of this.ref.structure.educateurs) {
          if (entrant.id === sortant || creneau.educateurs.includes(entrant.id)) continue;
          const pas = pasDuCreneau(creneau);
          if (!this.dispo.libreSur(entrant.id, pas, planning)) continue;

          const essai = planning.clone();
          const cible = essai.creneau(creneauId);
          if (!cible) continue;
          cible.educateurs = cible.educateurs.map((id) => (id === sortant ? entrant.id : id));
          // L'entrant reprend les binomes du sortant : sans ca la substitution
          // laisse les jeunes du sortant sans referent nomme.
          cible.affectations = remplaceEducateurDansBinomes(cible.affectations, sortant, entrant.id);
          essai.invalide();

          const essaiChangements = [
            ...changements,
            {
              action: 'ajout' as const,
              creneauId,
              educateurId: entrant.id,
              cout: this.coutCandidat(entrant.id, cible, []) ?? Number.POSITIVE_INFINITY,
              motif: `substitution de ${sortant}`,
            },
          ];
          const cout = this.coutTotal(essai, essaiChangements);
          const reglesDures = this.reglesLiees(cible, entrant.id);
          if (cout < coutActuel && !this.introduitViolationDure(planning, essai, reglesDures)) {
            creneau.educateurs = cible.educateurs;
            creneau.affectations = cible.affectations;
            planning.invalide();
            changements.push(essaiChangements[essaiChangements.length - 1]!);
            return cout;
          }
        }
      }
    }
    return null;
  }

  private bilanDe(planning: Planning): Bilan {
    return evalue(this.contexte(planning));
  }

  private coutTotal(planning: Planning, changements: readonly Changement[]): number {
    const bilan = this.bilanDe(planning);
    const coutChangements = changements.reduce((t, c) => t + c.cout, 0);
    const deficits = planning.creneaux.reduce((t, c) => t + this.deficit(c), 0);
    return bilan.cout + coutChangements + deficits * this.options.couts.creneauNonResolu;
  }
}

// --------------------------------------------------------------------------

/** Jeunes dont la journee a change entre deux plannings. */
export function jeunesImpactes(avant: Planning, apres: Planning): string[] {
  const empreinte = (planning: Planning, jeuneId: string): string =>
    planning
      .journeeDuJeune(jeuneId)
      .map((c) => `${c.pasDebut}:${c.activiteId}:${c.salleId ?? '-'}:${[...c.educateurs].sort().join('+')}`)
      .join('|');

  const jeunes = new Set([
    ...avant.creneaux.flatMap((c) => c.jeunes),
    ...apres.creneaux.flatMap((c) => c.jeunes),
  ]);
  return [...jeunes].filter((id) => empreinte(avant, id) !== empreinte(apres, id)).sort();
}
