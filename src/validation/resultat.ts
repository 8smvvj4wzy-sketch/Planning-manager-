/** Resultat commun a toutes les validations. */

export type Gravite = 'erreur' | 'avertissement';

export interface Probleme {
  gravite: Gravite;
  /** Code stable, utilisable par l'interface pour proposer une correction. */
  code: string;
  /** Chemin JSON Pointer vers l'endroit fautif, ex. "/planningType/3/educateurs". */
  chemin: string;
  message: string;
}

export interface Resultat {
  valide: boolean;
  problemes: Probleme[];
}

export function erreur(code: string, chemin: string, message: string): Probleme {
  return { gravite: 'erreur', code, chemin, message };
}

export function avertissement(code: string, chemin: string, message: string): Probleme {
  return { gravite: 'avertissement', code, chemin, message };
}

export function agrege(problemes: Probleme[]): Resultat {
  return { valide: !problemes.some((p) => p.gravite === 'erreur'), problemes };
}

/** Rendu texte compact, pour la CLI et les messages d'erreur. */
export function formate(resultat: Resultat): string {
  if (resultat.problemes.length === 0) return 'Aucun probleme.';
  return resultat.problemes
    .map((p) => `${p.gravite === 'erreur' ? 'ERREUR' : 'AVERT.'} ${p.chemin} [${p.code}] ${p.message}`)
    .join('\n');
}
