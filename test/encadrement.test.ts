import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  Referentiel,
  educateursRequis,
  etatJourNominal,
  optionsAvec,
  planningInitial,
  type Structure,
} from '../src/index.ts';
import { structureMinimale } from './aide.ts';

function requis(structure: Structure, options = optionsAvec()): number {
  const ref = new Referentiel(structure);
  const etat = etatJourNominal('lundi');
  const planning = planningInitial(ref, etat);
  const creneau = planning.creneau('c1')!;
  return educateursRequis(ref, etat, creneau, options);
}

describe('calcul de l encadrement requis', () => {
  it('somme les encadrements individuels et arrondit au superieur', () => {
    const s = structureMinimale();
    s.planningType[0]!.jeunes = ['ja', 'jb']; // 1 + 0.33
    assert.equal(requis(s), 2);
  });

  it('ne fait pas basculer trois tiers a 2 par erreur d arrondi flottant', () => {
    const s = structureMinimale();
    s.jeunes[0]!.encadrement = 0.33;
    s.jeunes.push({ ...s.jeunes[1]!, id: 'jc', initiales: 'C.C.' });
    s.planningType[0]!.jeunes = ['ja', 'jb', 'jc']; // 0.33 * 3 = 0.99 en flottant
    assert.equal(requis(s), 1);
  });

  it('respecte educateursRequis de l activite', () => {
    const s = structureMinimale();
    s.activites[0]!.educateursRequis = 3;
    s.planningType[0]!.jeunes = ['ja'];
    assert.equal(requis(s), 3);
  });

  it('applique la surcharge d une regle binome_jeunes', () => {
    const s = structureMinimale();
    s.planningType[0]!.jeunes = ['ja', 'jb'];
    s.regles.push({
      id: 'b1',
      type: 'binome_jeunes',
      dure: false,
      poids: 60,
      actif: true,
      cibles: { jeunes: ['ja', 'jb'] },
      params: { educateursRequis: 1 },
      commentaire: 'test',
    });
    assert.equal(requis(s), 1);
  });

  it('n applique pas la surcharge binome si un tiers est present', () => {
    const s = structureMinimale();
    s.jeunes.push({ ...s.jeunes[1]!, id: 'jc', initiales: 'C.C.' });
    s.planningType[0]!.jeunes = ['ja', 'jb', 'jc'];
    s.regles.push({
      id: 'b1',
      type: 'binome_jeunes',
      dure: false,
      poids: 60,
      actif: true,
      cibles: { jeunes: ['ja', 'jb'] },
      params: { educateursRequis: 1 },
      commentaire: 'test',
    });
    assert.equal(requis(s), 2); // 1 + 0.33 + 0.33
  });

  it('bascule sur un ratio par groupe en mode ratioGroupe', () => {
    const s = structureMinimale();
    s.jeunes.push({ ...s.jeunes[1]!, id: 'jc', initiales: 'C.C.' });
    s.jeunes.push({ ...s.jeunes[1]!, id: 'jd', initiales: 'D.D.' });
    s.planningType[0]!.jeunes = ['ja', 'jb', 'jc', 'jd'];
    s.regles.push({
      id: 't1',
      type: 'taux_encadrement',
      dure: true,
      actif: true,
      cibles: { groupes: ['ga'] },
      params: { ratioJeunesParEduc: 4 },
      commentaire: 'test',
    });
    assert.equal(requis(s, optionsAvec({ encadrement: 'ratioGroupe' })), 1); // 4 jeunes / ratio 4
    assert.equal(requis(s), 2); // mode individuel : 1 + 0.33 * 3 = 1.99, arrondi a 2
  });

  it('ne demande aucun educateur quand plus aucun jeune n est present', () => {
    const s = structureMinimale();
    s.jeunes[0]!.presence = {};
    assert.equal(requis(s), 0);
  });
});
