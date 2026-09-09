/**
 * Identifiants stables a partir de noms lus dans un tableur.
 *
 * Le schema exige des ids en `[A-Za-z0-9_-]+`. Un nom saisi a la main peut
 * porter des accents, des espaces, une majuscule — rien de tout ca ne passe.
 */

const DIACRITIQUES = /[̀-ͯ]/g;

/** Casse et accents retires, pour comparer deux noms sans s'y accrocher. */
export function normaliseNom(nom: string): string {
  return nom.normalize('NFD').replace(DIACRITIQUES, '').toLowerCase().trim();
}

export function slugifie(nom: string): string {
  const base = normaliseNom(nom).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base === '' ? 'x' : base;
}

/** Rend un id qui n'entre en collision avec aucun de `existants`. */
export function idUnique(nom: string, existants: ReadonlySet<string>): string {
  const base = slugifie(nom);
  if (!existants.has(base)) return base;
  let n = 2;
  while (existants.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
