/** Utilitaires partages par les tests. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Referentiel, type FichierJour, type Structure } from '../src/index.ts';

const RACINE = join(import.meta.dirname, '..');

export function structureExemple(): Structure {
  return JSON.parse(readFileSync(join(RACINE, 'examples/structure.json'), 'utf8')) as Structure;
}

export function jourExemple(): FichierJour {
  return JSON.parse(readFileSync(join(RACINE, 'examples/jour.json'), 'utf8')) as FichierJour;
}

export function referentielExemple(): Referentiel {
  return new Referentiel(structureExemple());
}

/** Structure minimale : deux jeunes, deux educateurs, une activite, un creneau. */
export function structureMinimale(): Structure {
  return {
    meta: { version: 1, dateModification: '2026-09-09', auteur: 'test', etablissement: 'IME' },
    grille: {
      pasMinutes: 30,
      jours: ['lundi'],
      debut: '09:00',
      fin: '12:00',
      pauses: [],
    },
    salles: [
      { id: 'sa', nom: 'Salle A', capacite: 6, tags: ['classe'] },
      { id: 'sb', nom: 'Salle B', capacite: 2, tags: ['sensoriel'] },
    ],
    groupes: [{ id: 'ga', nom: 'Groupe A', refEducateurs: ['ea'] }],
    jeunes: [
      {
        id: 'ja',
        initiales: 'A.A.',
        groupeId: 'ga',
        encadrement: 1,
        presence: { lundi: { debut: '09:00', fin: '12:00' } },
        actif: true,
      },
      {
        id: 'jb',
        initiales: 'B.B.',
        groupeId: 'ga',
        encadrement: 0.33,
        presence: { lundi: { debut: '09:00', fin: '12:00' } },
        actif: true,
      },
    ],
    educateurs: [
      {
        id: 'ea',
        nom: 'Aa',
        statut: 'titulaire',
        disponibilites: { lundi: { debut: '09:00', fin: '12:00' } },
        detachable: true,
        actif: true,
      },
      {
        id: 'eb',
        nom: 'Bb',
        statut: 'titulaire',
        disponibilites: { lundi: { debut: '09:00', fin: '12:00' } },
        detachable: true,
        actif: true,
      },
    ],
    activites: [{ id: 'act', nom: 'Activite', dureePas: 2, sallesPossibles: ['sa', 'sb'], educateursRequis: null }],
    planningType: [
      {
        id: 'c1',
        jour: 'lundi',
        debut: '09:00',
        pas: 2,
        activiteId: 'act',
        salleId: 'sa',
        jeunes: ['ja'],
        educateurs: ['ea'],
        verrouille: false,
      },
    ],
    regles: [],
  };
}
