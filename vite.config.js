import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { classerFichiers, empreinte, injecterPrecache } from './scripts/precache.mjs';

/* Injecte dans dist/sw.js la liste réelle des fichiers produits et la version
   de cache qui en dérive — même mécanisme que DatABA Manager : pas de bump
   manuel de CACHE_VERSION, pas de découverte à l'exécution. N'agit qu'au
   build ; `vite dev` sert public/sw.js tel quel. */
function precacheHorsLigne() {
  let outDir = 'dist';
  return {
    name: 'precache-hors-ligne',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const distDir = resolve(process.cwd(), outDir);
      const swPath = join(distDir, 'sw.js');
      const chemins = listerRecursif(distDir).filter((c) => c !== 'sw.js');
      const { obligatoires, facultatifs } = classerFichiers(chemins);
      const version = empreinte(
        chemins.map((chemin) => ({ nom: chemin, contenu: readFileSync(join(distDir, chemin)) })),
      );
      writeFileSync(swPath, injecterPrecache(readFileSync(swPath, 'utf8'), { obligatoires, facultatifs, version }));
    },
  };
}

function listerRecursif(dir, base = dir) {
  const resultats = [];
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) resultats.push(...listerRecursif(chemin, base));
    else resultats.push(relative(base, chemin).split('\\').join('/'));
  }
  return resultats;
}

export default defineConfig({
  plugins: [react(), precacheHorsLigne()],
  base: './',
});
