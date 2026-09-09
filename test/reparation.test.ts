import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  Referentiel,
  auditeJourNominal,
  jourDeLaDate,
  optionsAvec,
  repare,
  type FichierJour,
} from '../src/index.ts';
import { jourExemple, referentielExemple, structureMinimale } from './aide.ts';

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

/* ==================== Binômes ====================
   Quand un créneau nomme ses paires, remplacer un éducateur absent ne suffit
   pas : il faut refaire la paire, sinon le jeune n'a plus de référent nommé et
   les règles en `porte: "binome"` retombent sur le repli sans que personne ne
   l'ait décidé. */

describe('réparation d un créneau apparié', () => {
  function structureAppariee() {
    const s = structureMinimale();
    s.planningType[0]!.affectations = [{ jeuneId: 'ja', educateurId: 'ea' }];
    return s;
  }

  const absenceDeEa = {
    structureVersion: 1,
    date: '2026-09-14', // un lundi
    absences: [{ type: 'educateur' as const, id: 'ea', journee: true }],
  };

  it('rattache le remplaçant au jeune resté sans référent', () => {
    const ref = new Referentiel(structureAppariee());
    const resultat = repare(ref, absenceDeEa);

    assert.deepEqual(resultat.conflits, []);
    const creneau = resultat.planning.creneau('c1')!;
    assert.deepEqual(creneau.educateurs, ['eb'], 'eb remplace ea');
    assert.deepEqual(
      creneau.affectations,
      [{ jeuneId: 'ja', educateurId: 'eb' }],
      'la paire est refaite, pas seulement la liste',
    );
  });

  it('le dit dans le motif du changement', () => {
    const ref = new Referentiel(structureAppariee());
    const resultat = repare(ref, absenceDeEa);
    const ajout = resultat.changements.find((c) => c.educateurId === 'eb')!;
    assert.match(ajout.motif, /reprend A\.A\./);
  });

  it('n invente pas de binôme sur un créneau collectif', () => {
    const s = structureMinimale(); // aucune affectation déclarée
    const ref = new Referentiel(s);
    const resultat = repare(ref, absenceDeEa);
    assert.deepEqual(resultat.planning.creneau('c1')!.affectations, []);
    const ajout = resultat.changements.find((c) => c.educateurId === 'eb')!;
    assert.doesNotMatch(ajout.motif, /reprend/);
  });

  it('ne laisse pas le planning de départ contaminé par l exploration du solveur', () => {
    const ref = new Referentiel(structureAppariee());
    const resultat = repare(ref, absenceDeEa);
    // `initial` est le point de comparaison : ea y est déjà retiré (il est
    // absent), mais aucune paire ne doit y avoir été ajoutée par le solveur.
    assert.deepEqual(resultat.initial.creneau('c1')!.affectations, []);
    assert.deepEqual(resultat.initial.creneau('c1')!.educateurs, []);
  });
});
