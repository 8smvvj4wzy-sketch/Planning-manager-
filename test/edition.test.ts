import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ajouteActivite,
  ajouteCreneau,
  ajouteEducateur,
  ajouteJeune,
  ajouteSalle,
  modifieCreneau,
  modifieJeune,
  modifieSalle,
  retireDuCreneau,
  structureVierge,
  supprimeActivite,
  supprimeCreneau,
  supprimeEducateur,
  supprimeJeune,
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

  it('pose et retire l alternance une semaine sur deux', () => {
    // Retirer demande un sentinel : `undefined` voudrait dire « ne touche pas
    // à ce champ », pas « toutes les semaines ».
    const avec = modifieCreneau(structureMinimale(), 'c1', { quinzaine: 'B' });
    assert.equal(avec.planningType[0]!.quinzaine, 'B');

    const sans = modifieCreneau(avec, 'c1', { quinzaine: null });
    assert.ok(!('quinzaine' in sans.planningType[0]!), 'le champ disparaît, il ne vaut pas null');

    const intact = modifieCreneau(avec, 'c1', { pas: 1 });
    assert.equal(intact.planningType[0]!.quinzaine, 'B', 'un autre changement n’y touche pas');
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

describe('commencer un planning sans tableur', () => {
  it('rend une structure vierge que la validation accepte', () => {
    const s = structureVierge({
      auteur: 'Test',
      etablissement: 'IME Test',
      jours: ['lundi', 'mardi'],
      debut: '09:00',
      fin: '16:30',
      pasMinutes: 30,
    });
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
    assert.deepEqual(s.grille.jours, ['lundi', 'mardi']);
    assert.deepEqual(s.planningType, []);
  });

  it('se remplit à la main, de bout en bout', () => {
    // Le parcours complet de quelqu'un qui n'a aucun fichier : la structure,
    // puis les gens, puis une activité, puis un créneau.
    let s = structureVierge({
      auteur: 'Test',
      etablissement: 'IME Test',
      jours: ['lundi'],
      debut: '09:00',
      fin: '12:00',
      pasMinutes: 30,
    });
    s = ajouteJeune(s, { initiales: 'Onyx', encadrement: 1, presence: {}, actif: true });
    s = ajouteEducateur(s, { nom: 'Wren', statut: 'titulaire', disponibilites: {}, detachable: true, actif: true });
    s = ajouteActivite(s, { nom: 'Accueil', dureePas: 2 });
    s = ajouteCreneau(s, {
      jour: 'lundi',
      debut: '09:00',
      pas: 2,
      activiteId: s.activites[0]!.id,
      salleId: null,
      jeunes: [s.jeunes[0]!.id],
      educateurs: [s.educateurs[0]!.id],
      verrouille: false,
    });

    assert.equal(s.planningType.length, 1);
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
  });
});

describe('jeunes, éducateurs, activités — les références suivent', () => {
  it('supprime un jeune de partout où il est nommé', () => {
    // Un jeune est cité à quatre endroits en plus de sa propre liste. En
    // oublier un rend la structure invalide après un geste sans ambiguïté.
    let s = structureMinimale();
    s.planningType[0]!.jeunes = ['ja', 'jb'];
    s.planningType[0]!.affectations = [
      { jeuneId: 'ja', educateurId: 'ea' },
      { jeuneId: 'jb', educateurId: 'ea' },
    ];
    s.regles.push({
      id: 'r1',
      type: 'educateurs_interdits',
      dure: true,
      actif: true,
      cibles: { jeunes: ['ja', 'jb'] },
      params: { educateurs: ['eb'] },
    });

    s = supprimeJeune(s, 'ja');

    assert.ok(!s.jeunes.some((j) => j.id === 'ja'));
    assert.deepEqual(s.planningType[0]!.jeunes, ['jb']);
    assert.deepEqual(s.planningType[0]!.affectations, [{ jeuneId: 'jb', educateurId: 'ea' }]);
    assert.deepEqual(s.regles[0]!.cibles.jeunes, ['jb']);
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
  });

  it('supprime un éducateur, y compris de la référence de son groupe', () => {
    let s = structureMinimale();
    assert.deepEqual(s.groupes[0]!.refEducateurs, ['ea'], 'la fixture le référence bien');

    s = supprimeEducateur(s, 'ea');

    assert.deepEqual(s.groupes[0]!.refEducateurs, []);
    assert.deepEqual(s.planningType[0]!.educateurs, []);
    assert.deepEqual(valideStructure(s).problemes.filter((p) => p.gravite === 'erreur'), []);
  });

  it('refuse de supprimer une activité encore utilisée, en disant combien', () => {
    // La supprimer voudrait dire supprimer ses créneaux dans la foulée :
    // détruire du travail sans le dire.
    assert.throws(() => supprimeActivite(structureMinimale(), 'act'), /1 creneau/);
  });

  it('accepte de supprimer une activité que plus rien n utilise', () => {
    const s = supprimeActivite(supprimeCreneau(structureMinimale(), 'c1'), 'act');
    assert.deepEqual(s.activites, []);
  });

  it('modifie un jeune sans toucher à ses créneaux', () => {
    const s = modifieJeune(structureMinimale(), 'ja', { initiales: 'Onyx', encadrement: 2 });
    assert.equal(s.jeunes[0]!.initiales, 'Onyx');
    assert.deepEqual(s.planningType[0]!.jeunes, ['ja']);
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
