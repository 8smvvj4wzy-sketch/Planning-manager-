/**
 * Validation de forme, deleguee au JSON Schema (`schemas/*.schema.json`).
 * Ces fichiers sont le contrat transmissible : l'appli et tout autre outil
 * doivent valider contre eux, pas contre le code TypeScript.
 */

import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import { schemaJour, schemaStructure } from './schemas.ts';
import { erreur, type Probleme } from './resultat.ts';

let ajv: Ajv2020 | null = null;
let valideStructure: ValidateFunction | null = null;
let valideJour: ValidateFunction | null = null;

function instance(): Ajv2020 {
  if (ajv) return ajv;
  ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  ajv.addSchema(schemaStructure);
  ajv.addSchema(schemaJour);
  return ajv;
}

function compile(nom: 'structure' | 'jour'): ValidateFunction {
  const a = instance();
  const id = `https://planning-ime.local/schemas/${nom}.schema.json`;
  const fn = a.getSchema(id);
  if (!fn) throw new Error(`Schema introuvable : ${id}`);
  return fn;
}

function traduit(erreurs: readonly ErrorObject[] | null | undefined): Probleme[] {
  return (erreurs ?? []).map((e) => {
    const chemin = e.instancePath === '' ? '/' : e.instancePath;
    const detail =
      e.keyword === 'additionalProperties'
        ? `propriete inconnue "${(e.params as { additionalProperty?: string }).additionalProperty}"`
        : e.keyword === 'required'
          ? `propriete obligatoire manquante "${(e.params as { missingProperty?: string }).missingProperty}"`
          : `${e.message ?? 'valeur invalide'}`;
    return erreur(`schema.${e.keyword}`, chemin, detail);
  });
}

/** Valide la forme d'un `structure.json` brut (avant tout acces typé). */
export function valideFormeStructure(donnees: unknown): Probleme[] {
  valideStructure ??= compile('structure');
  return valideStructure(donnees) ? [] : traduit(valideStructure.errors);
}

/** Valide la forme d'un `jour.json` brut. */
export function valideFormeJour(donnees: unknown): Probleme[] {
  valideJour ??= compile('jour');
  return valideJour(donnees) ? [] : traduit(valideJour.errors);
}
