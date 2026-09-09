import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  Referentiel,
  auditeSemaine,
  comparePeriodes,
  datesDeLaPeriode,
  finDeLaPeriode,
  jourDeLaPeriode,
  reparePeriode,
  validePeriode,
  type FichierPeriode,
} from '../src/index.ts';
import { referentielExemple, structureMinimale } from './aide.ts';

/** Lundi 14 → vendredi 18 septembre 2026. */
function periode(absences: FichierPeriode['absences'], reste: Partial<FichierPeriode> = {}): FichierPeriode {
  return { structureVersion: 7, du: '2026-09-14', absences, renforts: ['r1'], ...reste };
}

describe('bornes de la période', () => {
  const ref = referentielExemple();

  it('court jusqu au lendemain de la dernière absence : le jour du retour à la normale', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15' }]);
    assert.equal(finDeLaPeriode(p), '2026-09-16');
  });

  it('respecte un « au » explicite', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15' }], {
      au: '2026-09-18',
    });
    assert.equal(finDeLaPeriode(p), '2026-09-18');
  });

  it('refuse une absence sans terme sur une période sans terme', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14' }]);
    assert.throws(() => finDeLaPeriode(p), /sans terme/);
  });

  it('accepte une absence sans terme dès que la période est bornée', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14' }], { au: '2026-09-18' });
    assert.equal(finDeLaPeriode(p), '2026-09-18');
  });

  it('ne retient que les jours d accueil de la grille', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-20' }]);
    const dates = datesDeLaPeriode(ref, p);
    // La grille de l'exemple s'arrête au vendredi : samedi 19 et dimanche 20 sautent.
    assert.deepEqual(dates, [
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-21',
    ]);
  });

  it('refuse une période absurdement longue plutôt que de la calculer', () => {
    const p = periode([], { au: '2030-01-01' });
    assert.throws(() => datesDeLaPeriode(ref, p), /verifiez les dates/);
  });
});

describe('projection sur une date', () => {
  it('ne retient que les absences actives ce jour-là', () => {
    const p = periode([
      { type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15' },
      { type: 'jeune', id: 'j5', du: '2026-09-17', au: '2026-09-17' },
    ]);

    assert.deepEqual(jourDeLaPeriode(p, '2026-09-14').absences, [
      { type: 'educateur', id: 'e3', journee: true },
    ]);
    assert.deepEqual(jourDeLaPeriode(p, '2026-09-16').absences, []);
    assert.deepEqual(jourDeLaPeriode(p, '2026-09-17').absences, [
      { type: 'jeune', id: 'j5', journee: true },
    ]);
  });

  it('conserve les heures quand l absence est partielle', () => {
    const p = periode([
      { type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15', debut: '13:30', fin: '16:30' },
    ]);
    assert.deepEqual(jourDeLaPeriode(p, '2026-09-14').absences, [
      { type: 'educateur', id: 'e3', debut: '13:30', fin: '16:30' },
    ]);
  });

  it('reporte les renforts et les épingles sur chaque journée', () => {
    const p = periode([], { au: '2026-09-14', epingles: ['p110'] });
    const jour = jourDeLaPeriode(p, '2026-09-14');
    assert.deepEqual(jour.renfortsDuJour, ['r1']);
    assert.deepEqual(jour.epingles, ['p110']);
  });
});

describe('réparation sur la période', () => {
  const ref = referentielExemple();

  it('produit une journée par jour d accueil', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15' }]);
    const resultat = reparePeriode(ref, p);
    assert.equal(resultat.journees.length, 3); // 14, 15, 16
    assert.deepEqual(
      resultat.journees.map((j) => j.jour),
      ['lundi', 'mardi', 'mercredi'],
    );
  });

  /* Dans l'exemple de référence, seuls lundi et mardi portent des créneaux :
     mercredi, jeudi et vendredi sont des journées vides, donc trivialement
     nominales. C'est correct — rien à faire veut bien dire rien à changer —
     mais il faut le savoir pour lire ces tests, et choisir des jours qui
     portent quelque chose quand on veut éprouver le moteur. */

  it('trouve le retour au fonctionnement initial', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15' }], {
      au: '2026-09-21',
    });
    const resultat = reparePeriode(ref, p);

    const lundi = resultat.journees[0]!;
    assert.equal(lundi.nominale, false, 'e3 manque, il a fallu réparer');
    assert.ok(lundi.reparation.changements.length > 0);

    // Le mercredi, plus personne n'est absent : rien à faire, et plus rien ne
    // bouge jusqu'à la fin de la période.
    assert.equal(resultat.retourNominal, '2026-09-16');

    // Et le lundi suivant, qui porte de vrais créneaux, tourne bien tout seul.
    const lundiSuivant = resultat.journees.at(-1)!;
    assert.equal(lundiSuivant.date, '2026-09-21');
    assert.equal(lundiSuivant.nominale, true);
    assert.ok(lundiSuivant.reparation.planning.creneaux.length > 0);
  });

  it('ne déclare pas le retour sur une accalmie au milieu', () => {
    const p = periode(
      [
        { type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-14' },
        { type: 'educateur', id: 'e3', du: '2026-09-21', au: '2026-09-21' },
      ],
      { au: '2026-09-21' },
    );
    const resultat = reparePeriode(ref, p);

    // Mardi est calme, mais le lundi suivant ne l'est pas : ce n'est pas un
    // retour au fonctionnement initial, seulement une accalmie.
    assert.equal(resultat.journees[1]!.nominale, true);
    assert.equal(resultat.journees.at(-1)!.nominale, false);
    assert.equal(resultat.retourNominal, null);
  });

  it('rend null quand la période s achève sans retour à la normale', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14' }], { au: '2026-09-15' });
    const resultat = reparePeriode(ref, p);
    assert.equal(resultat.journees.length, 2);
    assert.ok(resultat.journees.every((j) => !j.nominale));
    assert.equal(resultat.retourNominal, null);
  });

  it('reste admissible sur l exemple de référence', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15' }]);
    const resultat = reparePeriode(ref, p);
    assert.equal(resultat.admissible, true);
    assert.deepEqual(
      resultat.journees.flatMap((j) => j.reparation.conflits),
      [],
    );
  });
});

