import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  Referentiel,
  assemble,
  litPlanning,
  nomsRencontres,
  proposeCorrespondances,
  valideStructure,
  type Correspondance,
} from '../src/index.ts';
import { structureMinimale } from './aide.ts';

/* Prénoms inventés — le dépôt est public, voir CLAUDE.md. */
const VENDREDI = [
  ['', 'Vendredi', '', ''],
  ['9h30', 'Accueil :\nOnyx / Wren\nSable / Pike', 'Protocole :\nLumen / Brise', ''],
  ['10h', '', '', ''],
  ['10h30', 'Mand :\nOnyx / Wren', '', ''],
  ['11h', 'Repas', '', ''],
  ['11h30', '', '', ''],
].map((l) => [...l]);

function correspondancesToutJeune(noms: { jeunes: string[]; educateurs: string[] }): Correspondance[] {
  return proposeCorrespondances(null, noms);
}

describe('lien nom → identifiant (proposeCorrespondances)', () => {
  it('propose du neuf pour chaque nom quand rien n existe encore', () => {
    const noms = { jeunes: ['Onyx', 'Sable'], educateurs: ['Wren', 'Pike'] };
    const c = correspondancesToutJeune(noms);
    assert.equal(c.length, 4);
    assert.ok(c.every((x) => !x.existant));
    assert.deepEqual(
      c.filter((x) => x.cible === 'jeune').map((x) => x.nom),
      ['Onyx', 'Sable'],
    );
  });

  it('génère des ids sans collision', () => {
    const c = correspondancesToutJeune({ jeunes: ['Ana', 'Ana-Lou'], educateurs: [] });
    assert.notEqual(c[0]!.id, c[1]!.id);
  });

  it('retrouve un jeune existant par ses initiales, accents et casse ignorés', () => {
    const s = structureMinimale();
    s.jeunes[0]!.initiales = 'Éloi';
    const ref = new Referentiel(s);
    const c = proposeCorrespondances(ref, { jeunes: ['eloi'], educateurs: [] });
    assert.equal(c[0]!.existant, true);
    assert.equal(c[0]!.cible, 'jeune');
    assert.equal(c[0]!.id, 'ja');
  });

  it('retrouve un éducateur existant par son prénom', () => {
    const s = structureMinimale();
    s.educateurs[0]!.prenom = 'Wren';
    const ref = new Referentiel(s);
    const c = proposeCorrespondances(ref, { jeunes: [], educateurs: ['wren'] });
    assert.equal(c[0]!.existant, true);
    assert.equal(c[0]!.id, 'ea');
  });

  it('ne propose pas deux fois un nom présent des deux côtés', () => {
    const c = correspondancesToutJeune({ jeunes: ['Ambiguë'], educateurs: ['Ambiguë'] });
    assert.equal(c.filter((x) => x.nom === 'Ambiguë').length, 1);
  });
});

