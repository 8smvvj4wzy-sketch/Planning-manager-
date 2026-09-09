import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyseCellule,
  decodeOctets,
  decoupeTableau,
  devineSeparateur,
  groupePourColonne,
  litPlanning,
  nomsRencontres,
  normaliseHeure,
  pasDesBornes,
  trouveColonneHeures,
  trouveGroupesJours,
} from '../src/import/tableur.ts';

/* Les prénoms de ces fixtures sont INVENTÉS. Le dépôt est public : aucun
   prénom réel de jeune ou d'éducateur ne doit y figurer. Voir CLAUDE.md.
   Leur forme (groupes de colonnes inégaux, cellules « + » des deux côtés,
   lignes parasites) reproduit un export réel — sans son contenu. */

describe('découpage CSV', () => {
  it('devine le séparateur sur l ensemble du texte, pas sur la première ligne', () => {
    // La ligne de titre n'a qu'un séparateur : compter là seulement induirait
    // en erreur.
    assert.equal(devineSeparateur('Titre;;;\na;b;c\nd;e;f\n'), ';');
    assert.equal(devineSeparateur('a\tb\tc\nd\te\tf'), '\t');
    assert.equal(devineSeparateur('a,b,c\nd,e,f'), ',');
  });

  it('lit des champs simples', () => {
    assert.deepEqual(decoupeTableau('a,b\nc,d'), [
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('lit un saut de ligne à l intérieur d une cellule', () => {
    // C'est le cas de toutes les cellules d'un planning : elles empilent leurs
    // binômes.
    const table = decoupeTableau('9h30,"Accueil :\nOnyx / Wren\nSable / Pike"');
    assert.equal(table.length, 1);
    assert.equal(table[0]![1], 'Accueil :\nOnyx / Wren\nSable / Pike');
  });

  it('lit un guillemet échappé', () => {
    assert.deepEqual(decoupeTableau('a,"il dit ""oui""",b'), [['a', 'il dit "oui"', 'b']]);
  });

  it('retire le BOM et normalise les fins de ligne Windows', () => {
    assert.deepEqual(decoupeTableau('﻿a,b\r\nc,d\r\n'), [
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('ne rend pas une dernière ligne vide venue du saut final', () => {
    assert.equal(decoupeTableau('a,b\n').length, 1);
  });
});

describe('décodage des octets', () => {
  it('rend un texte UTF-8 valide tel quel', () => {
    const octets = new TextEncoder().encode('Héléna, Détaché : été');
    assert.equal(decodeOctets(octets), 'Héléna, Détaché : été');
  });

  it('bascule sur windows-1252 quand ce n est pas de l UTF-8 valide', () => {
    // « é » en windows-1252 est l'octet 0xE9 seul — une continuation UTF-8
    // invalide (un octet de tête UTF-8 valide ne peut pas être seul comme ça
    // dans ce contexte), ce qui fait échouer le décodage strict.
    const octets = new Uint8Array([...new TextEncoder().encode('Hel'), 0xe9, ...new TextEncoder().encode('na')]);
    assert.equal(decodeOctets(octets), 'Heléna');
  });
});

describe('heures', () => {
  it('normalise les écritures d un tableur français', () => {
    assert.equal(normaliseHeure('9h30'), '09:30');
    assert.equal(normaliseHeure('9h'), '09:00');
    assert.equal(normaliseHeure('10h30'), '10:30');
    assert.equal(normaliseHeure('09:30'), '09:30');
    assert.equal(normaliseHeure(' 13h10 '), '13:10');
  });

  it('rejette ce qui n en est pas une', () => {
    assert.equal(normaliseHeure('Repas'), null);
    assert.equal(normaliseHeure(''), null);
    assert.equal(normaliseHeure('25h00'), null);
    assert.equal(normaliseHeure('9h75'), null);
  });

  it('déduit le pas de la grille des bornes relevées', () => {
    assert.equal(pasDesBornes(['09:00', '09:30', '10:00']), 30);
    // Les bornes d'un planning réel : 11h15 et 12h10 imposent 5 minutes.
    assert.equal(
      pasDesBornes(['09:30', '10:00', '10:30', '11:00', '11:15', '12:00', '12:10', '13:10', '13:30']),
      5,
    );
    assert.equal(pasDesBornes(['09:00']), 30, 'une seule borne ne dit rien : on garde le défaut');
  });

  it('trouve la colonne des heures même si elle n est pas la première', () => {
    const table = [
      ['1', '9h30', 'Accueil'],
      ['2', '10h00', 'Sport'],
      ['3', '10h30', 'Classe'],
    ];
    assert.equal(trouveColonneHeures(table), 1);
  });
});

describe('groupes de jours en tête de colonnes', () => {
  it('reconnaît plusieurs jours côte à côte, de largeurs inégales', () => {
    const table = [
      ['', 'Lundi', '', 'Mardi', '', '', 'Vendredi'],
      ['9h30', 'a', 'b', 'c', 'd', 'e', 'f'],
      ['10h', '', '', '', '', '', ''],
    ];
    const groupes = trouveGroupesJours(table, 0);
    assert.deepEqual(groupes, [
      { brut: 'Lundi', jour: 'lundi', colonneDebut: 1 },
      { brut: 'Mardi', jour: 'mardi', colonneDebut: 3 },
      { brut: 'Vendredi', jour: 'vendredi', colonneDebut: 6 },
    ]);
  });

  it('ignore les accents et la casse', () => {
    const table = [
      ['', 'MERCREDI', '', 'jeûdi'],
      ['9h30', 'a', 'b', 'c'],
      ['10h', '', '', ''],
    ];
    assert.deepEqual(
      trouveGroupesJours(table, 0).map((g) => g.jour),
      ['mercredi', 'jeudi'],
    );
  });

  it('rend un jour null pour un en-tête qui ne correspond à aucun jour connu', () => {
    const table = [
      ['', 'Lundi', '', 'Vendredi (bis)'],
      ['9h30', 'a', 'b', 'c'],
      ['10h', '', '', ''],
    ];
    const groupes = trouveGroupesJours(table, 0);
    assert.equal(groupes[0]!.jour, 'lundi');
    assert.equal(groupes[1]!.jour, null);
    assert.equal(groupes[1]!.brut, 'Vendredi (bis)');
  });

  it('ne trouve rien quand aucune ligne ne nomme un jour avant les heures', () => {
    const table = [
      ['', 'Un commentaire quelconque'],
      ['9h30', 'a'],
      ['10h', ''],
    ];
    assert.deepEqual(trouveGroupesJours(table, 0), []);
  });

  it('groupePourColonne rend le dernier groupe dont la colonne de départ précède', () => {
    const groupes = [
      { brut: 'Lundi', jour: 'lundi' as const, colonneDebut: 1 },
      { brut: 'Mardi', jour: 'mardi' as const, colonneDebut: 3 },
    ];
    assert.equal(groupePourColonne(groupes, 0), null); // colonne des heures
    assert.equal(groupePourColonne(groupes, 1)?.jour, 'lundi');
    assert.equal(groupePourColonne(groupes, 2)?.jour, 'lundi');
    assert.equal(groupePourColonne(groupes, 3)?.jour, 'mardi');
    assert.equal(groupePourColonne(groupes, 99)?.jour, 'mardi');
  });
});

describe('contenu d une cellule', () => {
  it('sépare l activité de ses binômes', () => {
    const lu = analyseCellule('Mand :\nOnyx / Wren\nSable / Pike')!;
    assert.equal(lu.activite, 'Mand');
    assert.deepEqual(lu.binomes, [
      { jeunes: ['Onyx'], educateurs: ['Wren'] },
      { jeunes: ['Sable'], educateurs: ['Pike'] },
    ]);
    assert.deepEqual(lu.restes, []);
  });

  it('lit un binôme posé sur la même ligne que l activité', () => {
    const lu = analyseCellule('Protocole : Onyx / Wren')!;
    assert.equal(lu.activite, 'Protocole');
    assert.deepEqual(lu.binomes, [{ jeunes: ['Onyx'], educateurs: ['Wren'] }]);
  });

  it('lit plusieurs accompagnants pour un jeune', () => {
    const lu = analyseCellule('Balade :\nOnyx / Wren + Pike')!;
    assert.deepEqual(lu.binomes, [{ jeunes: ['Onyx'], educateurs: ['Wren', 'Pike'] }]);
  });

  it('lit plusieurs jeunes pour un même groupe d accompagnants — le bug du fichier réel', () => {
    // « Héléna + Valentin + Ilian / Camille+Callista » dans un vrai export :
    // avant le correctif, tout le côté gauche devenait UN SEUL « jeune » de
    // 26 caractères.
    const lu = analyseCellule('Petit groupe :\nOnyx + Sable + Pike / Wren+Lumen')!;
    assert.deepEqual(lu.binomes, [{ jeunes: ['Onyx', 'Sable', 'Pike'], educateurs: ['Wren', 'Lumen'] }]);
  });

  it('lit plusieurs jeunes même sans espace autour du +', () => {
    const lu = analyseCellule('Scolaire :\nOnyx+Sable / Wren')!;
    assert.deepEqual(lu.binomes, [{ jeunes: ['Onyx', 'Sable'], educateurs: ['Wren'] }]);
  });

  it('accepte une activité collective sans binôme', () => {
    const lu = analyseCellule('Repas')!;
    assert.equal(lu.activite, 'Repas');
    assert.deepEqual(lu.binomes, []);
  });

  it('met de côté ce qu il ne sait pas lire, plutôt que de l inventer', () => {
    const lu = analyseCellule('Détaché :\nWren (pas dispo)')!;
    assert.equal(lu.activite, 'Détaché');
    assert.deepEqual(lu.binomes, []);
    assert.deepEqual(lu.restes, ['Wren (pas dispo)']);
  });

  it('rend null sur une cellule vide', () => {
    assert.equal(analyseCellule('   \n  '), null);
  });
});

/** Un vendredi seul, sans autre jour à côté — le cas d'origine, toujours supporté. */
const VENDREDI = [
  ['', 'Vendredi', '', ''],
  ['9h30', 'Accueil :\nOnyx / Wren\nSable / Pike', 'Protocole :\nLumen / Brise', ''],
  ['10h', '', '', ''],
  ['10h30', 'Mand :\nOnyx / Wren', '', 'Détaché :\nBrise (modélisation)'],
  ['11h', 'Parcours moteur :\nSable / Pike', '', ''],
  ['11h15', 'Repas', '', ''],
  ['12h10', 'Pauses 1 et 2', '', ''],
  ['13h10', 'Balade :\nOnyx / Wren + Pike\nSable / Brise', 'Protocole :\nLumen / Wren', ''],
  ['15h30', '', '', ''],
].map((l) => [...l]);

describe('lecture d un planning à un seul jour', () => {
  const lu = litPlanning(VENDREDI);

  it('relève les bornes et en déduit le pas', () => {
    assert.deepEqual(lu.bornes, ['09:30', '10:00', '10:30', '11:00', '11:15', '12:10', '13:10', '15:30']);
    assert.equal(lu.pasMinutes, 5, '11h15 et 12h10 imposent 5 minutes');
    assert.equal(lu.debut, '09:30');
    assert.equal(lu.fin, '15:30');
  });

  it('résout le seul groupe détecté sur le jour attendu', () => {
    assert.deepEqual(lu.jours, [{ brut: 'Vendredi', jour: 'vendredi', colonneDebut: 1 }]);
    assert.ok(lu.creneaux.every((c) => c.jour === 'vendredi'));
  });

  it('prolonge un créneau sur les cellules fusionnées, qui sortent vides', () => {
    // « Accueil » est posé à 9h30 ; la ligne 10h est vide dans ce couloir, donc
    // le créneau court jusqu'à 10h30.
    const accueil = lu.creneaux.find((c) => c.activite === 'Accueil')!;
    assert.equal(accueil.debut, '09:30');
    assert.equal(accueil.fin, '10:30');
  });

  it('traite chaque colonne comme un couloir indépendant', () => {
    // Le protocole de 9h30 court jusqu'à sa prochaine cellule non vide, à
    // 13h10 — indépendamment de ce que fait le couloir d'à côté.
    const protocoles = lu.creneaux.filter((c) => c.activite === 'Protocole');
    assert.equal(protocoles.length, 2);
    assert.equal(protocoles[0]!.debut, '09:30');
    assert.equal(protocoles[0]!.fin, '13:10');
    assert.equal(protocoles[1]!.debut, '13:10');
    assert.notEqual(protocoles[0]!.couloir, lu.creneaux.find((c) => c.activite === 'Accueil')!.couloir);
  });

  it('lit les binômes, y compris à plusieurs accompagnants', () => {
    const balade = lu.creneaux.find((c) => c.activite === 'Balade')!;
    assert.deepEqual(balade.binomes, [
      { jeunes: ['Onyx'], educateurs: ['Wren', 'Pike'] },
      { jeunes: ['Sable'], educateurs: ['Brise'] },
    ]);
  });

  it('garde les activités collectives sans binôme', () => {
    const repas = lu.creneaux.find((c) => c.activite === 'Repas')!;
    assert.deepEqual(repas.binomes, []);
    assert.equal(repas.debut, '11:15');
    assert.equal(repas.fin, '12:10');
  });

  it('replie un couloir jamais réutilisé sur le prochain créneau de la grille, pas sur la fin de journée', () => {
    // « Détaché » à 10h30 ne réapparaît plus jamais dans son couloir alors que
    // d'autres couloirs continuent (le protocole tourne jusqu'à 13h10) : sa fin
    // se replie sur la borne suivante (11h), pas sur la fermeture de journée
    // (15h30) — un repli minimal, pas maximal.
    const detache = lu.creneaux.find((c) => c.activite === 'Détaché')!;
    assert.equal(detache.debut, '10:30');
    assert.equal(detache.fin, '11:00');
    assert.equal(detache.finDeduite, true);
  });

  it('dit ce qu il a dû supposer', () => {
    assert.ok(
      lu.remarques.some((r) => r.includes('replies sur le prochain creneau')),
      'une durée repliée sur la borne suivante est une hypothèse',
    );
    assert.ok(lu.remarques.some((r) => r.includes('5 minutes')), 'le pas déduit mérite d’être signalé');
  });

  it('recense les noms rencontrés, sans trancher qui est qui', () => {
    const noms = nomsRencontres(lu);
    assert.deepEqual(noms.jeunes, ['Onyx', 'Sable', 'Lumen']);
    assert.deepEqual(noms.educateurs, ['Wren', 'Pike', 'Brise']);
  });

  it('refuse un tableau sans colonne d heures plutôt que d inventer', () => {
    assert.throws(() => litPlanning([['a', 'b'], ['c', 'd']]), /colonne d'heures/);
  });

  it('refuse un tableau à une seule borne', () => {
    // Une seule heure ne suffit pas à repérer la colonne des heures elle-même
    // (`trouveColonneHeures` en exige au moins deux) : c'est ce message qui
    // sort en premier, avant même celui sur le nombre de bornes.
    assert.throws(() => litPlanning([['9h30', 'Accueil']]), /colonne d'heures/);
  });
});

/**
 * Plusieurs jours côte à côte, groupes de largeurs INÉGALES (2, 3, 1), une
 * ligne de titre parasite avant l'en-tête des jours, un jour qui ne
 * correspond à rien de connu, et une ligne de commentaire parasite après la
 * grille — exactement la forme d'un export réel, noms inventés.
 */
const MULTI_JOURS = [
  ['PLANNING TEST', '', '', '', '', '', ''],
  ['', 'Lundi', '', 'Mardi', '', '', 'Vendredi (bis)'],
  ['9h30', 'Accueil :\nOnyx / Wren', '', 'Sport :\nSable + Pike / Lumen', '', 'Mand :\nBrise / Wren', 'Repas'],
  ['10h', '', '', '', '', '', ''],
  ['10h30', '', '', '', '', '', ''],
  ['', 'Voir avec la direction pour le ratio', '', '', '', '', ''],
].map((l) => [...l]);

describe('lecture d un planning à plusieurs jours', () => {
  const lu = litPlanning(MULTI_JOURS);

  it('détecte les trois groupes, largeurs inégales comprises', () => {
    assert.deepEqual(lu.jours, [
      { brut: 'Lundi', jour: 'lundi', colonneDebut: 1 },
      { brut: 'Mardi', jour: 'mardi', colonneDebut: 3 },
      { brut: 'Vendredi (bis)', jour: null, colonneDebut: 6 },
    ]);
  });

  it('ignore la ligne de titre parasite avant l en-tête des jours', () => {
    // « PLANNING TEST » ne doit pas être pris pour un jour, ni empêcher la
    // détection de la vraie ligne d'en-tête juste après.
    assert.ok(!lu.jours.some((g) => g.brut.includes('PLANNING')));
  });

  it('assigne chaque créneau au jour de son groupe de colonnes', () => {
    const accueil = lu.creneaux.find((c) => c.activite === 'Accueil')!;
    const sport = lu.creneaux.find((c) => c.activite === 'Sport')!;
    const mand = lu.creneaux.find((c) => c.activite === 'Mand')!;
    const repas = lu.creneaux.find((c) => c.activite === 'Repas')!;
    assert.equal(accueil.jour, 'lundi');
    assert.equal(sport.jour, 'mardi');
    assert.equal(mand.jour, 'mardi');
    assert.equal(repas.jour, null, 'groupe non résolu : jamais deviné');
  });

  it('lit un binôme à plusieurs jeunes dans un groupe multi-jours', () => {
    const sport = lu.creneaux.find((c) => c.activite === 'Sport')!;
    assert.deepEqual(sport.binomes, [{ jeunes: ['Sable', 'Pike'], educateurs: ['Lumen'] }]);
  });

  it('signale l en-tête non reconnu', () => {
    assert.ok(lu.remarques.some((r) => r.includes('Vendredi (bis)')));
  });

  it('ignore la ligne de commentaire après la grille, sans erreur ni créneau fantôme', () => {
    assert.ok(!lu.creneaux.some((c) => c.activite.includes('ratio')));
    assert.ok(!lu.creneaux.some((c) => c.activite.includes('direction')));
  });

  it('recense les noms des deux jours résolus, dans l ordre des colonnes', () => {
    const noms = nomsRencontres(lu);
    assert.deepEqual(noms.jeunes, ['Onyx', 'Sable', 'Pike', 'Brise']);
    assert.deepEqual(noms.educateurs, ['Wren', 'Lumen']);
  });
});

describe('lecture sans aucune ligne de jours', () => {
  const table = [
    ['9h30', 'Accueil :\nOnyx / Wren'],
    ['10h', ''],
    ['10h30', ''],
  ];
  const lu = litPlanning(table);

  it('forme un seul groupe implicite, non résolu — jamais deviné', () => {
    assert.deepEqual(lu.jours, [{ brut: '', jour: null, colonneDebut: 0 }]);
    assert.ok(lu.creneaux.every((c) => c.jour === null));
  });

  it('le signale', () => {
    assert.ok(lu.remarques.some((r) => r.includes('Aucune ligne de jours')));
  });
});
