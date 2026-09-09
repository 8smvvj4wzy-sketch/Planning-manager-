# Planning IME — socle du moteur

Schéma des fichiers, moteur de règles et solveur de réparation pour le planning
d'un IME. Pas d'interface : c'est la brique que toute UI réutilisera.

Trois questions, trois réponses :

| question | fonction |
|---|---|
| Ce fichier est-il exploitable ? | `valideStructure`, `valideJour` |
| Quelles règles ce planning viole-t-il, et à quel coût ? | `evalue` |
| Que devient la journée quand untel est absent ? | `repare` |

## Démarrer

```bash
npm install
npm test
node scripts/valider.ts examples/structure.json examples/jour.json
```

La dernière commande valide les deux fichiers, répare la journée du
14 septembre 2026 (une éducatrice en arrêt, une autre partie à 13 h 30, un jeune
absent, un intérimaire disponible) et imprime le planning obtenu.

## Utilisation

```ts
import { chargeStructure, repare, formate } from 'planning-ime';

const { ref, resultat } = chargeStructure(JSON.parse(fs.readFileSync('structure.json', 'utf8')));
console.log(formate(resultat)); // les avertissements, s'il y en a

const reparation = repare(ref, JSON.parse(fs.readFileSync('jour.json', 'utf8')));

if (!reparation.admissible) {
  for (const conflit of reparation.conflits) console.log(conflit.message);
}
for (const c of reparation.changements) {
  console.log(`${c.action} ${c.educateurId} → ${c.creneauId} (${c.motif})`);
}
```

`repare` ne modifie rien sur place : elle renvoie le planning de départ
(`initial`), le planning réparé (`planning`), la liste des changements avec leur
motif, les conflits non résolus et les règles violées. Rien n'est implicite —
tout ce que le moteur a fait est traçable.

Le comportement s'ajuste sans toucher au code :

```ts
repare(ref, jour, { priorite: 'educateurs' });          // préserver l'équipe plutôt que les jeunes
repare(ref, jour, { detachement: 'indisponible' });     // un détaché n'est plus rappelable
repare(ref, jour, { encadrement: 'ratioGroupe' });      // ratio par groupe au lieu du décimal
repare(ref, jour, { couts: { recoursRenfort: 200 } });  // l'intérim en tout dernier recours
```

## Les fichiers

`structure.json` est stable et circule par mail ; `jour.json` porte les absences
et les retouches du jour et ne circule pas. Les deux ont un JSON Schema dans
[`schemas/`](./schemas) : c'est le contrat, valable pour n'importe quel outil, pas
seulement pour ce code. La validation TypeScript s'appuie dessus, puis y ajoute
ce qu'un schéma ne sait pas dire — identifiants en double, références croisées,
créneaux non alignés sur la grille, chevauchements, capacités, cohérence des
règles.

Chaque problème est rendu avec un code stable, un pointeur JSON et un message en
clair, pour qu'une interface puisse pointer le champ fautif :

```
ERREUR /planningType/3 [creneau.chevauchement] educateur "e1" est aussi sur "p105" a 10:00 (lundi)
AVERT. /regles/7 [regle.commentaire] regle sans commentaire : dans six mois, personne ne saura pourquoi
```

Les erreurs bloquent le chargement, les avertissements non.

## Les règles

Les douze types du catalogue sont implémentés. **Ajouter une règle, c'est ajouter
une entrée dans le tableau `regles` du fichier — jamais toucher au code.**

| type | cibles | params |
|---|---|---|
| `educateurs_autorises` | `jeunes` | `educateurs[]`, `mode` |
| `educateurs_interdits` | `jeunes` | `educateurs[]` |
| `binome_jeunes` | `jeunes` (2+) | `educateursRequis` |
| `jeunes_incompatibles` | `jeunes` (2+) | — |
| `rotation_educateur` | `jeunes` | `tousLesPas`, `fenetre` |
| `quota_detachement` | `educateurs` | `maxPasParJour`, `maxPasParSemaine` |
| `perimetre_renfort` | `educateurs` | `jeunesAutorises[]`, `activitesAutorisees[]` |
| `taux_encadrement` | `groupes` ou `activites` | `ratioJeunesParEduc` |
| `salle_requise` | `activites` ou `jeunes` | `salles[]` ou `tag` |
| `continuite_journee` | `jeunes` | `maxChangements`, `sur` |
| `presence_minimale` | `groupes` | `educMin` |
| `indisponibilite_recurrente` | `educateurs` | `jour`, `debut`, `fin` |

Ajouter un *type* de règle, en revanche, demande du code : un fichier dans
`src/regles/catalogue/` et une ligne dans `src/regles/registre.ts`. Rien d'autre
dans le moteur n'a besoin de le connaître.

Une règle `dure` n'est jamais violée : si aucune solution n'existe, le moteur
signale le conflit plutôt que de passer outre. Une règle souple se négocie, son
`poids` arbitrant entre règles concurrentes.

## Vues

La vue « salles libres » n'est pas un module : c'est la grille des salles moins
les salles occupées à chaque pas, et elle sort gratuitement du modèle. Idem pour
les éducateurs disponibles et les jeunes présents sans affectation.

```ts
sallesLibres(ref, planning);                  // par pas : libres + occupant de chaque salle
educateursLibres(ref, planning, mobilisable);  // mobilisables et non affectés
jeunesSansAffectation(ref, planning, etat);   // les oubliés du planning
```

## Organisation

```
schemas/     structure.schema.json, jour.schema.json — le contrat transmissible
src/
  types.ts         types des deux fichiers
  temps.ts         conversions heure ↔ pas (tout le moteur raisonne en pas)
  referentiel.ts   vue indexée d'une structure
  encadrement.ts   combien d'éducateurs faut-il sur un créneau ?
  detachement.ts   qu'est-ce qu'un éducateur détaché ?
  planning/        modèle du planning d'une journée et sa construction
  regles/          socle, registre, et un fichier par type de règle
  moteur/          options, état du jour, disponibilités, solveur
  vues.ts          lectures dérivées
examples/    une structure de référence complète et un jour.json
docs/        schema.md (spécification) et decisions.md (arbitrages)
```

## Ce qui a été tranché

Les trois « points à trancher avant de coder » de la spécification sont réglés,
avec leur raisonnement, dans [`docs/decisions.md`](./docs/decisions.md) — ainsi
que les écarts assumés et **ce que le solveur ne fait pas**. À lire avant de
s'appuyer dessus.

En résumé : priorité aux jeunes plutôt qu'aux éducateurs, un détaché reste
mobilisable mais cher, l'encadrement décimal est conservé. Les trois sont des
options, pas des choix gravés dans le code.
