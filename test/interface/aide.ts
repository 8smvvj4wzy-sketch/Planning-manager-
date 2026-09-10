/**
 * Utilitaires des tests d'interface.
 *
 * Deux principes, tirés des scripts jetables qui ont trouvé les défauts des
 * lots précédents :
 *
 *  1. **Une erreur console fait échouer la spec.** C'est le filet qui a
 *     rattrapé le plus de choses — un rendu peut « marcher » à l'écran et
 *     hurler dans la console.
 *  2. **Une étape de mise en place AFFIRME l'état qu'elle pose.** Mon premier
 *     script cliquait sur « lundi » et « mardi » pour les activer, alors qu'ils
 *     sont cochés par défaut : il les désactivait, et la suite testait
 *     l'inverse de ce que je croyais, en silence.
 *
 * Jamais de `localStorage.clear()` ici, même si le contexte Playwright est
 * isolé et que ça ne casserait rien : trois applications partagent la même
 * adresse `github.io`, donc le même stockage, et cette borne au préfixe
 * `planning-ime:` est trop coûteuse à réapprendre. Une spec est du code qu'on
 * copie.
 */

import { expect, test as base, type Page } from '@playwright/test';
import { join } from 'node:path';

export const CHEMIN_FIXTURES = join(import.meta.dirname, 'fixtures');

/** Le `test` de base, plus l'échec sur erreur console. */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, utiliser) => {
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(`pageerror : ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') erreurs.push(`console : ${m.text()}`);
    });

    await utiliser(page);

    expect(erreurs, 'la page a signalé des erreurs').toEqual([]);
  },
});

export { expect };

/** Va à l'écran nommé dans la barre latérale. */
export async function ecran(page: Page, nom: string): Promise<void> {
  await page.getByRole('button', { name: nom, exact: true }).click();
}

/**
 * Démarre une structure vierge et **vérifie** les jours obtenus.
 *
 * Les cinq jours sont cochés d'origine : ce sont ceux qu'on ne veut PAS qui se
 * décochent. D'où `joursVoulus` exprimé en résultat attendu, et l'assertion
 * juste après.
 */
export async function structureVierge(
  page: Page,
  options: { jours?: readonly string[]; debut?: string; fin?: string } = {},
): Promise<void> {
  const jours = options.jours ?? ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
  const TOUS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];

  await page.goto('/');
  await page.getByLabel('Auteur').fill('Test');
  await page.getByLabel('Établissement').fill('IME Test');

  for (const jour of TOUS) {
    const bouton = page.getByRole('button', { name: jour, exact: true });
    const coche = (await bouton.getAttribute('aria-pressed')) === 'true';
    if (coche !== jours.includes(jour)) await bouton.click();
  }
  for (const jour of TOUS) {
    await expect(
      page.getByRole('button', { name: jour, exact: true }),
      `« ${jour} » n'est pas dans l'état voulu`,
    ).toHaveAttribute('aria-pressed', String(jours.includes(jour)));
  }

  if (options.debut) await page.getByLabel('Ouverture').fill(options.debut);
  if (options.fin) await page.getByLabel('Fermeture').fill(options.fin);

  await page.getByRole('button', { name: 'Commencer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Structure', exact: true })).toBeVisible();
}

/** Ajoute une entrée dans une carte de l'écran Structure, et l'attend. */
export async function ajoute(page: Page, champ: string, nom: string): Promise<void> {
  const saisie = page.getByRole('textbox', { name: champ });
  await saisie.fill(nom);
  await saisie.press('Enter');
  await expect(page.getByRole('textbox', { name: `Nom de ${nom}` })).toBeVisible();
}

/**
 * Dépose un fichier de tableur dans la zone de dépôt de l'écran Fichiers.
 *
 * Par le vrai `<input type=file>` (caché, `setInputFiles` s'en accommode) et
 * non par un collage : seul un fichier DÉPOSÉ est mémorisé dans les imports
 * récents (`docs/decisions.md` §22), et c'est ce chemin-là qu'on veut couvrir.
 */
export async function deposeTableur(page: Page, fichier: string): Promise<void> {
  const carte = page.locator('div').filter({ hasText: 'ou déposer un fichier CSV/TSV' }).last();
  await carte.locator('input[type=file]').setInputFiles(join(CHEMIN_FIXTURES, fichier));
  await expect(page.getByRole('button', { name: 'Assembler' })).toBeVisible();
}
