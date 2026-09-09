import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  calculDisponibilite,
  educateursLibres,
  etatJourNominal,
  jeunesSansAffectation,
  planningTypeDuJour,
  sallesLibres,
} from '../src/index.ts';
import { referentielExemple } from './aide.ts';

describe('vues derivees', () => {
  const ref = referentielExemple();
  const etat = etatJourNominal('lundi');
  const planning = planningTypeDuJour(ref, 'lundi');

  it('deduit les salles libres de l occupation, pas par pas', () => {
    const grille = sallesLibres(ref, planning);
    assert.equal(grille.length, ref.grille.nbPas);

    const neufHeures = grille[0]!;
    assert.equal(neufHeures.heure, '09:00');
    assert.deepEqual(neufHeures.libres, ['ext']);
    assert.equal(neufHeures.occupees['s1'], 'p101');

    // Pendant le repas, plus rien n est occupe.
    const repas = grille.find((c) => c.heure === '12:00')!;
    assert.equal(repas.libres.length, ref.structure.salles.length);
  });

  it('liste les educateurs mobilisables et non affectes', () => {
    const dispo = calculDisponibilite(ref, etat);
    const grille = educateursLibres(ref, planning, dispo.mobilisable);

    const dixHeures = grille.find((c) => c.heure === '10:00')!;
    assert.equal(dixHeures.affectes['e3'], 'p105');
    assert.ok(dixHeures.libres.includes('e4'));
    // Le renfort n est pas mobilisable tant qu il n est pas declare dans jour.json.
    assert.ok(!dixHeures.libres.includes('r1'));
  });

  it('repere les jeunes presents mais affectes nulle part', () => {
    const oublies = jeunesSansAffectation(ref, planning, etat);
    assert.deepEqual(oublies, []);

    const ampute = planningTypeDuJour(ref, 'lundi');
    ampute.supprime('p101');
    const apres = jeunesSansAffectation(ref, ampute, etat);
    assert.deepEqual(
      apres.map((o) => o.jeuneId).sort(),
      ['j1', 'j2'],
    );
    assert.deepEqual(apres[0]!.pas, [0, 1]);
  });
});
