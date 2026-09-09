import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  auditeJourNominal,
  jourDeLaDate,
  optionsAvec,
  repare,
  type FichierJour,
} from '../src/index.ts';
import { jourExemple, referentielExemple } from './aide.ts';

function jour(absences: FichierJour['absences'], extra: Partial<FichierJour> = {}): FichierJour {
  return {
    structureVersion: 7,
    date: '2026-09-14', // un lundi
    absences,
    renfortsDuJour: ['r1'],
    epingles: [],
    ...extra,
  };
}

describe('planning type de reference', () => {
  it('tient debout tel quel, sans absence', () => {
    const ref = referentielExemple();
    for (const j of ['lundi', 'mardi'] as const) {
      const audit = auditeJourNominal(ref, j);
      assert.deepEqual(audit.conflits, [], `conflits le ${j}`);
      assert.deepEqual(
        audit.violations.map((v) => v.message),
        [],
        `violations le ${j}`,
      );
      assert.equal(audit.changements.length, 0, `le moteur ne devrait rien avoir a faire le ${j}`);
    }
  });
});

describe('reparation de la journee exemple', () => {
  const ref = referentielExemple();
  const resultat = repare(ref, jourExemple());

  it('produit une journee admissible', () => {
    assert.deepEqual(resultat.conflits, []);
    assert.deepEqual(resultat.violations.filter((v) => v.dure), []);
    assert.equal(resultat.admissible, true);
  });

  it('remplace bien l educatrice absente', () => {
    assert.ok(resultat.changements.length > 0);
    for (const creneau of resultat.planning.creneaux) {
      assert.ok(!creneau.educateurs.includes('e3'), `${creneau.id} contient encore l absente`);
    }
  });

  it('mobilise le renfort du jour', () => {
    assert.ok(resultat.changements.some((c) => c.educateurId === 'r1'));
  });

  it('respecte le perimetre du renfort, meme sous contrainte', () => {
    for (const creneau of resultat.planning.creneaux) {
      if (!creneau.educateurs.includes('r1')) continue;
      for (const jeuneId of creneau.jeunes) {
        assert.ok(['j3', 'j4', 'j6'].includes(jeuneId), `r1 place aupres de ${jeuneId} sur ${creneau.id}`);
      }
    }
  });

  it('laisse le creneau verrouille intact', () => {
    const avant = resultat.initial.creneau('p110')!;
    const apres = resultat.planning.creneau('p110')!;
    assert.deepEqual(apres.educateurs, avant.educateurs);
    assert.deepEqual(apres.jeunes, avant.jeunes);
  });
});

describe('creneau verrouille', () => {
  it('conserve son educateur meme quand il manque du monde ailleurs', () => {
    const ref = referentielExemple();
    const resultat = repare(ref, jour([{ type: 'educateur', id: 'e3', journee: true }]));
    assert.deepEqual(resultat.planning.creneau('p110')!.educateurs, ['e5']);
  });
});

describe('deplacement d educateur', () => {
  it('redeploie un educateur devenu disponible plutot que de laisser un trou', () => {
    const ref = referentielExemple();
    const resultat = repare(
      ref,
      jour([
        { type: 'educateur', id: 'e3', journee: true },
        { type: 'educateur', id: 'e4', journee: true },
        { type: 'jeune', id: 'j5', journee: true },
      ]),
    );
    const deplacements = resultat.changements.filter((c) => c.action === 'deplacement');
    assert.ok(deplacements.length > 0, 'aucun deplacement alors qu il en fallait');
    assert.ok(resultat.educateursDeplaces.length > 0);
    for (const d of deplacements) assert.ok(d.depuisCreneauId);
  });
});

describe('conflit insoluble', () => {
  it('est signale plutot que resolu au prix d une regle dure', () => {
    const ref = referentielExemple();
    const resultat = repare(
      ref,
      jour(
        ['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => ({ type: 'educateur' as const, id, journee: true })),
      ),
    );
    assert.equal(resultat.admissible, false);
    assert.ok(resultat.conflits.length > 0);
    // Le renfort reste cantonne a son perimetre : la regle dure tient.
    for (const creneau of resultat.planning.creneaux) {
      if (!creneau.educateurs.includes('r1')) continue;
      for (const jeuneId of creneau.jeunes) assert.ok(['j3', 'j4', 'j6'].includes(jeuneId));
    }
  });

  it('chiffre chaque conflit avec le nombre d educateurs manquants', () => {
    const ref = referentielExemple();
    const resultat = repare(ref, jour([{ type: 'educateur', id: 'e1', journee: true }]));
    for (const conflit of resultat.conflits) {
      assert.ok(conflit.manque >= 1);
      assert.ok(conflit.message.includes(conflit.creneauId));
    }
  });
});

describe('absence partielle', () => {
  it('retire l educateur des creneaux qu il ne peut plus couvrir en entier', () => {
    const ref = referentielExemple();
    const resultat = repare(ref, jour([{ type: 'educateur', id: 'e1', debut: '13:30', fin: '16:30' }]));
    // p112 court de 13:00 a 14:00 : le pas 13:30–14:00 est couvert par l absence.
    assert.ok(!resultat.initial.creneau('p112')!.educateurs.includes('e1'));
    // p101, le matin, n est pas concerne.
    assert.ok(resultat.initial.creneau('p101')!.educateurs.includes('e1'));
  });
});

describe('options du moteur', () => {
  it('inverse le bareme selon la priorite retenue', () => {
    const jeunes = optionsAvec({ priorite: 'jeunes' });
    const educateurs = optionsAvec({ priorite: 'educateurs' });
    assert.ok(jeunes.couts.jeuneImpacte > jeunes.couts.educateurDeplace);
    assert.ok(educateurs.couts.educateurDeplace > educateurs.couts.jeuneImpacte);
  });

  it('accepte un bareme sur mesure', () => {
    const options = optionsAvec({ priorite: 'educateurs', couts: { recoursRenfort: 999 } });
    assert.equal(options.couts.recoursRenfort, 999);
    assert.equal(options.couts.educateurDeplace, 100);
  });

  it('en mode detachement "indisponible", n va pas chercher un educateur d un autre batiment', () => {
    const ref = referentielExemple();
    ref.structure.educateurs.find((e) => e.id === 'e4')!.statut = 'autre-batiment';
    const absences = jour([{ type: 'educateur', id: 'e3', journee: true }]);

    const mobilisable = repare(ref, absences, { detachement: 'mobilisable' });
    const indisponible = repare(ref, absences, { detachement: 'indisponible' });

    // Sur le creneau de sport, le renfort est hors perimetre et les titulaires
    // sont pris : Lucas est le seul recours.
    assert.ok(mobilisable.changements.some((c) => c.educateurId === 'e4'));
    assert.deepEqual(mobilisable.conflits, []);

    assert.ok(!indisponible.changements.some((c) => c.educateurId === 'e4'));
    assert.ok(indisponible.conflits.length > 0, 'le renoncement doit se solder par un conflit signale');
  });
});

describe('jourDeLaDate', () => {
  it('lit le jour de la semaine', () => {
    assert.equal(jourDeLaDate('2026-09-14'), 'lundi');
    assert.equal(jourDeLaDate('2026-09-18'), 'vendredi');
    assert.equal(jourDeLaDate('2026-09-20'), 'dimanche');
  });
});
