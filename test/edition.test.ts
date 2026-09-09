import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ajouteCreneau,
  ajouteSalle,
  modifieCreneau,
  modifieSalle,
  retireDuCreneau,
  supprimeCreneau,
  supprimeSalle,
  termineCreneauA,
  valideStructure,
} from '../src/index.ts';
import { structureMinimale } from './aide.ts';

/** Structure minimale + un second créneau qui chevauche le premier sur « ea ». */
function avecChevauchement() {
  const s = structureMinimale();
  s.planningType.push({
    id: 'c2',
    jour: 'lundi',
    debut: '09:00',
    pas: 2,
    activiteId: 'act',
    salleId: 'sb',
    jeunes: ['jb'],
    educateurs: ['ea'],
    verrouille: false,
  });
  return s;
}

describe('édition — ce qui ne doit jamais bouger sous la main', () => {
  it('ne modifie pas la structure de départ', () => {
    const depart = structureMinimale();
    const avant = JSON.stringify(depart);
    modifieCreneau(depart, 'c1', { pas: 4 });
    supprimeCreneau(depart, 'c1');
    assert.equal(JSON.stringify(depart), avant, 'l’appelant garde sa structure intacte');
  });

  it('refuse un identifiant qui n existe pas, plutôt que de ne rien faire', () => {
    const s = structureMinimale();
    assert.throws(() => modifieCreneau(s, 'fantome', { pas: 1 }), /fantome/);
    assert.throws(() => supprimeCreneau(s, 'fantome'), /fantome/);
    assert.throws(() => supprimeSalle(s, 'fantome'), /fantome/);
  });
});

describe('édition d un créneau', () => {
  it('change la durée sans toucher au reste', () => {
    const s = modifieCreneau(structureMinimale(), 'c1', { pas: 4 });
    const c = s.planningType.find((x) => x.id === 'c1')!;
    assert.equal(c.pas, 4);
    assert.equal(c.debut, '09:00');
    assert.deepEqual(c.jeunes, ['ja']);
  });

  it('refuse une durée nulle ou négative en la ramenant à un pas', () => {
    const c = modifieCreneau(structureMinimale(), 'c1', { pas: 0 }).planningType[0]!;
    assert.equal(c.pas, 1, 'un créneau qui ne dure rien n’existe pas');
  });

  it('termine un créneau à une heure lue dans la grille', () => {
    // La correction la plus courante d'un chevauchement : « ça doit s'arrêter
    // à 09h30 », pas « ça doit faire un pas ».
    const s = termineCreneauA(structureMinimale(), 'c1', '09:30');
    assert.equal(s.planningType[0]!.pas, 1);
  });

  it('refuse de terminer un créneau avant son début', () => {
    assert.throws(() => termineCreneauA(structureMinimale(), 'c1', '08:00'), /08:00/);
  });

  it('ne garde pas deux fois la même personne', () => {
    const s = modifieCreneau(structureMinimale(), 'c1', { jeunes: ['ja', 'ja', 'jb'] });
    assert.deepEqual(s.planningType[0]!.jeunes, ['ja', 'jb']);
  });
});

describe('édition d un créneau — les binômes suivent les personnes', () => {
  it('retire le binôme d un jeune qu on sort du créneau', () => {
    // Sans ça, le fichier nommerait un binôme sur un jeune absent du créneau :
    // la validation le refuserait juste après une correction qui, à l'écran,
    // avait l'air d'avoir marché.
    const depart = modifieCreneau(structureMinimale(), 'c1', {
      jeunes: ['ja', 'jb'],
      educateurs: ['ea'],
      affectations: [
        { jeuneId: 'ja', educateurId: 'ea' },
        { jeuneId: 'jb', educateurId: 'ea' },
      ],
    });

    const s = retireDuCreneau(depart, 'c1', { type: 'jeune', id: 'jb' });
    const c = s.planningType[0]!;
    assert.deepEqual(c.jeunes, ['ja']);
    assert.deepEqual(c.affectations, [{ jeuneId: 'ja', educateurId: 'ea' }]);
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
  });

  it('retire aussi les binômes d un éducateur qu on sort du créneau', () => {
    const depart = modifieCreneau(structureMinimale(), 'c1', {
      jeunes: ['ja'],
      educateurs: ['ea', 'eb'],
      affectations: [
        { jeuneId: 'ja', educateurId: 'ea' },
        { jeuneId: 'ja', educateurId: 'eb' },
      ],
    });

    const s = retireDuCreneau(depart, 'c1', { type: 'educateur', id: 'ea' });
    assert.deepEqual(s.planningType[0]!.educateurs, ['eb']);
    assert.deepEqual(s.planningType[0]!.affectations, [{ jeuneId: 'ja', educateurId: 'eb' }]);
  });
});

