# Planning IME

Planning d'un IME : moteur d'affectation et de réparation, et l'interface qui le
pilote. Livrée **vierge** — aucune donnée nominative n'est embarquée — et **tout reste
en local**, dans le navigateur.

Deux couches, et la séparation est le principe :

| couche | ce qu'elle fait |
|---|---|
| `src/` — le moteur, TypeScript | Ce fichier est-il exploitable ? (`valideStructure`) — Quelles règles ce planning viole-t-il ? (`evalue`) — Que devient la journée quand untel est absent ? (`repare`) — Et la semaine, jusqu'au retour à la normale ? (`reparePeriode`) |
| `interface/` — l'application, React | Grille du planning, saisie d'une absence qui dure, plannings enregistrés, import depuis un tableur, réglages. Ne recalcule rien : appelle le moteur et affiche ce qu'il rend. |

## Démarrer

```bash
npm install
./verifier.sh      # typecheck, tests du moteur, build de l'interface
npm run dev        # l'application, en local
```

Ou en ligne de commande, sans interface :

```bash
node scripts/valider.ts examples/structure.json examples/jour.json
```

Valide les deux fichiers, répare la journée du 14 septembre 2026 (une éducatrice en
arrêt, une autre partie à 13 h 30, un jeune absent, un intérimaire disponible) et
imprime le planning obtenu.

## L'application

**Écran Planning** — la grille, par salle, par éducateur ou par jeune. Une case vide sur
l'axe « salle » est une salle libre : ce n'est pas un module à part, c'est la même
grille lue à l'envers.

**Écran Période** — une situation qui dure (« Lucas absent du 14 au 19 ») projetée sur
chaque jour d'accueil, jusqu'au **retour au fonctionnement initial** — la première date
à partir de laquelle plus rien ne bouge. Les quotas hebdomadaires, invisibles journée
par journée, sortent ici.

**Écran Plannings** — les situations enregistrées sous un nom (« absence Lucas
semaine »). Chacune garde la situation *et* le résultat tel qu'il a été produit, figé :
c'est ce qui a été imprimé et annoncé à l'équipe, ça ne bouge plus. « Recalculer »
relance le moteur à côté et montre ce qui aurait changé, sans rien écraser.

**Écran Fichiers** — importer un `structure.json`, ou un planning collé/déposé depuis un
tableur (Numbers, Excel). Un écran de correspondance classe chaque nom rencontré —
jeune, éducateur, ou à ignorer — avant que quoi que ce soit ne soit chargé : un tableur
dit « Marie Dupont », jamais `e1`.

**Écran Règles** — activer, pondérer, régler la portée (`presence` / `binome`) des
règles chargées. **Écran Structure** — ce que la structure chargée contient, en lecture.
**Écran Réglages** — les arbitrages du moteur (priorité de réparation, détachement,
encadrement), le thème, le stockage local.

## Utilisation du moteur

```ts
import { chargeStructure, repare, reparePeriode, formate } from 'planning-ime';

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

`repare` ne modifie rien sur place : elle renvoie le planning de départ (`initial`), le
planning réparé (`planning`), les changements avec leur motif, les conflits non résolus
et les règles violées. Rien n'est implicite.

Le comportement s'ajuste sans toucher au code :

```ts
repare(ref, jour, { priorite: 'educateurs' });          // préserver l'équipe plutôt que les jeunes
repare(ref, jour, { detachement: 'indisponible' });     // un détaché n'est plus rappelable
repare(ref, jour, { encadrement: 'ratioGroupe' });      // ratio par groupe au lieu du décimal
repare(ref, jour, { couts: { recoursRenfort: 200 } });  // l'intérim en tout dernier recours
```

Sur plusieurs jours :

```ts
import { reparePeriode, auditeSemaine } from 'planning-ime';

const resultat = reparePeriode(ref, { structureVersion: 7, du: '2026-09-14', au: '2026-09-19', absences: [...] });
console.log(resultat.retourNominal); // premier jour où plus rien ne bouge, ou null

