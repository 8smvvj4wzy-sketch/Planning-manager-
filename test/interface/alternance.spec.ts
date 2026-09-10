/**
 * L'alternance une semaine sur deux.
 *
 * Le sélecteur « Semaine » n'apparaît QUE si la structure porte des quinzaines
 * (`referentiel.aDesQuinzaines`) : sur un planning hebdomadaire, il n'aurait
 * rien à commuter. Ce parcours vérifie les deux moitiés — qu'il est absent au
 * départ, et qu'il apparaît puis filtre dès qu'un créneau est daté A ou B.
 *
 * Rappel de vocabulaire : le champ du modèle s'appelle `quinzaine`, jamais
 * `semaine` — `Semaine<T>` est déjà pris par l'emploi du temps hebdomadaire.
 * L'écran, lui, dit « semaine A / semaine B », comme le planning d'origine.
 */

import { ajoute, ecran, expect, structureVierge, test } from './aide.ts';

test('le sélecteur de semaine n apparaît qu avec des quinzaines', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi'], debut: '09:00', fin: '12:00' });
  await ecran(page, 'Structure');
  await ajoute(page, 'Ajouter jeune', 'Onyx');
  await ajoute(page, 'Ajouter éducateur', 'Solène');
  await ajoute(page, 'Ajouter activité', 'Accueil');

  await ecran(page, 'Planning');
  const filtre = page.getByRole('combobox', { name: /^Semaine/ });
  await expect(filtre, 'aucune quinzaine, donc aucun sélecteur').toHaveCount(0);

  // Ajouter un créneau OUVRE son détail dans la foulée : inutile de cliquer sur
  // le bloc, qui est de toute façon masqué par la modale. Un `toBeVisible` sur
  // lui passerait quand même — « visible » ne veut pas dire « atteignable ».
  await page.getByRole('button', { name: 'Ajouter un créneau' }).click();
  await expect(page.getByRole('button', { name: 'Fermer' })).toBeVisible();

  // Le détail porte le réglage. « Toutes les semaines » est l'ABSENCE du champ
  // `quinzaine`, pas une troisième valeur.
  //
  // On passe par la modale (`role="dialog"`) parce que le même libellé
  // « Semaine » désigne deux commandes différentes une fois la quinzaine posée :
  // le réglage du créneau et le filtre de la barre d'outils.
  const modale = page.getByRole('dialog', { name: 'Détail du créneau' });
  await modale.getByRole('combobox', { name: /^Semaine/ }).selectOption('A');
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Le filtre de la barre d'outils existe maintenant.
  await expect(filtre).toBeVisible();
  await expect(page.getByRole('button', { name: /Accueil/ }).first()).toBeVisible();

  await filtre.selectOption('B');
  await expect(
    page.getByRole('button', { name: /Accueil/ }),
    'un créneau de semaine A ne se voit pas en semaine B',
  ).toHaveCount(0);

  await filtre.selectOption('A');
  await expect(page.getByRole('button', { name: /Accueil/ }).first()).toBeVisible();
});
