/**
 * Point d'entree de la validation : forme (JSON Schema) puis coherence.
 * La coherence n'est evaluee que si la forme est correcte — sinon les messages
 * seraient du bruit.
 */

import { Referentiel } from '../referentiel.ts';
import type { FichierJour, FichierPeriode, Structure } from '../types.ts';
import {
  verifieCoherenceJour,
  verifieCoherencePeriode,
  verifieCoherenceStructure,
} from './coherence.ts';
import { valideFormeJour, valideFormePeriode, valideFormeStructure } from './schema.ts';
import { agrege, type Resultat } from './resultat.ts';

export { formate, type Gravite, type Probleme, type Resultat } from './resultat.ts';
export {
  verifieCoherenceJour,
  verifieCoherencePeriode,
  verifieCoherenceStructure,
} from './coherence.ts';

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

/** Valide un `periode.json` face a une structure deja chargee. */
export function validePeriode(ref: Referentiel, donnees: unknown): Resultat {
  const forme = valideFormePeriode(donnees);
  if (forme.length > 0) return agrege(forme);
  return agrege(verifieCoherencePeriode(ref, donnees as FichierPeriode));
}

/**
 * Un fichier dont la FORME tient peut etre charge, meme s'il porte des erreurs
 * de coherence — et il faut qu'il le puisse.
 *
 * Un planning reel en contient presque toujours : deux activites qui se
 * chevauchent, un educateur nomme a deux endroits a la fois. Ce sont
 * precisement les erreurs qu'on veut voir et corriger DANS l'application ;
 * refuser de charger tant qu'elles restent condamne l'utilisateur a corriger
 * son tableur a l'aveugle, sans jamais voir la grille. C'est exactement ce qui
 * a rendu l'application inutilisable sur le premier fichier reel.
 *
 * La forme, elle, ne se negocie pas : un fichier qui viole le JSON Schema n'a
 * pas les champs sur lesquels le reste de l'application compte (`meta.version`,
 * un `jour` qui est bien un jour). Le charger ne donnerait pas un planning a
 * corriger, mais un ecran blanc et une exception. D'ou la ligne : la forme
 * bloque, la coherence non.
 */
export function estChargeable(resultat: Resultat): boolean {
  return !resultat.problemes.some((p) => p.gravite === 'erreur' && p.code.startsWith('schema.'));
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
