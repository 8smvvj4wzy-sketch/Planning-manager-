import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Referentiel, correctifsPour, valideStructure } from '../src/index.ts';
import type { Structure } from '../src/index.ts';
import { structureMinimale } from './aide.ts';

/** Les chevauchements d'une structure, avec leur clé de constat. */
function chevauchements(structure: Structure) {
  return valideStructure(structure).problemes.filter((p) => p.code === 'creneau.chevauchement');
}

/**
 * « ea » anime c1 de 09:00 à 10:00 et c2 de 09:30 à 10:30 : ils se chevauchent
 * d'une demi-heure, et c1 est celui qui commence le plus tôt.
 */
function avecChevauchement(): Structure {
  const s = structureMinimale();
  s.grille.pasMinutes = 30;
  s.planningType.push({
    id: 'c2',
    jour: 'lundi',
    debut: '09:30',
    pas: 2,
    activiteId: 'act',
    salleId: 'sb',
    jeunes: ['jb'],
    educateurs: ['ea'],
    verrouille: false,
  });
  return s;
}

describe('correctifs proposés', () => {
  it('n en propose aucun pour un problème qui n est pas un chevauchement', () => {
    const s = structureMinimale();
    s.planningType[0]!.educateurs = ['fantome'];
    const ref = new Referentiel(s);
    const reference = valideStructure(s).problemes.find((p) => p.code === 'reference')!;

    assert.deepEqual(correctifsPour(ref, reference), [], 'ça se corrige dans l’éditeur');
  });

  it('propose de raccourcir, de retirer la personne, ou de supprimer', () => {
    const s = avecChevauchement();
    const [probleme] = chevauchements(s);
    const correctifs = correctifsPour(new Referentiel(s), probleme!);

    // Du moins destructeur au plus : c'est l'ordre qui porte le conseil.
    assert.deepEqual(
      correctifs.map((c) => c.id),
      ['raccourcir-c1', 'retirer-c2', 'retirer-c1', 'supprimer-c2', 'supprimer-c1'],
    );
    assert.match(correctifs[0]!.libelle, /Arreter .* a 09:30/);
    assert.match(correctifs[1]!.libelle, /Retirer Aa /);
  });

  it('CHAQUE correctif proposé fait bien disparaître le conflit', () => {
    // C'est l'assertion qui compte : un libellé peut être joli et le correctif
    // ne rien régler. On applique, on revalide, et cette collision-là doit
    // avoir disparu.
    const s = avecChevauchement();
    const [probleme] = chevauchements(s);
    const ref = new Referentiel(s);

    const correctifs = correctifsPour(ref, probleme!);
    assert.ok(correctifs.length >= 3);

    for (const correctif of correctifs) {
      const apres = correctif.applique(s);
      const restants = chevauchements(apres).map((p) => p.cle);
      assert.ok(
        !restants.includes(probleme!.cle),
        `« ${correctif.libelle} » laisse le conflit en place`,
      );
      assert.deepEqual(
        valideStructure(apres).problemes.filter((p) => p.gravite === 'erreur' && p.code !== 'creneau.chevauchement'),
        [],
        `« ${correctif.libelle} » casse autre chose`,
      );
    }
  });

  it('ne propose pas de raccourcir deux créneaux qui commencent ensemble', () => {
    // Il n'y a rien à rogner : les raccourcir ne les séparerait pas.
    const s = avecChevauchement();
    s.planningType[1]!.debut = '09:00';
    const [probleme] = chevauchements(s);
    const ids = correctifsPour(new Referentiel(s), probleme!).map((c) => c.id);

    assert.ok(!ids.some((id) => id.startsWith('raccourcir')));
    assert.ok(ids.some((id) => id.startsWith('retirer')));
  });

  it('propose de libérer la salle plutôt que de retirer quelqu un', () => {
    const s = avecChevauchement();
    s.planningType[1]!.salleId = 'sa'; // la même que c1
    const salle = chevauchements(s).find((p) => p.message.includes('salle'))!;
    const correctifs = correctifsPour(new Referentiel(s), salle);

    assert.ok(correctifs.some((c) => c.id.startsWith('liberer')));
    assert.equal(correctifs.find((c) => c.id === 'liberer-c2')!.applique(s).planningType[1]!.salleId, null);
  });

  it('dit ce qu une suppression emporte avec elle', () => {
    const s = avecChevauchement();
    const [probleme] = chevauchements(s);
    const suppression = correctifsPour(new Referentiel(s), probleme!).find((c) => c.id === 'supprimer-c2')!;

    assert.match(suppression.explication, /1 jeune\(s\) et 1 educateur\(s\)/);
  });

  it('ne propose rien quand un des deux créneaux a déjà disparu', () => {
    // Le cas d'un correctif applique deux fois : la liste est vide, elle ne lève pas.
    const s = avecChevauchement();
    const [probleme] = chevauchements(s);
    const apres = correctifsPour(new Referentiel(s), probleme!)
      .find((c) => c.id === 'supprimer-c2')!
      .applique(s);

    assert.deepEqual(correctifsPour(new Referentiel(apres), probleme!), []);
  });
});
