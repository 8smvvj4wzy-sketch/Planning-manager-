import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ErreurDechiffrement,
  FORMAT_CHIFFRE,
  chiffre,
  dechiffre,
  estEnveloppeChiffree,
} from '../src/index.ts';

describe('chiffrement', () => {
  it('fait l’aller-retour', async () => {
    const donnees = { meta: { version: 1 }, jeunes: ['a', 'b'] };
    const enveloppe = await chiffre(donnees, 'une phrase de passe correcte');
    const clair = await dechiffre(enveloppe, 'une phrase de passe correcte');
    assert.deepEqual(clair, donnees);
  });

  it('produit une enveloppe reconnaissable, avant même de tenter le déchiffrement', async () => {
    const enveloppe = await chiffre({ x: 1 }, 'phrase');
    assert.equal(enveloppe.format, FORMAT_CHIFFRE);
    assert.equal(enveloppe.version, 1);
    assert.equal(typeof enveloppe.salt, 'string');
    assert.equal(typeof enveloppe.iv, 'string');
    assert.equal(typeof enveloppe.data, 'string');
    assert.equal(estEnveloppeChiffree(enveloppe), true);
  });

  it('ne reconnaît pas n’importe quel objet comme une enveloppe', () => {
    assert.equal(estEnveloppeChiffree({ format: 'autre-chose', version: 1, salt: 'x', iv: 'y', data: 'z' }), false);
    assert.equal(estEnveloppeChiffree({ format: FORMAT_CHIFFRE }), false); // champs manquants
    assert.equal(estEnveloppeChiffree(null), false);
    assert.equal(estEnveloppeChiffree('texte'), false);
    assert.equal(estEnveloppeChiffree({ meta: { version: 1 } }), false, 'un structure.json en clair n’est pas une enveloppe');
  });

  it('rejette une mauvaise phrase de passe proprement, sans fuiter de contenu', async () => {
    const enveloppe = await chiffre({ secret: 'jamais lu' }, 'bonne phrase');
    await assert.rejects(() => dechiffre(enveloppe, 'mauvaise phrase'), ErreurDechiffrement);
  });

  it('rejette une enveloppe corrompue plutôt que de planter au hasard', async () => {
    const enveloppe = await chiffre({ x: 1 }, 'phrase');
    const corrompue = { ...enveloppe, data: enveloppe.data.slice(0, -4) + 'AAAA' };
    await assert.rejects(() => dechiffre(corrompue, 'phrase'), ErreurDechiffrement);
  });

  it('rejette un objet qui n’a pas la forme d’une enveloppe', async () => {
    // @ts-expect-error -- on force volontairement une forme invalide, pour vérifier le refus
    await assert.rejects(() => dechiffre({ pasUneEnveloppe: true }, 'phrase'), ErreurDechiffrement);
  });

  it('produit un sel et un IV différents à chaque appel', async () => {
    const a = await chiffre({ x: 1 }, 'phrase');
    const b = await chiffre({ x: 1 }, 'phrase');
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.data, b.data, 'même contenu, même phrase, mais jamais le même chiffré');
  });

  it('conserve des types non triviaux au retour', async () => {
    const donnees = { liste: [1, 2, 3], imbrique: { a: null, b: true }, texte: 'éàç€' };
    const enveloppe = await chiffre(donnees, 'phrase');
    const clair = await dechiffre(enveloppe, 'phrase');
    assert.deepEqual(clair, donnees);
  });
});
