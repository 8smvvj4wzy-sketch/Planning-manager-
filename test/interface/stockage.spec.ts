/**
 * Le piège le plus coûteux du dépôt, et le seul que rien ne testait.
 *
 * DatABA, DatABA Manager et cette application partagent la même adresse
 * `github.io`, donc le **même `localStorage`**. Une clé écrite hors du préfixe
 * `planning-ime:` marcherait parfaitement ici et pourrait écraser les données
 * de production des tablettes ; un `clear()` global les effacerait toutes.
 *
 * Aucun test de moteur ne peut voir ça : `src/` ne connaît pas le DOM, et c'est
 * délibéré. Il fallait donc un test qui regarde le vrai stockage d'une vraie
 * page — c'est la seule chose de cette suite qui justifie la lib « DOM », et
 * donc le tsconfig séparé de `test/interface/`.
 *
 * Corollaire vérifié ici aussi : « Vider ce poste » porte la SEULE énumération
 * des clés de l'application. Une clé oubliée dans cette liste survivrait à un
 * vidage sans que personne ne s'en aperçoive.
 */

import { ajoute, ecran, expect, structureVierge, test } from './aide.ts';

const PREFIXE = 'planning-ime:';

/** Toutes les clés du stockage de la page, préfixe compris. */
async function clesDuStockage(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(window.localStorage).sort());
}

test('rien ne s écrit hors du préfixe planning-ime:', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi'] });
  await ecran(page, 'Structure');
  await ajoute(page, 'Ajouter jeune', 'Onyx');
  await ajoute(page, 'Ajouter salle', 'Salle bleue');
  await ecran(page, 'Règles');
  await page.locator('section').filter({ hasText: 'Nouvelle règle' }).getByRole('button', { name: 'Créer' }).click();
  await ecran(page, 'Réglages');

  const cles = await clesDuStockage(page);
  expect(cles.length, 'l’application doit avoir écrit quelque chose').toBeGreaterThan(0);
  expect(
    cles.filter((c) => !c.startsWith(PREFIXE)),
    'une clé hors préfixe écraserait les données de production d’une autre application',
  ).toEqual([]);
});

test('« Vider ce poste » n efface que ce préfixe, et n en oublie aucune clé', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi'] });
  await ecran(page, 'Structure');
  await ajoute(page, 'Ajouter jeune', 'Onyx');

  // Une clé qui appartient à une AUTRE application du même domaine. Elle doit
  // survivre : c'est exactement ce qu'un `localStorage.clear()` détruirait.
  await page.evaluate(() => window.localStorage.setItem('databa:essai', 'ne pas effacer'));

  await ecran(page, 'Réglages');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Vider ce poste' }).click();

  await expect(page.getByRole('button', { name: 'Commencer', exact: true })).toBeVisible();

  const restantes = await clesDuStockage(page);
  expect(restantes, 'la clé de l’autre application doit survivre').toContain('databa:essai');

  // Ce qui reste sous notre préfixe ne peut être que des PRÉFÉRENCES, gardées
  // délibérément (`CLES_PREFERENCES` dans App.jsx). Toute autre clé qui survit
  // est une clé de données oubliée dans `CLES_DONNEES` — et c'est exactement le
  // genre d'oubli que personne ne remarque, puisque tout continue de marcher.
  expect(
    restantes.filter((c) => c.startsWith(PREFIXE)),
    'une clé de données oubliée survivrait à un vidage sans que personne ne le voie',
  ).toEqual([`${PREFIXE}theme`]);
});
