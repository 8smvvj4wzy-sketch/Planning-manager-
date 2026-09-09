/**
 * Chiffrement des fichiers exportes.
 *
 * Reprise A L'IDENTIQUE du schema de DatABA / DatABA Manager : meme derivation
 * de cle, meme enveloppe, pour que les habitudes et le niveau de protection
 * soient les memes dans les trois applications, et pour qu'un depot qui sait
 * dechiffrer l'un sache dechiffrer l'autre sans rien adapter. Seul `FORMAT`
 * change, pour qu'un fichier DatABA ne soit jamais pris pour un planning.
 *
 * WebCrypto (`crypto.subtle`) est disponible tel quel dans Node comme dans le
 * navigateur : ce module est teste par `node:test`, sans DOM.
 *
 * Trois reserves, assumees et documentees dans docs/decisions.md :
 *  1. le chiffrement protege le fichier en transit, il n'anonymise pas — qui a
 *     la phrase de passe lit les prenoms ;
 *  2. 150 000 iterations PBKDF2 est un peu bas pour une phrase de passe
 *     humaine en 2026, garde par parite avec DatABA ;
 *  3. un fichier chiffre n'est plus validable par un autre outil sans la cle —
 *     d'ou l'export en clair, toujours propose a cote.
 */

import type { webcrypto } from 'node:crypto';

/* Les types WebCrypto (CryptoKey, KeyUsage, BufferSource) ne sont pas globaux
   sans la lib DOM, que ce depot exclut deliberement du moteur (voir
   CLAUDE.md : « il ne connait ni React ni le DOM »). Import de type seul,
   efface a la compilation comme dans le navigateur (Vite) — aucune valeur ne
   vient de 'node:crypto' ici, seulement des noms de types. */
type CryptoKey = webcrypto.CryptoKey;
type KeyUsage = webcrypto.KeyUsage;
type BufferSourceCompatible = webcrypto.BufferSource;

export const FORMAT_CHIFFRE = 'planning-ime-encrypted';
const VERSION_ENVELOPPE = 1;
const ITERATIONS_PBKDF2 = 150_000;
const TAILLE_SEL = 16;
const TAILLE_IV = 12;

export interface EnveloppeChiffree {
  format: typeof FORMAT_CHIFFRE;
  version: number;
  /** Sel PBKDF2, base64. */
  salt: string;
  /** Vecteur d'initialisation AES-GCM, base64. */
  iv: string;
  /** Texte chiffre, base64. */
  data: string;
}

export class ErreurDechiffrement extends Error {
  constructor(message = 'Phrase de passe incorrecte, ou fichier corrompu.') {
    super(message);
    this.name = 'ErreurDechiffrement';
  }
}

function versB64(tampon: ArrayBuffer | Uint8Array): string {
  const octets = tampon instanceof Uint8Array ? tampon : new Uint8Array(tampon);
  let binaire = '';
  const paquet = 0x8000;
  for (let i = 0; i < octets.length; i += paquet) {
    binaire += String.fromCharCode(...octets.subarray(i, i + paquet));
  }
  return btoa(binaire);
}

function depuisB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveCle(phrase: string, sel: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const materiau = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(phrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sel as BufferSourceCompatible, iterations: ITERATIONS_PBKDF2, hash: 'SHA-256' },
    materiau,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

/** Chiffre un objet JSON-serialisable en une enveloppe transportable. */
export async function chiffre(donnees: unknown, phrase: string): Promise<EnveloppeChiffree> {
  const sel = crypto.getRandomValues(new Uint8Array(TAILLE_SEL));
  const iv = crypto.getRandomValues(new Uint8Array(TAILLE_IV));
  const cle = await deriveCle(phrase, sel, ['encrypt']);
  const clair = new TextEncoder().encode(JSON.stringify(donnees));
  const chiffre_ = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSourceCompatible }, cle, clair);
  return {
    format: FORMAT_CHIFFRE,
    version: VERSION_ENVELOPPE,
    salt: versB64(sel),
    iv: versB64(iv),
    data: versB64(chiffre_),
  };
}

/** Vrai si `donnees` a la forme d'une enveloppe de ce format — avant d'essayer de la déchiffrer. */
export function estEnveloppeChiffree(donnees: unknown): donnees is EnveloppeChiffree {
  if (typeof donnees !== 'object' || donnees === null) return false;
  const d = donnees as Record<string, unknown>;
  return (
    d['format'] === FORMAT_CHIFFRE &&
    typeof d['version'] === 'number' &&
    typeof d['salt'] === 'string' &&
    typeof d['iv'] === 'string' &&
    typeof d['data'] === 'string'
  );
}

/**
 * Dechiffre une enveloppe. Leve `ErreurDechiffrement` sur mauvaise phrase de
 * passe ou fichier corrompu — AES-GCM authentifie le contenu, une phrase
 * fausse ne rend jamais un JSON valide qui passerait inapercu.
 */
export async function dechiffre(enveloppe: EnveloppeChiffree, phrase: string): Promise<unknown> {
  if (!estEnveloppeChiffree(enveloppe)) {
    throw new ErreurDechiffrement(`format d'enveloppe inattendu (attendu "${FORMAT_CHIFFRE}")`);
  }
  try {
    const sel = depuisB64(enveloppe.salt);
    const iv = depuisB64(enveloppe.iv);
    const cle = await deriveCle(phrase, sel, ['decrypt']);
    const clair = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSourceCompatible },
      cle,
      depuisB64(enveloppe.data),
    );
    return JSON.parse(new TextDecoder().decode(clair));
  } catch (e) {
    if (e instanceof ErreurDechiffrement) throw e;
    throw new ErreurDechiffrement();
  }
}
