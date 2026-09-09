/**
 * Point d'entree de la validation : forme (JSON Schema) puis coherence.
 * La coherence n'est evaluee que si la forme est correcte — sinon les messages
 * seraient du bruit.
 */

import { Referentiel } from '../referentiel.ts';
import type { FichierJour, Structure } from '../types.ts';
import { verifieCoherenceJour, verifieCoherenceStructure } from './coherence.ts';
import { valideFormeJour, valideFormeStructure } from './schema.ts';
import { agrege, type Resultat } from './resultat.ts';

export { formate, type Gravite, type Probleme, type Resultat } from './resultat.ts';
export { verifieCoherenceJour, verifieCoherenceStructure } from './coherence.ts';

/** Valide un `structure.json` fraichement lu (forme + coherence). */
export function valideStructure(donnees: unknown): Resultat {
  const forme = valideFormeStructure(donnees);
  if (forme.length > 0) return agrege(forme);
  return agrege(verifieCoherenceStructure(donnees as Structure));
}

/** Valide un `jour.json` face a une structure deja chargee. */
export function valideJour(ref: Referentiel, donnees: unknown): Resultat {
  const forme = valideFormeJour(donnees);
  if (forme.length > 0) return agrege(forme);
  return agrege(verifieCoherenceJour(ref, donnees as FichierJour));
}

/**
 * Charge une structure validee. Leve si le fichier comporte des erreurs :
 * les avertissements, eux, sont retournes a l'appelant.
 */
export function chargeStructure(donnees: unknown): { ref: Referentiel; resultat: Resultat } {
  const resultat = valideStructure(donnees);
  if (!resultat.valide) {
    const details = resultat.problemes
      .filter((p) => p.gravite === 'erreur')
      .map((p) => `  ${p.chemin} : ${p.message}`)
      .join('\n');
    throw new Error(`structure.json invalide :\n${details}`);
  }
  return { ref: new Referentiel(donnees as Structure), resultat };
}
