import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GrilleTemps, heureEnMinutes, minutesEnHeure, estHeureValide } from '../src/index.ts';

describe('conversions horaires', () => {
  it('convertit dans les deux sens', () => {
    assert.equal(heureEnMinutes('09:30'), 570);
    assert.equal(minutesEnHeure(570), '09:30');
    assert.equal(minutesEnHeure(0), '00:00');
  });

  it('rejette un format invalide', () => {
    assert.equal(estHeureValide('9:30'), false);
    assert.equal(estHeureValide('24:00'), false);
    assert.throws(() => heureEnMinutes('midi'), RangeError);
  });
});

describe('GrilleTemps', () => {
  const grille = new GrilleTemps({
    pasMinutes: 30,
    jours: ['lundi'],
    debut: '09:00',
    fin: '16:30',
    pauses: [{ debut: '12:00', pas: 2, libelle: 'Repas' }],
  });

  it('compte les pas de la journee', () => {
    assert.equal(grille.nbPas, 15);
    assert.equal(grille.heureDePas(0), '09:00');
    assert.equal(grille.heureDePas(14), '16:00');
  });

  it('situe une heure dans la grille', () => {
    assert.equal(grille.pasDeHeure('09:00'), 0);
    assert.equal(grille.pasDeHeure('13:00'), 8);
    assert.equal(grille.estAlignee('09:15'), false);
  });

  it('marque les pas de pause', () => {
    assert.equal(grille.estPause(5), false);
    assert.equal(grille.estPause(6), true);
    assert.equal(grille.estPause(7), true);
    assert.equal(grille.estPause(8), false);
  });

  it('ne retient que les pas entierement couverts par une plage', () => {
    // 09:00–10:15 couvre 09:00–09:30 et 09:30–10:00, pas 10:00–10:30.
    assert.deepEqual(grille.pasDePlage({ debut: '09:00', fin: '10:15' }), [0, 1]);
    assert.equal(grille.plageCouvre({ debut: '09:00', fin: '10:00' }, 1), true);
    assert.equal(grille.plageCouvre({ debut: '09:00', fin: '10:00' }, 2), false);
  });

  it('refuse une grille incoherente', () => {
    assert.throws(
      () => new GrilleTemps({ pasMinutes: 30, jours: ['lundi'], debut: '16:00', fin: '09:00' }),
      RangeError,
    );
  });
});
