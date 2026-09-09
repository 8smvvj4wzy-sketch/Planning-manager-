/**
 * Les deux JSON Schema, importes comme modules.
 *
 * Ils etaient lus depuis le disque avec `node:fs`, ce qui interdisait tout
 * usage dans un navigateur : l'interface n'aurait pas pu valider un fichier
 * deposé par l'utilisateur. L'import statique fonctionne partout — Node,
 * Vite, n'importe quel bundler — et les fichiers restent a la racine du
 * depot, ou ils demeurent le contrat lisible par n'importe quel outil.
 */

import structure from '../../schemas/structure.schema.json' with { type: 'json' };
import jour from '../../schemas/jour.schema.json' with { type: 'json' };

export const schemaStructure: object = structure;
export const schemaJour: object = jour;

export function schemaDe(nom: 'structure' | 'jour'): object {
  return nom === 'structure' ? schemaStructure : schemaJour;
}