describe('assemblage depuis zéro', () => {
  const lu = litPlanning(VENDREDI);
  const noms = nomsRencontres(lu);
  const correspondances = proposeCorrespondances(null, noms);

  it('produit une structure valide', () => {
    const { structure, problemes } = assemble(lu, {
      jour: 'vendredi',
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });

    const resultat = valideStructure(structure);
    assert.deepEqual(
      resultat.problemes.filter((p) => p.gravite === 'erreur'),
      [],
      resultat.problemes.map((p) => p.message).join('\n'),
    );
    assert.ok(problemes.length >= 0);
  });

  it('crée les jeunes et éducateurs rencontrés', () => {
    const { structure } = assemble(lu, {
      jour: 'vendredi',
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    // « Protocole : Lumen / Brise » place aussi Lumen côté jeune.
    assert.deepEqual(
      structure.jeunes.map((j) => j.initiales).sort(),
      ['Lumen', 'Onyx', 'Sable'],
    );
    assert.deepEqual(
      structure.educateurs.map((e) => e.nom).sort(),
      ['Brise', 'Pike', 'Wren'],
    );
  });

  it('déduit le pas de grille des bornes du fichier', () => {
    const { structure } = assemble(lu, {
      jour: 'vendredi',
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    assert.equal(structure.grille.pasMinutes, 30); // pas de borne fine dans cet exemple
    assert.deepEqual(structure.grille.jours, ['vendredi']);
  });

  it('construit les binômes en affectations', () => {
    const { structure } = assemble(lu, {
      jour: 'vendredi',
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    const accueil = structure.planningType.find((c) => {
      const nom = structure.activites.find((a) => a.id === c.activiteId)?.nom;
      return nom === 'Accueil';
    })!;
    assert.equal(accueil.jeunes.length, 2);
    assert.equal(accueil.affectations?.length, 2);
  });

  it('signale un créneau sans aucun binôme nommé', () => {
    const { problemes } = assemble(lu, {
      jour: 'vendredi',
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    assert.ok(problemes.some((p) => p.code === 'import.creneau' && p.message.includes('Repas')));
  });

  it('ignore un nom classé "ignorer" sans planter', () => {
    const c2 = correspondances.map((x) => (x.nom === 'Pike' ? { ...x, cible: 'ignorer' as const } : x));
    const { structure } = assemble(lu, {
      jour: 'vendredi',
      correspondances: c2,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    assert.ok(!structure.educateurs.some((e) => e.nom === 'Pike'));
    const mand = structure.planningType.find((c) => {
      const nom = structure.activites.find((a) => a.id === c.activiteId)?.nom;
      return nom === 'Mand';
    })!;
    assert.deepEqual(mand.jeunes, ['onyx']);
  });
});

describe('assemblage qui complète une structure existante', () => {
  it('ajoute le jour sans toucher aux autres', () => {
    const s = structureMinimale(); // porte déjà un créneau le lundi
    const ref = new Referentiel(s);
    const lu = litPlanning(VENDREDI);
    const noms = nomsRencontres(lu);
    const correspondances = proposeCorrespondances(ref, noms);

    const { structure } = assemble(lu, { base: s, jour: 'vendredi', correspondances });

    assert.ok(structure.planningType.some((c) => c.jour === 'lundi'), 'le lundi existant survit');
    assert.ok(structure.planningType.some((c) => c.jour === 'vendredi'), 'le vendredi est ajouté');
    assert.deepEqual(structure.grille.jours.sort(), ['lundi', 'vendredi']);
  });

  it('remplace les créneaux du jour plutôt que de les cumuler à une seconde importation', () => {
    const s = structureMinimale();
    const ref = new Referentiel(s);
    const lu = litPlanning(VENDREDI);
    const correspondances = proposeCorrespondances(ref, nomsRencontres(lu));

    const premier = assemble(lu, { base: s, jour: 'vendredi', correspondances }).structure;
    const deuxieme = assemble(lu, { base: premier, jour: 'vendredi', correspondances }).structure;

    const vendredis1 = premier.planningType.filter((c) => c.jour === 'vendredi').length;
    const vendredis2 = deuxieme.planningType.filter((c) => c.jour === 'vendredi').length;
    assert.equal(vendredis1, vendredis2, 'réimporter le même jour ne duplique pas ses créneaux');
  });

  it('étend la présence d un jeune existant au nouveau jour', () => {
    const s = structureMinimale();
    s.jeunes[0]!.initiales = 'Onyx';
    const ref = new Referentiel(s);
    const lu = litPlanning(VENDREDI);
    const correspondances = proposeCorrespondances(ref, nomsRencontres(lu));

    const { structure } = assemble(lu, { base: s, jour: 'vendredi', correspondances });
    const onyx = structure.jeunes.find((j) => j.id === 'ja')!;
    assert.ok(onyx.presence.lundi, 'la présence du lundi n’a pas disparu');
    assert.ok(onyx.presence.vendredi, 'le vendredi a été ajouté');
  });
});
