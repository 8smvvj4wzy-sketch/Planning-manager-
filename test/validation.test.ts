import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { valideJour, valideStructure } from '../src/index.ts';
import { jourExemple, referentielExemple, structureExemple, structureMinimale } from './aide.ts';

function codes(problemes: { code: string }[]): string[] {
  return problemes.map((p) => p.code);
}

describe('validation de structure.json', () => {
  it('accepte l exemple de reference sans erreur ni avertissement', () => {
    const resultat = valideStructure(structureExemple());
    assert.deepEqual(resultat.problemes, []);
    assert.equal(resultat.valide, true);
  });

  it('rejette un fichier de forme invalide', () => {
    const structure = structureExemple() as unknown as Record<string, unknown>;
    delete structure['regles'];
    const resultat = valideStructure(structure);
    assert.equal(resultat.valide, false);
    assert.ok(codes(resultat.problemes).some((c) => c.startsWith('schema.')));
  });

  it('refuse une propriete inconnue', () => {
    const structure = structureExemple();
    (structure.meta as unknown as Record<string, unknown>)['inconnu'] = 1;
    const resultat = valideStructure(structure);
    assert.ok(codes(resultat.problemes).includes('schema.additionalProperties'));
  });

  it('detecte les identifiants en double', () => {
    const structure = structureMinimale();
    structure.jeunes.push({ ...structure.jeunes[0]! });
    const resultat = valideStructure(structure);
    assert.ok(codes(resultat.problemes).includes('id.doublon'));
  });

  it('detecte une reference inexistante', () => {
    const structure = structureMinimale();
    structure.planningType[0]!.educateurs = ['fantome'];
    const resultat = valideStructure(structure);
    assert.equal(resultat.valide, false);
    assert.ok(codes(resultat.problemes).includes('reference'));
  });

  it('detecte un creneau non aligne sur la grille', () => {
    const structure = structureMinimale();
    structure.planningType[0]!.debut = '09:15';
    const resultat = valideStructure(structure);
    assert.ok(codes(resultat.problemes).includes('creneau.alignement'));
  });

  it('detecte un creneau qui deborde de la grille', () => {
    const structure = structureMinimale();
    structure.planningType[0]!.debut = '11:30';
    structure.planningType[0]!.pas = 4;
    const resultat = valideStructure(structure);
    assert.ok(codes(resultat.problemes).includes('creneau.hors-grille'));
  });

  it('detecte un educateur present sur deux creneaux simultanes', () => {
    const structure = structureMinimale();
    structure.planningType.push({
      ...structure.planningType[0]!,
      id: 'c2',
      salleId: 'sb',
      jeunes: ['jb'],
    });
    const resultat = valideStructure(structure);
    assert.ok(codes(resultat.problemes).includes('creneau.chevauchement'));
  });

  it('detecte un depassement de capacite de salle', () => {
    const structure = structureMinimale();
    structure.planningType[0]!.salleId = 'sb';
    structure.planningType[0]!.jeunes = ['ja', 'jb'];
    structure.salles[1]!.capacite = 1;
    const resultat = valideStructure(structure);
    assert.ok(codes(resultat.problemes).includes('creneau.capacite'));
  });

  it('signale un type de regle inconnu', () => {
    const structure = structureMinimale();
    structure.regles.push({
      id: 'x1',
      type: 'regle_inventee',
      dure: true,
      actif: true,
      cibles: { jeunes: ['ja'] },
      commentaire: 'test',
    });
    const resultat = valideStructure(structure);
    assert.ok(codes(resultat.problemes).includes('regle.type'));
  });

  it('signale une regle mal parametree', () => {
    const structure = structureMinimale();
    structure.regles.push({
      id: 'x1',
      type: 'educateurs_autorises',
      dure: true,
      actif: true,
      cibles: {},
      params: {},
      commentaire: 'test',
    });
    const resultat = valideStructure(structure);
    assert.ok(codes(resultat.problemes).includes('regle.cibles'));
    assert.ok(codes(resultat.problemes).includes('regle.params'));
  });

  it('avertit sur une regle souple sans poids et sans commentaire', () => {
    const structure = structureMinimale();
    structure.regles.push({
      id: 'x1',
      type: 'binome_jeunes',
      dure: false,
      actif: true,
      cibles: { jeunes: ['ja', 'jb'] },
      params: { educateursRequis: 1 },
    });
    const resultat = valideStructure(structure);
    assert.equal(resultat.valide, true);
    assert.ok(codes(resultat.problemes).includes('regle.poids'));
    assert.ok(codes(resultat.problemes).includes('regle.commentaire'));
  });
});

describe('validation de jour.json', () => {
  it('accepte l exemple de reference', () => {
    const resultat = valideJour(referentielExemple(), jourExemple());
    assert.deepEqual(resultat.problemes, []);
  });

  it('refuse un fichier construit sur une structure perimee', () => {
    const jour = jourExemple();
    jour.structureVersion = 6;
    const resultat = valideJour(referentielExemple(), jour);
    assert.equal(resultat.valide, false);
    assert.ok(codes(resultat.problemes).includes('jour.version'));
  });

  it('refuse une absence a la fois journee et bornee', () => {
    const jour = jourExemple();
    jour.absences.push({ type: 'jeune', id: 'j1', journee: true, debut: '09:00', fin: '10:00' });
    const resultat = valideJour(referentielExemple(), jour);
    assert.equal(resultat.valide, false);
  });

  it('refuse une epingle sur un creneau inexistant', () => {
    const jour = jourExemple();
    jour.epingles = ['p999'];
    const resultat = valideJour(referentielExemple(), jour);
    assert.ok(codes(resultat.problemes).includes('reference'));
  });

  it('avertit si un renfort declare n a pas le statut renfort', () => {
    const jour = jourExemple();
    jour.renfortsDuJour = ['e1'];
    const resultat = valideJour(referentielExemple(), jour);
    assert.ok(codes(resultat.problemes).includes('renfort.statut'));
  });
});
