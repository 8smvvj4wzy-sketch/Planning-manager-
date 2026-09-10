/**
 * Tests d'interface — les parcours qu'un vérificateur vert ne voit pas.
 *
 * `./verifier.sh` a été vert sur trois lots d'affilée pendant que l'écran avait
 * des defauts : un champ « Poids » qui survivait a un passage en regle dure, un
 * selecteur tronque, un champ qu'on pouvait modifier sans aucun effet. Tous
 * trouves en pilotant un navigateur a la main, avec un script jete juste apres.
 * Ces parcours-la sont ici pour etre rejoues.
 *
 * Cette suite est HORS de `verifier.sh` : le verificateur est la porte du
 * deploiement et doit rester court. Elle a son propre job en CI, dont le build
 * depend — une spec rouge arrete donc la publication.
 *
 * `npm run test:interface`
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './test/interface',
  // `*.spec.ts`, jamais `*.test.ts` : `npm test` fait `node --test test/*.test.ts`
  // et `node:test` ne sait rien de Playwright. Le suffixe dit a quel runner le
  // fichier appartient.
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: URL,
    // Le service worker (`interface/main.jsx` enregistre `sw.js`, dont le
    // precache est injecte au build) servirait un bundle mis en cache : la
    // suite passerait au vert sur du code qui n'est plus la. C'est le pire mode
    // d'echec qu'un test puisse avoir — il ment dans le sens rassurant.
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Echappatoire pour une machine qui a deja un Chromium provisionne
        // ailleurs (image CI d'entreprise, bac a sable) : Playwright exige
        // normalement le build exact qui accompagne sa version, et telecharger
        // 100 Mo pour rien serait absurde. Non renseignee — le cas normal, et
        // celui de notre CI — Playwright utilise le navigateur qu'il a installe.
        ...(process.env['PLAYWRIGHT_CHROMIUM_PATH']
          ? { launchOptions: { executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] } }
          : {}),
      },
    },
  ],

  webServer: {
    // On teste le BUILD, pas le serveur de dev : c'est ce qui est publie.
    command: `npm run build:interface && npm run preview -- --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
