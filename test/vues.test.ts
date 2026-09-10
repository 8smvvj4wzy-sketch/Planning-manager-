import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bornesDuJour,
  calculDisponibilite,
  couloirsDuJour,
  educateursLibres,
  etatJourNominal,
  jeunesSansAffectation,
  journeeDe,
  plagesDePas,
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

  it('range les créneaux en couloirs d activités simultanées', () => {
    // Le lundi de l'exemple fait tourner quatre activités de front à 9h : il
    // faut quatre couloirs, pas un par jeune (il y en a six) ni un par salle.
    const { parCreneau, nombre } = couloirsDuJour(planning);
    assert.equal(nombre, 4);
    assert.equal(parCreneau.size, planning.creneaux.length);

    // Deux créneaux simultanés ne partagent jamais un couloir.
    const aNeufHeures = planning.creneaux.filter((c) => c.pasDebut === 0);
    assert.equal(new Set(aNeufHeures.map((c) => parCreneau.get(c.id))).size, aNeufHeures.length);

    // Deux créneaux qui se suivent, si : c'est ce qui garde la grille étroite.
    assert.equal(parCreneau.get('p101'), parCreneau.get('p105'));
  });

  it('ne retient comme bornes que les heures où quelque chose change', () => {
    const bornes = bornesDuJour(planning);
    // 15 pas dans la journée, mais seulement 8 moments qui comptent.
    assert.equal(ref.grille.nbPas, 15);
    assert.deepEqual(bornes, [0, 2, 4, 6, 8, 10, 12, 14]);
    assert.equal(ref.grille.heureDePas(bornes[0]!), '09:00');
    assert.equal(ref.grille.heureDePas(bornes[bornes.length - 1]!), '16:00');
  });

  it('rend la journée d un jeune, avec les éducateurs qu il a en face', () => {
    const lignes = journeeDe(planning, { type: 'jeune', id: 'j1' });
    const creneaux = lignes.filter((l) => l.type === 'creneau');
    assert.deepEqual(
      creneaux.map((l) => (l.type === 'creneau' ? l.creneau.id : '')),
      ['p101', 'p106', 'p109', 'p112', 'p116', 'p119'],
      'dans l’ordre de la journée',
    );

    const premier = creneaux[0]!;
    assert.equal(premier.type, 'creneau');
    if (premier.type === 'creneau') {
      // Aucun binôme nommé sur ce créneau : le repli documenté met tous les
      // éducateurs du créneau auprès du jeune.
      assert.deepEqual(premier.enFace, ['e1', 'e2']);
    }
  });

  it('marque le trou entre deux créneaux, jamais les bords de journée', () => {
    const lignes = journeeDe(planning, { type: 'jeune', id: 'j1' });
    const trous = lignes.filter((l) => l.type === 'trou');
    assert.equal(trous.length, 1, 'la pause de midi, et elle seule');
    assert.deepEqual(trous[0], { type: 'trou', pasDebut: 6, pas: 2 });
    assert.equal(lignes[0]!.type, 'creneau', 'pas de trou avant le premier créneau');
    assert.equal(lignes[lignes.length - 1]!.type, 'creneau', 'ni après le dernier');
  });

  it('rend la journée d un éducateur, avec les jeunes en face — le sens inverse', () => {
    const lignes = journeeDe(planning, { type: 'educateur', id: 'e1' });
    const premier = lignes[0]!;
    assert.equal(premier.type, 'creneau');
    if (premier.type === 'creneau') {
      assert.equal(premier.creneau.id, 'p101');
      assert.deepEqual(premier.enFace, ['j1', 'j2']);
    }
  });

  it('rend une journée vide pour quelqu un qui n est sur aucun créneau', () => {
    assert.deepEqual(journeeDe(planning, { type: 'jeune', id: 'inconnu' }), []);
  });

  it('replie des pas isolés en plages continues', () => {
    // Au pas de 5 minutes, deux heures de creux faisaient vingt-quatre entrées
    // pour une seule information.
    assert.deepEqual(plagesDePas([3, 4, 5, 9, 10]), [
      { debut: 3, fin: 6 },
      { debut: 9, fin: 11 },
    ]);
    assert.deepEqual(plagesDePas([7]), [{ debut: 7, fin: 8 }]);
    assert.deepEqual(plagesDePas([]), []);
    assert.deepEqual(plagesDePas([5, 3, 4, 3]), [{ debut: 3, fin: 6 }], 'désordre et doublons compris');
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
