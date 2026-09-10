/**
 * Import d'un tableur, correction d'un chevauchement, fusion de deux classes,
 * reprise d'un fichier mémorisé.
 *
 * La fixture `classe-a.csv` porte un VRAI chevauchement, délibérément : Wren
 * est nommée dans deux couloirs simultanés du lundi (Accueil et Sport). C'est
 * ce qu'un planning réel contient presque toujours, et c'est la raison d'être
 * de `estChargeable` — la forme bloque le chargement, la cohérence non.
 *
 * Prénoms inventés. Le dépôt est public.
 */

import { deposeTableur, ecran, expect, test } from './aide.ts';

/**
 * Dépose, assemble, charge.
 *
 * Auteur et établissement ne sont demandés que quand l'import REMPLACE tout —
 * il n'y a alors aucune structure d'où les tirer, et « Assembler » reste
 * désactivé tant qu'ils manquent. En mode « ajouter », ils viennent de la
 * structure déjà chargée et les champs n'existent pas.
 */
async function importe(page: import('@playwright/test').Page, fichier: string, mode?: string) {
  await ecran(page, 'Fichiers');
  await deposeTableur(page, fichier);

  // L'écran Fichiers porte DEUX champs « Auteur » : celui du départ vierge et
  // celui de l'import. Sans cette portée, le test parlerait au mauvais.
  const carte = page.locator('section').filter({ hasText: 'Importer depuis un' });

  if (mode) await carte.getByLabel('Par rapport à la structure chargée').selectOption(mode);

  const auteur = carte.getByLabel('Auteur');
  if (await auteur.isVisible()) {
    await auteur.fill('Test');
    await carte.getByLabel('Établissement').fill('IME Test');
  }

  await carte.getByRole('button', { name: 'Assembler' }).click();
  await carte.getByRole('button', { name: /Charger/ }).click();
}

test('importer un tableur jusqu à la grille', async ({ page }) => {
  await page.goto('/');
  await importe(page, 'classe-a.csv');

  await ecran(page, 'Planning');

  // La grille ne doit pas être VIDE. C'est le défaut trouvé au lot d'import :
  // l'axe par défaut était « par salle », et un tableur ne nomme jamais de
  // salle — la grille sortait vide sans que rien ne l'explique. Aucun test de
  // moteur ne pouvait le voir.
  await expect(page.getByRole('button', { name: /Accueil/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Sport/ }).first()).toBeVisible();

  // Les cinq noms du fichier sont devenus des personnes.
  await ecran(page, 'Structure');
  for (const nom of ['Onyx', 'Sable', 'Wren', 'Brise', 'Lumen']) {
    await expect(page.getByRole('textbox', { name: `Nom de ${nom}` })).toBeVisible();
  }
});

test('corriger un chevauchement par un correctif proposé', async ({ page }) => {
  await page.goto('/');
  await importe(page, 'classe-a.csv');

  await ecran(page, 'Planning');

  // On s'ancre sur la carte, pas sur le libellé du problème : le message est
  // fait pour être LU, pas pour être analysé — c'est déjà le principe de
  // `Probleme.cle` côté moteur, et un test qui devine sa formulation casserait
  // à la première reformulation sans qu'aucun comportement n'ait changé.
  const carte = page.locator('section').filter({ hasText: /créneau\(x\) à corriger/ });
  await expect(carte, 'le chevauchement doit être signalé').toBeVisible();
  const avant = await carte.getByRole('button', { name: /correctif\(s\)/ }).count();
  expect(avant, 'la fixture porte bien un chevauchement').toBeGreaterThan(0);

  // Le moteur PROPOSE, il ne choisit pas : il ne sait pas laquelle des deux
  // activités compte. Le bouton porte donc un compte, pas une action.
  await carte.getByRole('button', { name: /correctif\(s\)/ }).first().click();
  const issues = carte.locator('button').filter({ hasText: /^(Raccourcir|Retirer|Supprimer)/ });
  await expect(issues.first(), 'au moins une issue proposée').toBeVisible();
  await issues.first().click();

  // Appliquer une issue fait disparaître le constat qu'elle traite.
  await expect(page.getByRole('button', { name: /correctif\(s\)/ })).toHaveCount(avant - 1);
});

test('fusionner deux classes sur les mêmes journées', async ({ page }) => {
  await page.goto('/');
  await importe(page, 'classe-a.csv');
  // « Ajouter » CONSERVE les jours du premier fichier. Sans ce mode, le second
  // import les écraserait — c'est le défaut voulu en réimportant une version
  // corrigée, et exactement ce qu'il ne faut pas pour deux classes.
  await importe(page, 'classe-b.csv', 'ajouter');

  await ecran(page, 'Planning');
  await expect(page.getByRole('button', { name: /Accueil/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Piscine/ }).first()).toBeVisible();

  await ecran(page, 'Structure');
  for (const nom of ['Onyx', 'Givre']) {
    await expect(page.getByRole('textbox', { name: `Nom de ${nom}` })).toBeVisible();
  }
});

test('reprendre un fichier mémorisé', async ({ page }) => {
  await page.goto('/');
  await ecran(page, 'Fichiers');
  await deposeTableur(page, 'classe-a.csv');

  // Seul un fichier DÉPOSÉ est mémorisé : `analyseTexte` tourne aussi à chaque
  // frappe dans la zone de collage, et enregistrer là produirait une entrée par
  // caractère (`docs/decisions.md` §22).
  const memorises = page.getByText('Fichiers importés récemment');
  await expect(memorises).toBeVisible();
  await expect(page.getByText('classe-a.csv')).toBeVisible();

  await page.reload();
  await ecran(page, 'Fichiers');
  await expect(page.getByText('classe-a.csv'), 'le fichier survit au rechargement').toBeVisible();

  await page.getByRole('button', { name: 'Reprendre' }).first().click();
  await expect(page.getByRole('button', { name: 'Assembler' })).toBeVisible();
});
