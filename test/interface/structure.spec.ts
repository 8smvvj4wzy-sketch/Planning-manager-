/**
 * L'écran Structure — les champs ajoutés au lot 9.
 *
 * Ce fichier existe surtout pour un défaut précis : la carte Groupes affichait
 * l'effectif dans un `<input number>` que RIEN n'écoutait. On pouvait le
 * changer, il ne se passait rien, et aucun contrôle ne le voyait — ni le
 * typecheck, ni les tests de moteur, ni le build. Un champ modifiable sans
 * effet est pire que pas de champ.
 */

import { ajoute, ecran, expect, structureVierge, test } from './aide.ts';

test('l effectif d un groupe se lit, il ne se saisit pas', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi'] });
  await ecran(page, 'Structure');
  await ajoute(page, 'Ajouter jeune', 'Onyx');
  await ajoute(page, 'Ajouter groupe', 'Groupe A');

  // L'effectif se déduit de `jeune.groupeId`. Deux endroits pour la même
  // information finiraient par se contredire : il n'y a donc AUCUNE commande
  // pour l'éditer ici.
  await expect(page.getByText('0 jeune(s)')).toBeVisible();
  await expect(
    page.getByRole('spinbutton', { name: /Jeunes de Groupe A/ }),
    'un champ modifiable sans effet est pire que pas de champ',
  ).toHaveCount(0);

  // Il suit le rattachement, lui, et seulement lui.
  // « Groupe » nomme aussi la carte Groupes et son formulaire d’ajout : on
  // vise le combobox du détail du jeune, pas les autres.
  await page.getByRole('button', { name: 'Détails de Onyx' }).click();
  await page.getByRole('combobox', { name: 'Groupe', exact: true }).selectOption({ label: 'Groupe A' });
  await expect(page.getByText('1 jeune(s)')).toBeVisible();
});

test('les tags d une salle, et les pauses de la grille', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi'], debut: '09:00', fin: '12:00' });
  await ecran(page, 'Structure');
  await ajoute(page, 'Ajouter salle', 'Salle bleue');

  await page.getByRole('button', { name: 'Détails de Salle bleue' }).click();
  const tag = page.getByRole('textbox', { name: 'Ajouter un tag' });
  await tag.fill('sensoriel');
  await tag.press('Enter');
  await expect(page.getByText('sensoriel')).toBeVisible();

  // Sans un endroit pour saisir les pauses, le correctif du lot 7 — le moteur
  // n'affecte personne et ne réclame aucun encadrement pendant une pause —
  // restait inatteignable pour un planning construit à la main.
  await expect(page.getByText('Aucune pause')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une pause' }).click();
  await expect(page.getByRole('textbox', { name: 'Nom de la pause 1' })).toHaveValue('Repas');

  // Une pause de durée nulle ne couvrirait aucun pas tout en ayant l'air posée.
  const duree = page.getByRole('spinbutton', { name: 'Durée de la pause 1' });
  await duree.fill('0');
  await expect(duree).toHaveValue('1');

  await page.getByRole('button', { name: 'Supprimer la pause 1' }).click();
  await expect(page.getByText('Aucune pause')).toBeVisible();
});