describe('analyse à la semaine', () => {
  it('audite tous les jours d accueil de la grille', () => {
    const ref = referentielExemple();
    const audit = auditeSemaine(ref);
    assert.deepEqual(
      audit.journees.map((j) => j.jour),
      ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
    );
    assert.equal(audit.admissible, true);
  });

  it('voit un quota hebdomadaire qu aucune journée isolée ne peut voir', () => {
    const s = structureMinimale();
    // ea sort de son groupe de référence sur un second créneau : 2 pas détachés
    // par jour, sous le plafond journalier, mais au-dessus du plafond de semaine.
    s.groupes.push({ id: 'gb', nom: 'Groupe B', refEducateurs: ['eb'] });
    s.jeunes[1]!.groupeId = 'gb';
    s.grille.jours = ['lundi', 'mardi'];
    s.jeunes[1]!.presence = {
      lundi: { debut: '09:00', fin: '12:00' },
      mardi: { debut: '09:00', fin: '12:00' },
    };
    s.educateurs.forEach((e) => {
      e.disponibilites = {
        lundi: { debut: '09:00', fin: '12:00' },
        mardi: { debut: '09:00', fin: '12:00' },
      };
    });
    for (const jour of ['lundi', 'mardi'] as const) {
      s.planningType.push({
        id: `detache-${jour}`,
        jour,
        debut: '10:00',
        pas: 2,
        activiteId: 'act',
        salleId: 'sb',
        jeunes: ['jb'],
        educateurs: ['ea'],
        verrouille: false,
      });
    }
    s.planningType[0]!.jour = 'lundi';
    s.regles.push({
      id: 'q1',
      type: 'quota_detachement',
      dure: true,
      actif: true,
      cibles: { educateurs: ['ea'] },
      params: { maxPasParJour: 2, maxPasParSemaine: 3 },
      commentaire: 'test',
    });

    const ref = new Referentiel(s);
    const audit = auditeSemaine(ref);

    // Chaque journée respecte le plafond journalier.
    for (const journee of audit.journees) {
      assert.deepEqual(journee.reparation.violations.filter((v) => v.regleId === 'q1'), []);
    }
    // La semaine, non : 4 pas détachés pour un plafond de 3.
    assert.equal(audit.violationsHebdomadaires.length, 1);
    assert.match(audit.violationsHebdomadaires[0]!.message, /semaine/);
    assert.equal(audit.admissible, false);
  });
});

