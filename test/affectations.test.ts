import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  declareDesBinomes,
  educateursAupresDe,
  educateursSelonPorte,
  jeunesSansReferent,
  jeunesSelonPorte,
  rattacheAuxJeunesSansReferent,
  remplaceEducateurDansBinomes,
  retireDesBinomes,
  retireEducateurDesBinomes,
} from '../src/index.ts';

/** Créneau minimal : seules les trois listes comptent pour ces fonctions. */
function creneau(jeunes: string[], educateurs: string[], affectations?: [string, string][]) {
  return {
    jeunes,
    educateurs,
    ...(affectations ? { affectations: affectations.map(([j, e]) => ({ jeuneId: j, educateurId: e })) } : {}),
  };
}

describe('repli quand aucun binôme n est nommé', () => {
  const collectif = creneau(['ja', 'jb'], ['ea', 'eb']);

  it('rend tous les éducateurs du créneau', () => {
    assert.deepEqual(educateursAupresDe(collectif, 'ja'), ['ea', 'eb']);
    assert.equal(declareDesBinomes(collectif), false);
  });

  it('vaut pour les deux portées : sans donnée, rien à affiner', () => {
    assert.deepEqual(educateursSelonPorte(collectif, 'ja', 'binome'), ['ea', 'eb']);
    assert.deepEqual(educateursSelonPorte(collectif, 'ja', 'presence'), ['ea', 'eb']);
  });

  it('ne signale aucun jeune sans référent : la notion ne s applique pas', () => {
    assert.deepEqual(jeunesSansReferent(collectif), []);
  });
});

describe('créneau qui nomme ses binômes', () => {
  const apparie = creneau(['ja', 'jb'], ['ea', 'eb'], [['ja', 'ea'], ['jb', 'eb']]);

  it('suit la paire en portée binôme', () => {
    assert.deepEqual(educateursSelonPorte(apparie, 'ja', 'binome'), ['ea']);
    assert.deepEqual(educateursSelonPorte(apparie, 'jb', 'binome'), ['eb']);
  });

  it('ignore la paire en portée présence', () => {
    assert.deepEqual(educateursSelonPorte(apparie, 'ja', 'presence'), ['ea', 'eb']);
  });

  it('accepte plusieurs accompagnants pour un jeune', () => {
    const trio = creneau(['ja'], ['ea', 'eb'], [['ja', 'ea'], ['ja', 'eb']]);
    assert.deepEqual(educateursSelonPorte(trio, 'ja', 'binome'), ['ea', 'eb']);
  });

  it('rend l ensemble vide pour un éducateur en appui, sans binôme à lui', () => {
    const appui = creneau(['ja'], ['ea', 'eb'], [['ja', 'ea']]);
    assert.deepEqual(jeunesSelonPorte(appui, 'eb', 'binome'), []);
    // ... mais il reste dans la pièce, ce que voit la portée présence.
    assert.deepEqual(jeunesSelonPorte(appui, 'eb', 'presence'), ['ja']);
  });

  it('repère les jeunes laissés sans référent', () => {
    const partiel = creneau(['ja', 'jb'], ['ea'], [['ja', 'ea']]);
    assert.deepEqual(jeunesSansReferent(partiel), ['jb']);
  });
});

describe('entretien des binômes', () => {
  it('retire les paires touchant un absent', () => {
    const paires = [
      { jeuneId: 'ja', educateurId: 'ea' },
      { jeuneId: 'jb', educateurId: 'eb' },
    ];
    assert.deepEqual(retireDesBinomes(paires, new Set(['jb']), new Set()), [
      { jeuneId: 'ja', educateurId: 'ea' },
    ]);
    assert.deepEqual(retireDesBinomes(paires, new Set(), new Set(['ea'])), [
      { jeuneId: 'jb', educateurId: 'eb' },
    ]);
  });

  it('rend une copie, jamais les objets d origine', () => {
    const paires = [{ jeuneId: 'ja', educateurId: 'ea' }];
    const copie = retireDesBinomes(paires, new Set(), new Set());
    assert.notEqual(copie[0], paires[0]);
    assert.deepEqual(copie[0], paires[0]);
  });

  it('retire un éducateur de toutes ses paires', () => {
    const paires = [
      { jeuneId: 'ja', educateurId: 'ea' },
      { jeuneId: 'jb', educateurId: 'ea' },
      { jeuneId: 'jc', educateurId: 'eb' },
    ];
    assert.deepEqual(retireEducateurDesBinomes(paires, 'ea'), [{ jeuneId: 'jc', educateurId: 'eb' }]);
  });

  it('rattache un remplaçant aux seuls jeunes sans référent', () => {
    const partiel = creneau(['ja', 'jb'], ['ea', 'eb'], [['ja', 'ea']]);
    assert.deepEqual(rattacheAuxJeunesSansReferent(partiel, 'eb'), [
      { jeuneId: 'ja', educateurId: 'ea' },
      { jeuneId: 'jb', educateurId: 'eb' },
    ]);
  });

  it('ne transforme pas un collectif en accompagnement nommé', () => {
    const collectif = creneau(['ja', 'jb'], ['ea']);
    assert.deepEqual(rattacheAuxJeunesSansReferent(collectif, 'eb'), []);
  });

  it('transmet les binômes du sortant à l entrant', () => {
    const paires = [
      { jeuneId: 'ja', educateurId: 'ea' },
      { jeuneId: 'jb', educateurId: 'eb' },
    ];
    assert.deepEqual(remplaceEducateurDansBinomes(paires, 'ea', 'ec'), [
      { jeuneId: 'ja', educateurId: 'ec' },
      { jeuneId: 'jb', educateurId: 'eb' },
    ]);
  });

  it('ne crée pas de doublon quand l entrant avait déjà ce jeune', () => {
    const paires = [
      { jeuneId: 'ja', educateurId: 'ea' },
      { jeuneId: 'ja', educateurId: 'eb' },
    ];
    assert.deepEqual(remplaceEducateurDansBinomes(paires, 'ea', 'eb'), [
      { jeuneId: 'ja', educateurId: 'eb' },
    ]);
  });
});