const semaine = auditeSemaine(ref); // le planning type tel qu'il tourne, quotas hebdomadaires compris
```

## Les fichiers

`structure.json` est stable et circule par mail ; `jour.json` (une date) et
`periode.json` (un intervalle) portent les absences et ne circulent pas. Les trois ont
un JSON Schema dans [`schemas/`](./schemas) : c'est le contrat, valable pour n'importe
quel outil, pas seulement pour ce code. La validation TypeScript s'appuie dessus, puis y
ajoute ce qu'un schéma ne sait pas dire — identifiants en double, références croisées,
créneaux non alignés sur la grille, chevauchements, capacités, cohérence des règles et
des binômes.

Chaque problème est rendu avec un code stable, un pointeur JSON et un message en clair :

```
ERREUR /planningType/3 [creneau.chevauchement] educateur "e1" est aussi sur "p105" a 10:00 (lundi)
AVERT. /regles/7 [regle.commentaire] regle sans commentaire : dans six mois, personne ne saura pourquoi
```

Les erreurs bloquent le chargement, les avertissements non.

## Le binôme, et la portée des règles

Un créneau ne dit pas seulement qui est présent, mais qui est avec qui —
`affectations: [{ jeuneId, educateurId }]`, facultatif et partiel. Sans binôme nommé
pour un jeune, tous les éducateurs du créneau comptent comme étant auprès de lui.

Chaque règle qui met en rapport un jeune et un éducateur prend `params.porte:
"presence" | "binome"` — sur quoi elle se juge. Les défauts ne sont pas symétriques :
une autorisation se précise avec la donnée (`educateurs_autorises` → `binome`), une
interdiction ne se relâche pas (`educateurs_interdits` → `presence`). Détail complet
dans [`docs/decisions.md`](./docs/decisions.md).

## Les règles

Les douze types du catalogue sont implémentés. **Ajouter une règle, c'est ajouter une
entrée dans le tableau `regles` du fichier — jamais toucher au code.**

| type | cibles | params |
|---|---|---|
| `educateurs_autorises` | `jeunes` | `educateurs[]`, `mode`, `porte` |
| `educateurs_interdits` | `jeunes` | `educateurs[]`, `porte` |
| `binome_jeunes` | `jeunes` (2+) | `educateursRequis` |
| `jeunes_incompatibles` | `jeunes` (2+) | — |
| `rotation_educateur` | `jeunes` | `tousLesPas`, `fenetre`, `porte` |
| `quota_detachement` | `educateurs` | `maxPasParJour`, `maxPasParSemaine` |
| `perimetre_renfort` | `educateurs` | `jeunesAutorises[]`, `activitesAutorisees[]`, `porte` |
| `taux_encadrement` | `groupes` ou `activites` | `ratioJeunesParEduc` |
| `salle_requise` | `activites` ou `jeunes` | `salles[]` ou `tag` |
| `continuite_journee` | `jeunes` | `maxChangements`, `sur`, `porte` |
| `presence_minimale` | `groupes` | `educMin` |
| `indisponibilite_recurrente` | `educateurs` | `jour`, `debut`, `fin` |

Ajouter un *type* de règle demande du code : un fichier dans `src/regles/catalogue/` et
une ligne dans `src/regles/registre.ts`. Rien d'autre dans le moteur n'a besoin de le
connaître.

## Vues

La vue « salles libres » n'est pas un module : c'est la grille des salles moins les
salles occupées à chaque pas, et elle sort gratuitement du modèle.

```ts
sallesLibres(ref, planning);                   // par pas : libres + occupant de chaque salle
educateursLibres(ref, planning, mobilisable);  // mobilisables et non affectés
jeunesSansAffectation(ref, planning, etat);    // les oubliés du planning
```

## Import depuis un tableur

`src/import/tableur.ts` lit un CSV/TSV collé ou déposé — coller depuis Numbers ou
Excel, ou un fichier exporté. Il ne fait que découper et lire : il ne fabrique rien,
il ne décide pas qui est jeune ou éducateur.

```ts
import { decoupeTableau, litPlanning, proposeCorrespondances, assemble } from 'planning-ime';

const lu = litPlanning(decoupeTableau(texteColle));
const correspondances = proposeCorrespondances(referentiel, nomsRencontres(lu));
// ... l'écran de correspondance laisse confirmer/corriger, puis :
const { structure, problemes } = assemble(lu, { base: structureExistante, jour: 'vendredi', correspondances });
```

`assemble()` remplace les créneaux du jour importé sans toucher aux autres — réimporter
le même jour ne les duplique pas. Un créneau sans binôme nommé (une activité collective)
garde des listes vides plutôt que d'inventer qui y participe, et c'est signalé.

## Organisation

```
schemas/     structure, jour, periode — le contrat transmissible
src/
  types.ts, temps.ts, dates.ts    types, conversions heure/pas, arithmétique de dates (UTC)
  referentiel.ts                  vue indexée d'une structure
  encadrement.ts, detachement.ts, affectations.ts
  planning/                       modèle du planning d'une journée et sa construction
  regles/                         socle, registre, un fichier par type de règle
  moteur/                         options, état du jour, disponibilités, solveur, semaine, période
  import/                         lecteur de tableur, correspondance des noms, assemblage
  vues.ts                         lectures dérivées
interface/   App.jsx — l'application, ses écrans, son stockage local
examples/    une structure de référence complète (noms inventés — le dépôt est public)
docs/        schema.md (spécification) et decisions.md (arbitrages)
```

## Ce qui a été tranché

Les arbitrages du moteur — priorité de réparation, détachement, encadrement, portée des
règles, échelle du pas, retour au fonctionnement initial, chiffrement de l'export — sont
réglés avec leur raisonnement dans [`docs/decisions.md`](./docs/decisions.md), ainsi que
les écarts assumés et **ce que le solveur ne fait pas**. À lire avant de s'appuyer
dessus.

Le dépôt est **public** : aucune donnée nominative réelle ne doit y être commitée.
Détails dans [`CLAUDE.md`](./CLAUDE.md).
