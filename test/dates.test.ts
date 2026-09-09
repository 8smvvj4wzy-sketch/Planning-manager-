import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleSemaineIso, comparerDates, dateDansIntervalle, dateSuivante, estDateValide } from '../src/index.ts';

describe('arithmétique de dates', () => {
  it('avance d un jour', () => {
    assert.equal(dateSuivante('2026-09-14'), '2026-09-15');
    assert.equal(dateSuivante('2026-09-30'), '2026-10-01');
    assert.equal(dateSuivante('2026-12-31'), '2027-01-01');
  });

  it('franchit une année bissextile', () => {
    assert.equal(dateSuivante('2028-02-28'), '2028-02-29');
    assert.equal(dateSuivante('2028-02-29'), '2028-03-01');
    assert.equal(dateSuivante('2027-02-28'), '2027-03-01');
  });

  it('ne se décale pas au changement d heure', () => {
    // Dernier dimanche d'octobre 2026 : en heure locale, +24 h ne suffirait pas
    // à changer de jour civil sur une machine réglée sur l'Europe.
    assert.equal(dateSuivante('2026-10-24'), '2026-10-25');
    assert.equal(dateSuivante('2026-10-25'), '2026-10-26');
    assert.equal(dateSuivante('2026-03-28'), '2026-03-29');
    assert.equal(dateSuivante('2026-03-29'), '2026-03-30');
  });

  it('avance de plusieurs jours d un coup', () => {
    assert.equal(dateSuivante('2026-09-14', 7), '2026-09-21');
    assert.equal(dateSuivante('2026-09-14', -1), '2026-09-13');
  });

  it('ordonne', () => {
    assert.ok(comparerDates('2026-09-14', '2026-09-15') < 0);
    assert.ok(comparerDates('2026-09-15', '2026-09-14') > 0);
    assert.equal(comparerDates('2026-09-14', '2026-09-14'), 0);
  });

  it('situe une date dans un intervalle, bornes comprises', () => {
    assert.equal(dateDansIntervalle('2026-09-14', '2026-09-14', '2026-09-19'), true);
    assert.equal(dateDansIntervalle('2026-09-19', '2026-09-14', '2026-09-19'), true);
    assert.equal(dateDansIntervalle('2026-09-20', '2026-09-14', '2026-09-19'), false);
    assert.equal(dateDansIntervalle('2026-09-13', '2026-09-14', '2026-09-19'), false);
  });

  it('sans borne de fin, l intervalle est ouvert', () => {
    assert.equal(dateDansIntervalle('2030-01-01', '2026-09-14'), true);
  });

  it('rejette une date qui n existe pas', () => {
    assert.equal(estDateValide('2026-02-31'), false);
    assert.equal(estDateValide('2027-02-29'), false);
    assert.equal(estDateValide('2026-13-01'), false);
    assert.equal(estDateValide('14/09/2026'), false);
    assert.equal(estDateValide('2026-09-14'), true);
  });

  it('regroupe par semaine ISO', () => {
    // Lundi 14 et vendredi 18 septembre 2026 sont dans la même semaine.
    assert.equal(cleSemaineIso('2026-09-14'), cleSemaineIso('2026-09-18'));
    // Le lundi suivant ne l'est pas.
    assert.notEqual(cleSemaineIso('2026-09-14'), cleSemaineIso('2026-09-21'));
    // Un dimanche appartient à la semaine qui vient de s'écouler.
    assert.equal(cleSemaineIso('2026-09-20'), cleSemaineIso('2026-09-14'));
  });
});
