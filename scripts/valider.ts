#!/usr/bin/env node
/**
 * Outil en ligne de commande.
 *
 *   node scripts/valider.ts examples/structure.json
 *   node scripts/valider.ts examples/structure.json examples/jour.json
 *
 * Valide les fichiers, puis — si un `jour.json` est fourni — repare la journee
 * et affiche le planning obtenu.
 */

import { readFileSync } from 'node:fs';
import {
  Referentiel,
  auditeSemaine,
  formate,
  repare,
  valideJour,
  valideStructure,
  type FichierJour,
  type Structure,
} from '../src/index.ts';

function lis(chemin: string): unknown {
  return JSON.parse(readFileSync(chemin, 'utf8'));
}

const [cheminStructure, cheminJour] = process.argv.slice(2);
if (!cheminStructure) {
  console.error('usage : node scripts/valider.ts <structure.json> [jour.json]');
  process.exit(2);
}

const brut = lis(cheminStructure);
const resultat = valideStructure(brut);
console.log(`— ${cheminStructure}`);
console.log(formate(resultat));
if (!resultat.valide) process.exit(1);

const ref = new Referentiel(brut as Structure);

// Sans fichier du jour, on audite la semaine : c'est la lecture qui montre les
// quotas hebdomadaires, invisibles journee par journee.
if (!cheminJour) {
  const semaine = auditeSemaine(ref);
  console.log(`\n— Semaine type : ${semaine.admissible ? 'admissible' : 'NON admissible'} (cout ${semaine.cout})`);
  for (const { jour, reparation } of semaine.journees) {
    const etat = reparation.conflits.length > 0
      ? `${reparation.conflits.length} conflit(s)`
      : reparation.violations.length > 0
        ? `${reparation.violations.length} regle(s) violee(s)`
        : 'rien a signaler';
    console.log(`    ${jour.padEnd(9)} ${String(reparation.planning.creneaux.length).padStart(3)} creneaux — ${etat}`);
  }
  for (const v of semaine.violationsHebdomadaires) {
    console.log(`    [hebdo] ${v.regleId} — ${v.message}`);
  }
  process.exit(semaine.admissible ? 0 : 1);
}

const brutJour = lis(cheminJour) as FichierJour;
const resultatJour = valideJour(ref, brutJour);
console.log(`\n— ${cheminJour}`);
console.log(formate(resultatJour));
if (!resultatJour.valide) process.exit(1);

const reparation = repare(ref, brutJour);
console.log(`\n— Reparation du ${brutJour.date} (${reparation.planning.jour})`);
console.log(`  admissible : ${reparation.admissible ? 'oui' : 'NON'}   cout : ${reparation.cout}`);

if (reparation.changements.length > 0) {
  console.log('\n  Changements :');
  for (const c of reparation.changements) {
    const depuis = c.depuisCreneauId ? ` (depuis ${c.depuisCreneauId})` : '';
    console.log(`    ${c.action.padEnd(12)} ${ref.libelleEducateur(c.educateurId).padEnd(14)} → ${c.creneauId}${depuis} — ${c.motif}`);
  }
}

if (reparation.conflits.length > 0) {
  console.log('\n  Conflits non resolus :');
  for (const c of reparation.conflits) console.log(`    ${c.message}`);
}

if (reparation.violations.length > 0) {
  console.log('\n  Regles violees :');
  for (const v of reparation.violations) {
    console.log(`    [${v.dure ? 'DURE' : 'souple'}] ${v.regleId} — ${v.message}`);
  }
}

console.log('\n  Planning :');
for (const creneau of [...reparation.planning.creneaux].sort((a, b) => a.pasDebut - b.pasDebut)) {
  if (creneau.jeunes.length === 0 && creneau.educateurs.length === 0) continue;
  const heure = ref.grille.heureDePas(creneau.pasDebut);
  const fin = ref.grille.heureDePas(creneau.pasDebut + creneau.pas);
  const activite = ref.activite(creneau.activiteId)?.nom ?? creneau.activiteId;
  const jeunes = creneau.jeunes.map((id) => ref.libelleJeune(id)).join(', ') || '—';
  const educateurs = creneau.educateurs.map((id) => ref.libelleEducateur(id)).join(', ') || '—';
  console.log(
    `    ${heure}–${fin}  ${activite.padEnd(16)} ${(creneau.salleId ?? '—').padEnd(8)} jeunes: ${jeunes.padEnd(28)} educ: ${educateurs}`,
  );
}
