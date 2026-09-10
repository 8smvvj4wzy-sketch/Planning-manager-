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
import type { Heure, PorteRegle, Regle } from '../types.ts';

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

// --- descripteurs : ce qu'un type de regle attend ---------------------------
//
// `valide()` sait deja tout ca, mais a l'etat IMPERATIF, dans le corps d'une
// fonction. L'interface ne peut pas le deviner, et le lui reecrire en dur
// creerait une seconde source de verite — exactement ce que l'architecture de
// ce depot refuse. Les descripteurs disent la meme chose sous forme lisible,
// dans le MEME fichier que l'evaluateur : un seul endroit par type, qui ne peut
// pas deriver de son voisin.
//
// Un descripteur peut malgre tout mentir sur son evaluateur. C'est
// `test/descripteurs.test.ts` qui les tient synchronises, pas la relecture :
// il construit une regle depuis le descripteur et verifie que `valide()`
// l'accepte, puis retire chaque champ declare obligatoire et verifie qu'elle
// la refuse.

/** Table du referentiel qu'un champ `ids` ou une cible designe. */
export type TableCible = 'jeunes' | 'educateurs' | 'salles' | 'activites' | 'groupes';

interface ChampBase {
  /** Cle dans `regle.params`. */
  cle: string;
  libelle: string;
  /** Ce que le champ change, pas ce qu'il contient. Affiche sous le champ. */
  aide?: string;
  /** Absent, `valide()` rend une erreur. */
  obligatoire?: boolean;
}

/**
 * Cinq formes suffisent aux douze types. En ajouter une demande d'ajouter le
 * rendu correspondant dans l'interface — c'est le seul endroit du JSX qui
 * connaisse quelque chose aux regles, et il ne connait que ces formes-la.
 */
export type ChampRegle =
  | (ChampBase & { forme: 'nombre'; min?: number; defaut?: number })
  | (ChampBase & { forme: 'ids'; table: TableCible })
  | (ChampBase & { forme: 'choix'; options: readonly string[]; defaut?: string })
  | (ChampBase & { forme: 'heure'; defaut?: Heure })
  | (ChampBase & { forme: 'texte' });

export interface CiblesAttendues {
  /** Cles acceptees. Plusieurs = « l'une OU l'autre », pas « les deux ». */
  cles: readonly TableCible[];
  /** Nombre minimal d'ids, toutes cles confondues. */
  minimum: number;
}

/**
 * Le champ `porte`, partage par les cinq regles qui mettent en rapport un jeune
 * et un educateur. Ecrit une fois : cinq formulations concurrentes de la meme
 * semantique finiraient par diverger, comme l'auraient fait cinq lectures de
 * `params.porte` avant `educateursSelonPorte`.
 *
 * Le defaut n'est PAS le meme partout et ce n'est pas un oubli : une permission
 * se precise avec la donnee, une interdiction ne se relache pas avec elle.
 * Voir `docs/decisions.md` §6.
 */
export function champPorte(defaut: PorteRegle): ChampRegle {
  return {
    cle: 'porte',
    libelle: 'Portée',
    forme: 'choix',
    options: ['binome', 'presence'],
    defaut,
    aide:
      '« binôme » ne regarde que les éducateurs nommés auprès du jeune ; ' +
      '« présence » regarde tous ceux du créneau. Changer ce réglage change ce que le moteur autorise.',
  };
}

export interface EvaluateurRegle {
  readonly type: string;
  readonly dureParDefaut: boolean;
  /** Libelle lisible du type, pour l'interface. */
  readonly libelle: string;
  /** Ce que la regle fait, en une phrase. */
  readonly resume: string;
  /** Cibles attendues (`regle.cibles`). */
  readonly cibles: CiblesAttendues;
  /** Parametres attendus (`regle.params`). */
  readonly champs: readonly ChampRegle[];
  /**
   * Cles de `params` dont au moins une doit etre renseignee, sous peine
   * d'ERREUR. Absent quand la regle se contente d'un avertissement — ce n'est
   * alors pas la meme exigence, et le descripteur ne doit pas le pretendre.
   */
  readonly auMoinsUn?: readonly string[];
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
