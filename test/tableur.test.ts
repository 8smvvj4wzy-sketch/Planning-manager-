import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyseCellule,
  decoupeTableau,
  devineSeparateur,
  litPlanning,
  nomsRencontres,
  normaliseHeure,
  pasDesBornes,
  trouveColonneHeures,
} from '../src/import/tableur.ts';

/* Les prénoms de ces fixtures sont INVENTÉS. Le dépôt est public : aucun
   prénom réel de jeune ou d'éducateur ne doit y figurer. Voir CLAUDE.md. */

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

describe('contenu d une cellule', () => {
  it('sépare l activité de ses binômes', () => {
    const lu = analyseCellule('Mand :\nOnyx / Wren\nSable / Pike')!;
    assert.equal(lu.activite, 'Mand');
    assert.deepEqual(lu.binomes, [
      { jeune: 'Onyx', educateurs: ['Wren'] },
      { jeune: 'Sable', educateurs: ['Pike'] },
    ]);
    assert.deepEqual(lu.restes, []);
  });

  it('lit un binôme posé sur la même ligne que l activité', () => {
    const lu = analyseCellule('Protocole : Onyx / Wren')!;
    assert.equal(lu.activite, 'Protocole');
    assert.deepEqual(lu.binomes, [{ jeune: 'Onyx', educateurs: ['Wren'] }]);
  });

  it('lit plusieurs accompagnants pour un jeune', () => {
    const lu = analyseCellule('Balade :\nOnyx / Wren + Pike')!;
    assert.deepEqual(lu.binomes, [{ jeune: 'Onyx', educateurs: ['Wren', 'Pike'] }]);
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

/** Un vendredi de la même forme que le planning réel, prénoms inventés. */
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

describe('lecture d un planning entier', () => {
  const lu = litPlanning(VENDREDI);

  it('relève les bornes et en déduit le pas', () => {
    assert.deepEqual(lu.bornes, ['09:30', '10:00', '10:30', '11:00', '11:15', '12:10', '13:10', '15:30']);
    assert.equal(lu.pasMinutes, 5, '11h15 et 12h10 imposent 5 minutes');
    assert.equal(lu.debut, '09:30');
    assert.equal(lu.fin, '15:30');
  });

  it('retient le titre de la première ligne', () => {
    assert.equal(lu.titre, 'Vendredi');
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
      { jeune: 'Onyx', educateurs: ['Wren', 'Pike'] },
      { jeune: 'Sable', educateurs: ['Brise'] },
    ]);
  });

  it('garde les activités collectives sans binôme', () => {
    const repas = lu.creneaux.find((c) => c.activite === 'Repas')!;
    assert.deepEqual(repas.binomes, []);
    assert.equal(repas.debut, '11:15');
    assert.equal(repas.fin, '12:10');
  });

  it('dit ce qu il a dû supposer', () => {
    assert.ok(lu.remarques.some((r) => r.includes('15:30')), 'la fin de journée est une hypothèse');
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
    assert.throws(
      () => litPlanning([['9h30', 'Accueil']]),
      /colonne d'heures/,
    );
  });
});
