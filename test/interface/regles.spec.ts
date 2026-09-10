/**
 * L'écran Règles — celui qui ne connaît aucune règle.
 *
 * Le formulaire de chaque type est bâti d'après ce que le moteur déclare
 * attendre (`EvaluateurRegle.champs`). Ce parcours le vérifie de l'extérieur :
 * si un descripteur cessait d'être lu, le champ disparaîtrait de l'écran sans
 * qu'aucun test de moteur ne bronche.
 *
 * Il couvre aussi le défaut trouvé à la main au lot 8 : le champ « Poids »
 * survivait au passage en règle dure, parce qu'un spread garde une clé posée à
 * `undefined`. Le build était vert.
 */

import { ecran, expect, structureVierge, test } from './aide.ts';

test('créer une règle, la régler d après son descripteur, la supprimer', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi'] });
  await ecran(page, 'Règles');
  await expect(page.getByText('Aucune règle')).toBeVisible();

  const carteNeuve = page.locator('section').filter({ hasText: 'Nouvelle règle' });
  await carteNeuve.getByLabel('Type').selectOption('rotation_educateur');
  await carteNeuve.getByRole('button', { name: 'Créer' }).click();

  await expect(page.getByText('1 règle(s)')).toBeVisible();

  // Chaque règle est une région nommée par son identifiant : sans ça, le
  // sélecteur attraperait la carte « Nouvelle règle » juste au-dessus, qui
  // porte le même libellé de type dans son option sélectionnée.
  const carte = page.getByRole('group', { name: 'Règle rotation-educateur' });

  // Ces deux champs viennent du descripteur de `rotation_educateur`, pas du
  // JSX. `fenetre` en est la preuve la plus nette : il était lu par le moteur
  // depuis toujours et n'apparaissait NULLE PART, faute d'être déclaré.
  await expect(carte.getByLabel('Changer tous les')).toHaveValue('4');
  await expect(carte.getByLabel('Portée')).toHaveValue('binome');
  await expect(carte.getByLabel('Fenêtre glissante')).toBeVisible();

  await carte.getByLabel('Changer tous les').fill('6');
  await expect(carte.getByLabel('Changer tous les')).toHaveValue('6');

  // Une règle dure n'a pas de poids, et le champ disparaît.
  //
  // Attention à ce que cette assertion prouve : elle teste la CONDITION
  // d'affichage, pas le retrait de la clé. Que `modifieRegle` laisse un
  // `poids: undefined` derrière lui — ce qu'un spread ferait — resterait
  // invisible ici, puisque l'écran masque le champ de toute façon. C'est le
  // test de moteur « retire le poids quand une règle passe de souple à dure »
  // qui tient cette moitié-là. Vérifié en sabotant `modifieRegle` : ce test-ci
  // reste vert, celui du moteur tombe.
  await expect(carte.getByLabel('Poids')).toBeVisible();
  await carte.getByLabel('Nature').selectOption('dure');
  await expect(carte.getByLabel('Poids')).toBeHidden();

  page.once('dialog', (d) => void d.accept());
  await carte.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByText('Aucune règle')).toBeVisible();
});

test('le formulaire suit le type choisi', async ({ page }) => {
  await structureVierge(page, { jours: ['lundi'] });
  await ecran(page, 'Règles');

  const carteNeuve = page.locator('section').filter({ hasText: 'Nouvelle règle' });
  await carteNeuve.getByLabel('Type').selectOption('indisponibilite_recurrente');
  await carteNeuve.getByRole('button', { name: 'Créer' }).click();

  // Trois champs propres à ce type, dont deux heures — aucun n'existe pour
  // `rotation_educateur`. Le JSX ne connaît que cinq FORMES de champ.
  const carte = page.getByRole('group', { name: 'Règle indisponibilite-recurrente' });
  await expect(carte.getByLabel('Jour')).toHaveValue('lundi');
  await expect(carte.getByLabel('De')).toHaveValue('09:00');
  await expect(carte.getByLabel('À')).toHaveValue('12:00');
  await expect(carte.getByLabel('Changer tous les')).toHaveCount(0);
});
