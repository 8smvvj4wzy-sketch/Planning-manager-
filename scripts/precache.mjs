/* Classement des fichiers produits par le build en deux catégories, calcul
   d'une empreinte qui en dérive, et injection des deux dans public/sw.js —
   c'est ce qui remplace la liste dictée à l'exécution par la page (voir le
   piège « Le hors-ligne ne se découvre pas à l'exécution » dans CLAUDE.md) et
   le bump manuel de CACHE_VERSION.

   Module autonome, sans dépendance, importé à la fois par vite.config.js (au
   build, avec de vrais fichiers de dist/) et par tests/test_horsligne.mjs
   (avec des fichiers synthétiques) : les trois fonctions sont pures, aucun
   accès au système de fichiers ici — c'est à l'appelant de lire les fichiers
   et d'écrire le résultat. */

import { createHash } from 'node:crypto';

/* `cache.addAll` est atomique : un fichier obligatoire manquant doit faire
   échouer l'installation du service worker (mieux vaut garder l'ancienne
   version, qui fonctionne, qu'activer une nouvelle au cache creux) ; un
   fichier facultatif manquant ne le doit pas. Le SW ne se met jamais
   lui-même en cache. */
export function classerFichiers(chemins) {
  const obligatoires = new Set(['./', './index.html', './manifest.webmanifest']);
  const facultatifs = new Set();
  for (const chemin of chemins) {
    if (chemin === 'sw.js') continue;
    const url = `./${chemin}`;
    if (chemin.startsWith('assets/') || chemin === 'index.html' || chemin === 'manifest.webmanifest') {
      obligatoires.add(url);
    } else {
      facultatifs.add(url);
    }
  }
  return {
    obligatoires: [...obligatoires].sort(),
    facultatifs: [...facultatifs].sort(),
  };
}

/* Empreinte courte, dérivée du contenu réel des fichiers (pas seulement leur
   taille — deux fichiers de même longueur mais de contenu différent, ça
   arrive) : elle change dès qu'un octet change, et seulement alors —
   contrairement au bump manuel qu'elle remplace, un oubli est impossible.
   `entrees` : tableau de { nom, contenu } — `contenu` accepte tout ce que
   `Hash.update` accepte (Buffer ou string). */
export function empreinte(entrees) {
  const trie = [...entrees].sort((a, b) => a.nom.localeCompare(b.nom));
  const hachage = createHash('sha1');
  for (const e of trie) {
    hachage.update(e.nom);
    hachage.update('\0');
    hachage.update(e.contenu);
    hachage.update('\0');
  }
  return `v${hachage.digest('hex').slice(0, 10)}`;
}

/* Réécrit les trois lignes marquées « injecté au build » de public/sw.js.
   Isolée dans une fonction pure et testée pour elle-même : c'est la même
   qu'utilise vite.config.js, jamais une copie divergente des expressions
   régulières. */
export function injecterPrecache(contenuSW, { obligatoires, facultatifs, version }) {
  return contenuSW
    .replace(/^const OBLIGATOIRES = .*;$/m, `const OBLIGATOIRES = ${JSON.stringify(obligatoires)};`)
    .replace(/^const FACULTATIFS = .*;$/m, `const FACULTATIFS = ${JSON.stringify(facultatifs)};`)
    .replace(/^const CACHE_VERSION = .*;$/m, `const CACHE_VERSION = ${JSON.stringify(version)};`);
}