describe('validation d une période', () => {
  const ref = referentielExemple();

  it('accepte une période cohérente', () => {
    const resultat = validePeriode(
      ref,
      periode([{ type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15' }]),
    );
    assert.deepEqual(resultat.problemes, []);
  });

  it('refuse une structure périmée', () => {
    const p = periode([], { structureVersion: 6, au: '2026-09-14' });
    const resultat = validePeriode(ref, p);
    assert.ok(resultat.problemes.some((x) => x.code === 'periode.version'));
  });

  it('refuse une absence sur quelqu un d inconnu', () => {
    const p = periode([{ type: 'educateur', id: 'fantome', du: '2026-09-14', au: '2026-09-15' }]);
    const resultat = validePeriode(ref, p);
    assert.equal(resultat.valide, false);
    assert.ok(resultat.problemes.some((x) => x.code === 'reference'));
  });

  it('refuse un intervalle à l envers', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-15', au: '2026-09-14' }]);
    const resultat = validePeriode(ref, p);
    assert.ok(resultat.problemes.some((x) => x.code === 'absence.intervalle'));
  });

  it('refuse une série sans fin', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14' }]);
    const resultat = validePeriode(ref, p);
    assert.ok(resultat.problemes.some((x) => x.code === 'periode.sans-fin'));
  });

  it('avertit sur une absence entièrement hors de la période', () => {
    const p = periode([{ type: 'educateur', id: 'e3', du: '2026-09-01', au: '2026-09-05' }], {
      au: '2026-09-18',
    });
    const resultat = validePeriode(ref, p);
    assert.equal(resultat.valide, true);
    assert.ok(resultat.problemes.some((x) => x.code === 'absence.hors-periode'));
  });
});

describe('comparaison de deux séries', () => {
  const ref = referentielExemple();
  const situation = periode([{ type: 'educateur', id: 'e3', du: '2026-09-14', au: '2026-09-15' }]);

  it('ne rend rien quand le recalcul redonne le gel', () => {
    const gel = reparePeriode(ref, situation);
    const neuf = reparePeriode(ref, situation);
    assert.deepEqual(comparePeriodes(gel, neuf), []);
  });

  it('repère les créneaux dont la composition a changé', () => {
    const gel = reparePeriode(ref, situation);
    // Le renfort n'est plus mobilisable : le moteur doit se débrouiller
    // autrement, et le planning n'est plus le même.
    const neuf = reparePeriode(ref, { ...situation, renforts: [] });

    const differences = comparePeriodes(gel, neuf);
    assert.ok(differences.length > 0);
    const lundi = differences.find((d) => d.date === '2026-09-14')!;
    assert.ok(lundi.creneauxModifies.length > 0);
    assert.ok(lundi.dansAvant && lundi.dansApres);
  });

  it('signale une journée présente d un seul côté', () => {
    const court = reparePeriode(ref, { ...situation, au: '2026-09-14' });
    const long = reparePeriode(ref, { ...situation, au: '2026-09-15' });

    const differences = comparePeriodes(court, long);
    const ajoutee = differences.find((d) => d.date === '2026-09-15')!;
    assert.equal(ajoutee.dansAvant, false);
    assert.equal(ajoutee.dansApres, true);
    assert.ok(ajoutee.creneauxAjoutes.length > 0);
  });

  it('nomme les jeunes dont la journée a changé', () => {
    const gel = reparePeriode(ref, situation);
    const neuf = reparePeriode(ref, { ...situation, renforts: [] });
    const lundi = comparePeriodes(gel, neuf).find((d) => d.date === '2026-09-14')!;
    assert.ok(lundi.jeunesImpactes.length > 0, 'un changement d’éducateur touche des jeunes');
  });
});
