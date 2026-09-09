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

/** Deux jours côte à côte — le cas qui a cassé sur le premier fichier réel. */
const LUNDI_MARDI = [
  ['', 'Lundi', '', 'Mardi', ''],
  ['9h30', 'Accueil :\nOnyx / Wren', '', 'Sport :\nSable + Pike / Lumen', ''],
  ['10h', '', '', '', ''],
  ['10h30', '', '', '', ''],
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
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    assert.equal(structure.grille.pasMinutes, 30); // pas de borne fine dans cet exemple
    assert.deepEqual(structure.grille.jours, ['vendredi']);
  });

  it('construit les binômes en affectations', () => {
    const { structure } = assemble(lu, {
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
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    assert.ok(problemes.some((p) => p.code === 'import.creneau' && p.message.includes('Repas')));
  });

  it('replie un couloir jamais réutilisé sur le prochain créneau, pas sur la fin de journée', () => {
    // « Protocole » (col2, 9h30) ne réapparaît plus dans son couloir pour le
    // reste du fichier, alors que d'autres couloirs continuent (Mand à
    // 10h30, Repas à 11h) : sa durée se replie sur le pas de grille suivant
    // (1 pas de 30 min), pas sur la fermeture de journée (4 pas) — ce qui
    // évite de le faire chevaucher artificiellement Mand et Repas.
    const { structure, problemes } = assemble(lu, {
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    const protocole = structure.planningType.find((c) => {
      const nom = structure.activites.find((a) => a.id === c.activiteId)?.nom;
      return nom === 'Protocole';
    })!;
    assert.equal(protocole.pas, 1);
    assert.ok(
      problemes.some((p) => p.code === 'import.duree-incertaine' && p.message.includes('Protocole')),
    );

    const resultat = valideStructure(structure);
    assert.deepEqual(
      resultat.problemes.filter((p) => p.gravite === 'erreur' && p.code === 'creneau.chevauchement'),
      [],
      'aucun chevauchement artificiel introduit par le repli de durée',
    );
  });

  it('ignore un nom classé "ignorer" sans planter', () => {
    const c2 = correspondances.map((x) => (x.nom === 'Pike' ? { ...x, cible: 'ignorer' as const } : x));
    const { structure } = assemble(lu, {
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

    const { structure } = assemble(lu, { base: s, correspondances });

    assert.ok(structure.planningType.some((c) => c.jour === 'lundi'), 'le lundi existant survit');
    assert.ok(structure.planningType.some((c) => c.jour === 'vendredi'), 'le vendredi est ajouté');
    assert.deepEqual(structure.grille.jours.sort(), ['lundi', 'vendredi']);
  });

  it('remplace les créneaux du jour plutôt que de les cumuler à une seconde importation', () => {
    const s = structureMinimale();
    const ref = new Referentiel(s);
    const lu = litPlanning(VENDREDI);
    const correspondances = proposeCorrespondances(ref, nomsRencontres(lu));

    const premier = assemble(lu, { base: s, correspondances }).structure;
    const deuxieme = assemble(lu, { base: premier, correspondances }).structure;

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

    const { structure } = assemble(lu, { base: s, correspondances });
    const onyx = structure.jeunes.find((j) => j.id === 'ja')!;
    assert.ok(onyx.presence.lundi, 'la présence du lundi n’a pas disparu');
    assert.ok(onyx.presence.vendredi, 'le vendredi a été ajouté');
  });
});

/* ==================== Plusieurs jours en une seule passe ====================
   Régression directe du bug relevé sur le premier fichier réel : tous les
   jours d'un même fichier collé finissaient étiquetés sous le seul premier
   titre trouvé. */

describe('assemblage de plusieurs jours en une passe', () => {
  const lu = litPlanning(LUNDI_MARDI);
  const correspondances = proposeCorrespondances(null, nomsRencontres(lu));

  it('place chaque créneau sous son propre jour, pas sous un seul', () => {
    const { structure } = assemble(lu, {
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });

    const parNom = (nom: string) =>
      structure.planningType.find(
        (c) => structure.activites.find((a) => a.id === c.activiteId)?.nom === nom,
      )!;

    assert.equal(parNom('Accueil').jour, 'lundi');
    assert.equal(parNom('Sport').jour, 'mardi');
    assert.deepEqual(structure.grille.jours.sort(), ['lundi', 'mardi']);
  });

  it('construit le produit croisé jeunes × éducateurs d un binôme à plusieurs jeunes', () => {
    // « Sable + Pike / Lumen » : deux jeunes, un seul éducateur — les deux
    // doivent être affectés à Lumen, pas fondus en un seul « jeune » au nom
    // absurde (c'était exactement le bug du fichier réel).
    const { structure } = assemble(lu, {
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });
    const sport = structure.planningType.find(
      (c) => structure.activites.find((a) => a.id === c.activiteId)?.nom === 'Sport',
    )!;
    const lumen = structure.educateurs.find((e) => e.nom === 'Lumen')!;

    // Onyx vient du créneau du lundi (« Accueil : Onyx / Wren »), présent
    // dans la même fixture ; seuls Sable et Pike viennent du binôme groupé.
    assert.deepEqual(
      structure.jeunes.map((j) => j.initiales).sort(),
      ['Onyx', 'Pike', 'Sable'],
    );
    assert.equal(sport.jeunes.length, 2);
    assert.deepEqual(sport.educateurs, [lumen.id]);
    assert.deepEqual(
      sport.affectations?.map((a) => a.educateurId),
      [lumen.id, lumen.id],
      'les deux jeunes sont chacun affectés au même éducateur, pas un seul',
    );
  });

  it('complète une structure existante sur plusieurs jours sans toucher au reste', () => {
    const s = structureMinimale(); // un créneau le lundi déjà présent
    const ref = new Referentiel(s);
    const c = proposeCorrespondances(ref, nomsRencontres(lu));

    const { structure } = assemble(lu, { base: s, correspondances: c });

    // Le lundi et le mardi importés remplacent/complètent ; aucun autre jour
    // de la structure de départ ne bouge (il n'y en avait pas d'autre ici,
    // mais le mécanisme est le même que pour un seul jour).
    assert.ok(structure.planningType.some((cr) => cr.jour === 'mardi'));
    assert.deepEqual(structure.grille.jours.sort(), ['lundi', 'mardi']);
  });
});

describe('résolution d un jour non reconnu (resolutionsJours)', () => {
  const AVEC_JOUR_INCONNU = [
    ['', 'Lundi', '', 'Vendredi (bis)'],
    ['9h30', 'Accueil :\nOnyx / Wren', '', 'Repas'],
    ['10h', '', '', ''],
    ['10h30', '', '', ''],
  ].map((l) => [...l]);

  it('ignore et signale un groupe non résolu quand rien ne le corrige', () => {
    const lu = litPlanning(AVEC_JOUR_INCONNU);
    const correspondances = proposeCorrespondances(null, nomsRencontres(lu));

    const { structure, problemes } = assemble(lu, {
      correspondances,
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });

    assert.ok(!structure.planningType.some((c) => c.activiteId.includes('repas')));
    assert.deepEqual(structure.grille.jours, ['lundi']);
    assert.ok(problemes.some((p) => p.code === 'import.jour-ignore' && p.message.includes('Vendredi (bis)')));
  });

  it('importe le groupe une fois sa résolution fournie', () => {
    const lu = litPlanning(AVEC_JOUR_INCONNU);
    const correspondances = proposeCorrespondances(null, nomsRencontres(lu));

    const { structure } = assemble(lu, {
      correspondances,
      resolutionsJours: { 'Vendredi (bis)': 'vendredi' },
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });

    assert.ok(structure.planningType.some((c) => c.jour === 'vendredi'));
    assert.deepEqual(structure.grille.jours.sort(), ['lundi', 'vendredi']);
  });

  it('respecte un choix explicite d ignorer (null)', () => {
    const lu = litPlanning(AVEC_JOUR_INCONNU);
    const correspondances = proposeCorrespondances(null, nomsRencontres(lu));

    const { structure } = assemble(lu, {
      correspondances,
      resolutionsJours: { 'Vendredi (bis)': null },
      metaDepart: { auteur: 'Test', etablissement: 'IME Test' },
    });

    assert.deepEqual(structure.grille.jours, ['lundi']);
  });
});
