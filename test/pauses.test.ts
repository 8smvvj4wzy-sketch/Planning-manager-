/**
 * Les pauses sont des temps communs : le moteur n'y affecte personne et n'y
 * reclame aucun encadrement. Les deux moities vont ensemble — fermer la porte
 * du recrutement sans annuler le besoin ferait de chaque repas un manque
 * impossible a combler, strictement pire que de n'avoir rien fait.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  Referentiel,
  auditeJourNominal,
  calculDisponibilite,
  educateursRequis,
  etatJourNominal,
  optionsAvec,
  planningInitial,
  type Structure,
} from '../src/index.ts';
import { structureMinimale } from './aide.ts';

/**
 * La structure minimale, avec une pause sur les pas 0 et 1 — soit exactement
 * le creneau `c1` (09:00, 2 pas de 30 min).
 */
function avecPauseSurLeCreneau(): Structure {
  const s = structureMinimale();
  s.grille.pauses = [{ debut: '09:00', pas: 2, libelle: 'Repas' }];
  return s;
}

function requis(structure: Structure): number {
  const ref = new Referentiel(structure);
  const etat = etatJourNominal('lundi');
  const planning = planningInitial(ref, etat);
  return educateursRequis(ref, etat, planning.creneau('c1')!, optionsAvec());
}

describe('les pauses ne sont pas encadrees', () => {
  it('ne rend personne mobilisable sur un pas de pause', () => {
    const ref = new Referentiel(avecPauseSurLeCreneau());
    const etat = etatJourNominal('lundi');
    const dispo = calculDisponibilite(ref, etat);

    assert.equal(dispo.mobilisable('ea', 0), false, 'pas 0 : pause');
    assert.equal(dispo.mobilisable('ea', 1), false, 'pas 1 : pause');
    assert.equal(dispo.mobilisable('ea', 2), true, 'pas 2 : hors pause');
  });

  it('ne reclame aucun educateur sur un creneau entierement en pause', () => {
    assert.equal(requis(avecPauseSurLeCreneau()), 0);
    assert.equal(requis(structureMinimale()), 1, 'sans pause, le besoin reste');
  });

  it('n affecte personne sur un creneau de pause, et n en fait pas un conflit', () => {
    // Le resultat observable, celui que l'utilisateur voit : personne place, et
    // pas de ligne rouge. Les deux gardes sont redondantes ICI — retirer l'une
    // ou l'autre laisse ce test vert — et c'est justement la redondance qui
    // rend le comportement solide. Chaque moitie est verrouillee separement par
    // les deux tests precedents ; sans le zero de `educateursRequis`, c'est
    // l'assertion sur les conflits qui tombe.
    const s = avecPauseSurLeCreneau();
    s.planningType[0]!.educateurs = [];
    const audit = auditeJourNominal(new Referentiel(s), 'lundi');

    assert.deepEqual(audit.planning.creneau('c1')!.educateurs, [], 'personne ne doit y etre place');
    assert.deepEqual(audit.conflits, []);
  });

  it('garde le besoin entier d un creneau a cheval sur la pause', () => {
    const s = structureMinimale();
    s.grille.pauses = [{ debut: '09:00', pas: 1, libelle: 'Repas' }]; // le creneau en dure 2
    assert.equal(requis(s), 1);
  });

  it('ne retire pas les educateurs deja inscrits sur un creneau de pause', () => {
    const s = avecPauseSurLeCreneau(); // `c1` porte deja « ea »
    const audit = auditeJourNominal(new Referentiel(s), 'lundi');
    const creneau = audit.planning.creneau('c1')!;
    assert.deepEqual(creneau.educateurs, ['ea']);
  });
});
