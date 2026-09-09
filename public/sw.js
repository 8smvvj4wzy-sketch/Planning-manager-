/* Service worker de l'application Planning IME.
   Même stratégie que DatABA Manager : le réseau a 2,5 s pour répondre à
   l'ouverture, au-delà on ouvre depuis le cache et la mise à jour se termine
   en arrière-plan. Sans ce garde-fou, une connexion lente laisse un écran
   blanc plusieurs minutes.

   La liste des fichiers à précacher et la version du cache ne sont plus
   posées à la main : le build (vite.config.js, scripts/precache.mjs) les
   calcule à partir des fichiers réellement produits et remplace les trois
   lignes suivantes. En développement (`vite dev`) ou sous les tests, ces
   valeurs par défaut s'appliquent telles quelles — la coquille seule, jamais
   une version « dev » qui resterait active en production (voir la section
   « 4. Hors ligne » de verifier.sh, qui vérifie justement l'inverse). */
const OBLIGATOIRES = /* injecté au build */ ['./', './index.html', './manifest.webmanifest'];
const FACULTATIFS = /* injecté au build */ [];
const CACHE_VERSION = /* injecté au build */ 'dev';
const CACHE_NAME = `planning-ime-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 2500;

self.addEventListener('install', (event) => {
  /* Le précache d'abord, la prise de contrôle ensuite. Avant cette version,
     self.skipWaiting() était le tout premier appel : sur une mise en ligne,
     l'ancien service worker restait le contrôleur actif le temps que la page
     charge, et une page qui lui envoyait entre-temps la liste des fichiers à
     mettre en cache (ancien mécanisme dans interface/main.jsx, retiré) écrivait
     dans SON cache à lui — pendant que le nouveau service worker, déjà
     activé, avait déjà supprimé ce même cache à l'activation (voir plus bas).
     Le cache effectivement servi ne contenait plus alors que la coquille :
     aucun .js, aucun .css. L'application s'ouvrait normalement en ligne, et
     se retrouvait cassée hors connexion jusqu'au rechargement suivant — sans
     qu'aucun signal ne le dise (voir CarteHorsLigne, interface/App.jsx). */
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Obligatoire : un seul absent et cache.addAll rejette tout le lot —
      // l'installation échoue, l'ancien service worker (qui fonctionne
      // toujours) reste actif. Mieux vaut une version qui marche qu'une
      // nouvelle au cache creux.
      await cache.addAll(OBLIGATOIRES);
      // Facultatif : chacun pour soi, une image manquante n'empêche rien.
      await Promise.all(FACULTATIFS.map((url) => cache.add(url).catch(() => {})));
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /* Relecture avant purge — même principe que sauverDonnees côté
         données : une écriture n'est réussie qu'une fois relue. Si le
         nouveau cache n'a pas la totalité de l'obligatoire (installation
         interrompue, quota), les anciens caches restent en place plutôt que
         de laisser le poste sans rien de servable hors connexion. */
      const cache = await caches.open(CACHE_NAME);
      const complet = (
        await Promise.all(OBLIGATOIRES.map((url) => cache.match(url)))
      ).every(Boolean);
      if (complet) {
        const cles = await caches.keys();
        await Promise.all(cles.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const enCache = (await cache.match(request)) || (await cache.match('./index.html')) || (await cache.match('./'));
        const reseau = fetch(request)
          .then((r) => { if (r && r.status === 200) cache.put(request, r.clone()); return r; })
          .catch(() => null);
        if (!enCache) return (await reseau) || Response.error();
        const attente = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
        const gagnant = await Promise.race([reseau, attente]);
        if (gagnant) return gagnant;
        event.waitUntil(reseau);
        return enCache;
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((enCache) => {
      if (enCache) return enCache;
      return fetch(request).then((r) => {
        if (r && (r.status === 200 || r.type === 'opaque')) {
          const copie = r.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copie));
        }
        return r;
      }).catch(() => enCache || Response.error());
      // enCache est ici toujours undefined (la branche if l'aurait déjà
      // rendu) : Response.error() évite de passer undefined à respondWith,
      // qui lèverait au lieu de laisser la requête échouer proprement.
    })
  );
});

/* État lu par la carte « Hors ligne » de l'écran Gestion (CarteHorsLigne,
   interface/App.jsx) : combien de fichiers attendus sont effectivement en cache,
   sous quelle version. Remplace l'ancien message « cache-assets » — la page
   ne dicte plus rien au service worker, elle ne fait qu'interroger son état. */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'etat') return;
  const port = event.ports && event.ports[0];
  if (!port) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const presents = (
        await Promise.all(OBLIGATOIRES.map((url) => cache.match(url)))
      ).filter(Boolean).length;
      port.postMessage({ version: CACHE_VERSION, attendus: OBLIGATOIRES.length, presents });
    })()
  );
});
