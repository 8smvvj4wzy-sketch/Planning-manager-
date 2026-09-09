/**
 * Socle commun a tous les types de regles.
 *
 * Ajouter un *type* de regle = ajouter un fichier dans `catalogue/` et
 * l'enregistrer dans `registre.ts`. Ajouter une *regle* = ajouter une entree
 * dans le tableau `regles` du fichier structure.json, sans toucher au code.
 */

import type { Planning } from '../planning/planning.ts';
import type { Referentiel } from '../referentiel.ts';
import type { EtatJour } from '../moteur/etatJour.ts';
import type { OptionsMoteur } from '../moteur/options.ts';
import type { Probleme } from '../validation/resultat.ts';
import { erreur } from '../validation/resultat.ts';
import type { PorteRegle, Regle } from '../types.ts';

/** Cout attribue a la violation d'une regle dure : doit ecraser tout le reste. */
export const COUT_REGLE_DURE = 1_000_000;

export interface ContexteEvaluation {
  ref: Referentiel;
  planning: Planning;
  etat: EtatJour;
  options: OptionsMoteur;
}

export interface Violation {
  regleId: string;
  type: string;
  dure: boolean;
  /** Cout ajoute a la fonction objectif. */
  cout: number;
  message: string;
  /** Creneaux concernes, pour que l'interface puisse les surligner. */
  creneaux: string[];
  jeunes?: string[];
  educateurs?: string[];
  /** Pas concernes, quand la violation est ponctuelle. */
  pas?: number[];
}

export interface EvaluateurRegle {
  readonly type: string;
  readonly dureParDefaut: boolean;
  /** Verifie que cibles et params sont exploitables. Appele a la validation. */
  valide(regle: Regle, ref: Referentiel): Probleme[];
  /** Liste les violations de cette regle sur un planning donne. */
  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[];
}

export function poidsDe(regle: Regle, options: OptionsMoteur): number {
  if (regle.dure) return COUT_REGLE_DURE;
  return regle.poids ?? options.poidsSoupleParDefaut;
}

export function faitViolation(
  regle: Regle,
  options: OptionsMoteur,
  message: string,
  detail: Partial<Omit<Violation, 'regleId' | 'type' | 'dure' | 'cout' | 'message'>> = {},
  multiplicateur = 1,
): Violation {
  return {
    regleId: regle.id,
    type: regle.type,
    dure: regle.dure,
    cout: poidsDe(regle, options) * multiplicateur,
    message,
    creneaux: detail.creneaux ?? [],
    ...(detail.jeunes ? { jeunes: detail.jeunes } : {}),
    ...(detail.educateurs ? { educateurs: detail.educateurs } : {}),
    ...(detail.pas ? { pas: detail.pas } : {}),
  };
}

// --- aides a la validation des params -------------------------------------

export function chemin(regle: Regle, ref: Referentiel, suffixe = ''): string {
  const index = ref.structure.regles.findIndex((r) => r.id === regle.id);
  return `/regles/${index === -1 ? '?' : index}${suffixe}`;
}

export function litListe(regle: Regle, cle: string): string[] {
  const v = regle.params?.[cle];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function litNombre(regle: Regle, cle: string): number | undefined {
  const v = regle.params?.[cle];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function litTexte(regle: Regle, cle: string): string | undefined {
  const v = regle.params?.[cle];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Sur quoi cette regle se juge. Le defaut est propre a chaque type : voir la
 * table de docs/decisions.md. Changer un defaut change ce que le moteur
 * autorise, ce n'est pas un detail de presentation.
 */
export function litPorte(regle: Regle, defaut: PorteRegle): PorteRegle {
  const valeur = regle.params?.['porte'];
  return valeur === 'presence' || valeur === 'binome' ? valeur : defaut;
}

/** Refuse une valeur de `porte` que personne ne saura interpreter. */
export function exigePorteValide(regle: Regle, ref: Referentiel): Probleme[] {
  const valeur = regle.params?.['porte'];
  if (valeur === undefined || valeur === 'presence' || valeur === 'binome') return [];
  return [
    erreur(
      'regle.porte',
      chemin(regle, ref, '/params/porte'),
      `portee inconnue : ${JSON.stringify(valeur)} (attendu "presence" ou "binome")`,
    ),
  ];
}

export function exigeCibles(
  regle: Regle,
  ref: Referentiel,
  cle: 'jeunes' | 'educateurs' | 'groupes' | 'activites' | 'salles',
  minimum = 1,
): Probleme[] {
  const liste = regle.cibles[cle] ?? [];
  if (liste.length < minimum) {
    return [
      erreur(
        'regle.cibles',
        chemin(regle, ref, '/cibles'),
        `la regle "${regle.type}" attend au moins ${minimum} cible(s) dans "${cle}"`,
      ),
    ];
  }
  return [];
}

export function exigeNombre(regle: Regle, ref: Referentiel, cle: string): Probleme[] {
  if (litNombre(regle, cle) === undefined) {
    return [
      erreur(
        'regle.params',
        chemin(regle, ref, `/params/${cle}`),
        `la regle "${regle.type}" attend un parametre numerique "${cle}"`,
      ),
    ];
  }
  return [];
}

/** Verifie que des ids references existent bien dans le referentiel. */
export function exigeReferences(
  regle: Regle,
  ref: Referentiel,
  ids: readonly string[],
  table: 'jeunes' | 'educateurs' | 'salles' | 'activites' | 'groupes',
  cheminSuffixe: string,
): Probleme[] {
  const source = ref[table] as ReadonlyMap<string, unknown>;
  return ids
    .filter((id) => !source.has(id))
    .map((id) =>
      erreur('regle.reference', chemin(regle, ref, cheminSuffixe), `${table} inconnu : "${id}"`),
    );
}
