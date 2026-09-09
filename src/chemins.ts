/**
 * Localisation des fichiers de schema, quelle que soit la forme d'execution
 * (sources TypeScript via le type-stripping de Node, ou build dans `dist/`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let racineCache: string | null = null;

/** Racine du paquet : le premier dossier ancetre contenant `schemas/`. */
export function racinePaquet(): string {
  if (racineCache) return racineCache;
  let dossier = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dossier, 'schemas', 'structure.schema.json'))) {
      racineCache = dossier;
      return dossier;
    }
    const parent = resolve(dossier, '..');
    if (parent === dossier) break;
    dossier = parent;
  }
  throw new Error("Impossible de localiser le dossier 'schemas/' du paquet planning-ime");
}

export function lireSchema(nom: 'structure' | 'jour'): unknown {
  return JSON.parse(readFileSync(join(racinePaquet(), 'schemas', `${nom}.schema.json`), 'utf8'));
}
