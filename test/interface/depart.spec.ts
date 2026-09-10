/**
 * Commencer sans fichier, et saisir dans l'écran Structure.
 *
 * Le premier parcours est celui qui aurait attrapé le trou de présence du
 * lot 7 : un jeune créé avec `presence: {}` était INVISIBLE pour le moteur —
 * aucun encadrement demandé — pendant que la grille l'affichait normalement.
 * `valideStructure` n'y voyait rien à redire. Seul un aller jusqu'à l'écran
 * peut le dire.
 */

import { ajoute, ecran, expect, structureVierge, test } from './aide.ts';

test('commencer un planning sans aucun fichier', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi'], debut: '09:00', fin: '12:00' });

  await ecran(page, 'Structure');
  await ajoute(page, 'Ajouter jeune', 'Onyx');
  await ajoute(page, 'Ajouter éducateur', 'Solène');
  await ajoute(page, 'Ajouter activité', 'Accueil');

  await ecran(page, 'Planning');
  // La grille doit exister avant tout créneau : c'est elle le point d'entrée.
  await expect(page.getByRole('button', { name: 'Ajouter un créneau' })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter un créneau' }).click();

  // L'ajout ouvre le détail du créneau. On le ferme AVANT d'affirmer quoi que
  // ce soit sur la grille : un `toBeVisible` sur un bloc masqué par la modale
  // passerait quand même, et le test ne dirait plus rien.
  await expect(page.getByRole('button', { name: 'Fermer' })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Le créneau créé porte l'activité saisie, et il est CLIQUABLE dans la grille.
  const bloc = page.getByRole('button', { name: /Accueil/ }).first();
  await bloc.click();
  await expect(page.getByRole('button', { name: 'Fermer' })).toBeVisible();
});

test('le détail d une personne pose sa présence, et la retire', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi', 'mardi'], debut: '09:00', fin: '12:00' });
  await ecran(page, 'Structure');
  await ajoute(page, 'Ajouter jeune', 'Onyx');

  // Par défaut, présent tous les jours d'accueil : c'est le correctif du lot 7,
  // et c'est ce que le récapitulatif doit montrer.
  const recap = page.getByRole('row', { name: /Onyx/ });
  await expect(recap).toContainText('lun');
  await expect(recap).toContainText('mar');

  await page.getByRole('button', { name: 'Détails de Onyx' }).click();
  await page.getByRole('checkbox', { name: 'mardi' }).uncheck();

  // La clé DISPARAÎT — elle ne devient pas une plage vide. Sinon le moteur
  // continuerait à compter le jeune ce jour-là sans que l'écran le montre.
  await expect(recap).toContainText('lun');
  await expect(recap).not.toContainText('mar');
  await expect(page.getByText('pas accueilli ce jour')).toBeVisible();
});