describe('édition — corriger un vrai chevauchement', () => {
  it('en raccourcissant le créneau qui déborde', () => {
    const depart = avecChevauchement();
    const avant = valideStructure(depart).problemes.filter((p) => p.code === 'creneau.chevauchement');
    assert.ok(avant.length > 0, 'la fixture chevauche bien au départ');

    const s = termineCreneauA(depart, 'c2', '10:00');
    const apres = valideStructure(modifieCreneau(s, 'c1', { pas: 2, debut: '10:00' })).problemes.filter(
      (p) => p.code === 'creneau.chevauchement',
    );
    assert.deepEqual(apres, [], 'décaler le second créneau règle la collision');
  });

  it('ou en retirant la personne affectée deux fois', () => {
    const depart = avecChevauchement();
    const s = retireDuCreneau(depart, 'c2', { type: 'educateur', id: 'ea' });
    const apres = valideStructure(s).problemes.filter((p) => p.code === 'creneau.chevauchement');
    assert.deepEqual(apres, []);
  });

  it('ou en supprimant le créneau en trop', () => {
    const s = supprimeCreneau(avecChevauchement(), 'c2');
    assert.equal(s.planningType.length, 1);
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
  });
});

describe('ajout d un créneau', () => {
  it('lui donne un identifiant lisible et sans collision', () => {
    const s = ajouteCreneau(structureMinimale(), {
      jour: 'lundi',
      debut: '10:00',
      pas: 2,
      activiteId: 'act',
      salleId: 'sb',
      jeunes: ['jb'],
      educateurs: ['eb'],
      verrouille: false,
    });
    const ajoute = s.planningType[1]!;
    assert.equal(ajoute.id, 'lundi-10-00-activite', 'même convention que l’import');
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
  });

  it('ne réutilise pas un identifiant déjà pris', () => {
    const creneau = {
      jour: 'lundi' as const,
      debut: '10:00',
      pas: 2,
      activiteId: 'act',
      salleId: null,
      jeunes: [],
      educateurs: [],
      verrouille: false,
    };
    const s = ajouteCreneau(ajouteCreneau(structureMinimale(), creneau), creneau);
    const ids = s.planningType.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('salles — elles se saisissent dans l application', () => {
  it('en ajoute une avec un identifiant tiré de son nom', () => {
    const s = ajouteSalle(structureMinimale(), { nom: 'Salle sensorielle', capacite: 3 });
    const ajoutee = s.salles.find((x) => x.nom === 'Salle sensorielle')!;
    assert.equal(ajoutee.id, 'salle-sensorielle');
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
  });

  it('en modifie une sans toucher aux créneaux qui s y tiennent', () => {
    const s = modifieSalle(structureMinimale(), 'sa', { nom: 'Salle A (rez)', capacite: 8 });
    assert.equal(s.salles[0]!.nom, 'Salle A (rez)');
    assert.equal(s.planningType[0]!.salleId, 'sa');
  });

  it('la retire des créneaux quand on la supprime', () => {
    // Un créneau pointant une salle disparue est une référence cassée : la
    // validation le refuserait, et l'utilisateur n'aurait rien vu venir.
    const s = supprimeSalle(structureMinimale(), 'sa');
    assert.equal(s.planningType[0]!.salleId, null);
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
  });
});
