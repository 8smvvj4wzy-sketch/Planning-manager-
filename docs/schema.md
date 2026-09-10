# Fichier de structure — Planning IME

> Spécification d'origine, conservée telle quelle comme document de référence.
> Les points laissés ouverts en fin de document sont tranchés dans
> [`decisions.md`](./decisions.md), qui recense aussi les précisions apportées
> à l'implémentation. Le contrat exécutable, lui, est dans
> [`../schemas/structure.schema.json`](../schemas/structure.schema.json).

Spécification du fichier `structure.json` : c'est **le** fichier qui circule par mail et
qui définit tout ce que le moteur sait faire.

---

## Principes retenus

1. ~~**Pas de base : 30 minutes.**~~ **Démenti par le terrain.** Le planning réel a des
   bornes à 11h15, 12h10 et 13h30 : le plus grand pas qui tombe juste sur toutes est
   **5 minutes**. `pasMinutes` étant un paramètre du fichier, il n'y a rien à recoder —
   mais toute durée, tout quota et toute rotation s'exprimant en pas **change d'échelle
   avec lui** : `tousLesPas: 2` vaut dix minutes avec un pas de 5, pas une heure.
   Voir `decisions.md`.
2. **Deux fichiers séparés.** `structure.json` (stable, transmissible) et `jour.json`
   (absences + retouches du jour, jamais transmis).
3. **Toute règle est un objet du même format.** Ajouter une règle = ajouter une entrée dans
   le tableau `regles`, jamais toucher au code.
4. **Anonymisation.** Initiales uniquement pour les jeunes, comme dans l'appli ABA.
   Les éducateurs sont nommés (nécessaire pour l'usage), mais le fichier reste interne.

---

## Structure générale

```json
{
  "meta": { ... },
  "grille": { ... },
  "salles": [ ... ],
  "groupes": [ ... ],
  "jeunes": [ ... ],
  "educateurs": [ ... ],
  "activites": [ ... ],
  "planningType": [ ... ],
  "regles": [ ... ]
}
```

---

## 1. `meta`

Sert à éviter que deux personnes travaillent sur deux versions différentes.

```json
"meta": {
  "version": 7,
  "dateModification": "2026-09-09",
  "auteur": "CM",
  "etablissement": "IME",
  "libelle": "Année 2026-2027 — période 1"
}
```

**Règle d'usage :** le numéro de `version` s'incrémente à chaque envoi. L'appli refuse
d'importer un fichier dont la version est inférieure à celle déjà chargée (avec possibilité
de forcer).

---

## 2. `grille`

Le cadre temporel commun à tout le planning.

```json
"grille": {
  "pasMinutes": 30,
  "jours": ["lundi", "mardi", "mercredi", "jeudi", "vendredi"],
  "debut": "09:00",
  "fin": "16:30",
  "pauses": [
    { "debut": "12:00", "pas": 2, "libelle": "Repas" }
  ]
}
```

Les pauses sont des temps communs : le moteur n'y affecte personne et n'y réclame aucun
encadrement. Concrètement, `mobilisable` rend `false` sur un pas de pause, et
`educateursRequis` rend `0` pour un créneau dont *tous* les pas sont des pauses.

On peut y affecter **à la main** (surveillance du repas) : ce qui est écrit dans le fichier
est respecté, le moteur ne retire rien.

Un créneau **à cheval** — moitié pause, moitié non — garde son besoin d'encadrement entier.
L'encadrement se calcule par créneau, pas par pas. Si ce n'est pas ce qu'on veut, il faut
couper le créneau en deux.

---

## 3. `salles`

```json
"salles": [
  { "id": "s1", "nom": "Salle 1", "capacite": 8, "tags": ["classe"] },
  { "id": "s2", "nom": "Salle snoezelen", "capacite": 2, "tags": ["sensoriel"] },
  { "id": "gym", "nom": "Gymnase", "capacite": 15, "tags": ["sport"] },
  { "id": "ext", "nom": "Extérieur", "capacite": 99, "tags": ["hors-les-murs"] }
]
```

Les `tags` permettent d'écrire des règles génériques (« cette activité exige une salle
`sensoriel` ») sans lister chaque salle.

> La vue « salles libres » n'est pas un module à part : c'est la grille des salles moins les
> salles occupées à chaque pas. Elle sort gratuitement de ce modèle.

---

## 4. `groupes`

```json
"groupes": [
  { "id": "g1", "nom": "Groupe A", "refEducateurs": ["e1", "e2"] },
  { "id": "g2", "nom": "Groupe B", "refEducateurs": ["e3"] }
]
```

---

## 5. `jeunes`

```json
"jeunes": [
  {
    "id": "j1",
    "initiales": "L.M.",
    "groupeId": "g1",
    "encadrement": 1,
    "presence": {
      "lundi":    { "debut": "09:00", "fin": "16:30" },
      "mercredi": { "debut": "09:00", "fin": "12:00" }
    },
    "actif": true
  }
]
```

- `encadrement` : nombre d'éducateurs requis pour ce jeune seul (1 = individuel,
  0.33 = compte pour un tiers d'éducateur en collectif). C'est ce qui permet au moteur de
  vérifier qu'un groupe est correctement encadré.
- `presence` : emploi du temps de présence hebdomadaire du jeune. Un jour absent de l'objet
  = pas accueilli ce jour-là.

---

## 6. `educateurs`

```json
"educateurs": [
  {
    "id": "e1",
    "nom": "Dupont",
    "prenom": "Marie",
    "statut": "titulaire",
    "fonctions": ["educateur"],
    "disponibilites": {
      "lundi":  { "debut": "09:00", "fin": "17:00" },
      "mardi":  { "debut": "09:00", "fin": "17:00" }
    },
    "detachable": true,
    "actif": true
  },
  {
    "id": "r1",
    "nom": "Intérim 1",
    "statut": "renfort",
    "fonctions": ["renfort"],
    "disponibilites": { "lundi": { "debut": "09:00", "fin": "16:30" } },
    "detachable": false,
    "actif": true
  }
]
```

`statut` : `titulaire` | `renfort` | `autre-batiment` | `stagiaire`.
Il sert de cible générique dans les règles (« aucun `stagiaire` seul avec un jeune en 1:1 »).

---

## 7. `activites`

```json
"activites": [
  {
    "id": "a1",
    "nom": "Atelier cuisine",
    "dureePas": 2,
    "sallesPossibles": ["cuisine"],
    "tagSalleRequis": null,
    "capaciteJeunes": 4,
    "educateursRequis": 1
  },
  {
    "id": "a2",
    "nom": "Piscine",
    "dureePas": 3,
    "sallesPossibles": ["ext"],
    "capaciteJeunes": 6,
    "educateursRequis": 3
  }
]
```

`educateursRequis` peut être `null` : dans ce cas le nombre est déduit de la somme des
`encadrement` des jeunes affectés.

---

## 8. `planningType`

Le planning de référence, celui qui tourne quand tout le monde est là. C'est le point de
départ que le moteur cherchera à **modifier le moins possible**.

```json
"planningType": [
  {
    "id": "p001",
    "jour": "lundi",
    "debut": "09:00",
    "pas": 2,
    "activiteId": "a1",
    "salleId": "cuisine",
    "jeunes": ["j1", "j3"],
    "educateurs": ["e1"],
    "verrouille": false
  }
]
```

`verrouille: true` = créneau intouchable même en cas d'absence (rendez-vous extérieur,
séance d'orthophonie, transport). Le moteur contournera au lieu de le déplacer.

### `affectations` — qui est avec qui

Ajouté après lecture d'un planning réel, qui ne dit pas « ces jeunes et ces éducateurs
sont ensemble » mais « Habib avec Agathe, Héléna avec Sabrina ».

```json
"affectations": [
  { "jeuneId": "j3", "educateurId": "e1" },
  { "jeuneId": "j4", "educateurId": "e2" }
]
```

Facultatif et **partiel** : une activité collective n'en a pas, un créneau peut n'en
nommer que pour certains de ses jeunes, un jeune peut avoir plusieurs accompagnants.
`jeunes[]` et `educateurs[]` restent la vérité sur qui est présent ; `affectations` dit
qui accompagne qui. Sans binôme nommé pour un jeune, tous les éducateurs du créneau
comptent comme étant auprès de lui.

---

## 9. `regles` — le cœur du système

Format commun à toutes les règles :

```json
{
  "id": "r001",
  "type": "educateurs_autorises",
  "dure": true,
  "poids": 100,
  "actif": true,
  "cibles": { "jeunes": ["j1"] },
  "params": { "educateurs": ["e1", "e2"] },
  "commentaire": "Décision réunion du 02/09"
}
```

- `dure: true` → jamais violée. Si aucune solution n'existe, le moteur signale le conflit.
- `dure: false` → le moteur essaie de la respecter ; `poids` arbitre entre règles souples
  concurrentes (plus le poids est élevé, plus la violation coûte cher).
- `commentaire` : essentiel dans la durée. Dans six mois, personne ne se souviendra
  pourquoi telle règle existe.

### Catalogue des types de règles

| type | cibles | params | dure par défaut |
|---|---|---|---|
| `educateurs_autorises` | `jeunes` | `educateurs[]` | oui |
| `educateurs_interdits` | `jeunes` | `educateurs[]` | oui |
| `binome_jeunes` | `jeunes` (2+) | `educateursRequis` | non |
| `jeunes_incompatibles` | `jeunes` (2+) | — | oui |
| `rotation_educateur` | `jeunes` | `tousLesPas`, `fenetre` | non |
| `quota_detachement` | `educateurs` | `maxPasParJour`, `maxPasParSemaine` | oui |
| `perimetre_renfort` | `educateurs` | `jeunesAutorises[]`, `activitesAutorisees[]` | oui |
| `taux_encadrement` | `groupes` ou `activites` | `ratioJeunesParEduc` | oui |
| `salle_requise` | `activites` ou `jeunes` | `salles[]` ou `tag` | oui |
| `continuite_journee` | `jeunes` | `maxChangements` | non |
| `presence_minimale` | `groupes` | `educMin` | oui |
| `indisponibilite_recurrente` | `educateurs` | `jour`, `debut`, `fin` | oui |

### Exemples correspondant à tes cas

```json
"regles": [
  {
    "id": "r001", "type": "educateurs_autorises", "dure": true, "actif": true,
    "cibles": { "jeunes": ["j1"] },
    "params": { "educateurs": ["e1", "e2"] },
    "commentaire": "L.M. uniquement avec Marie ou Karim"
  },
  {
    "id": "r002", "type": "binome_jeunes", "dure": false, "poids": 60, "actif": true,
    "cibles": { "jeunes": ["j3", "j4"] },
    "params": { "educateursRequis": 1 },
    "commentaire": "Fonctionnent bien ensemble, 1 seul éduc suffit"
  },
  {
    "id": "r003", "type": "rotation_educateur", "dure": false, "poids": 80, "actif": true,
    "cibles": { "jeunes": ["j5"] },
    "params": { "tousLesPas": 2 },
    "commentaire": "Éducateur différent toutes les heures"
  },
  {
    "id": "r004", "type": "quota_detachement", "dure": true, "actif": true,
    "cibles": { "educateurs": ["e2"] },
    "params": { "maxPasParJour": 4 },
    "commentaire": "Karim détaché max 2h/jour (mission transversale)"
  },
  {
    "id": "r005", "type": "perimetre_renfort", "dure": true, "actif": true,
    "cibles": { "educateurs": ["r1"] },
    "params": { "jeunesAutorises": ["j3", "j4", "j6"] },
    "commentaire": "Intérim : seulement sur les jeunes sans besoin spécifique"
  }
]
```

---

## Fichier `jour.json` (non transmis)

```json
{
  "structureVersion": 7,
  "date": "2026-09-14",
  "absences": [
    { "type": "educateur", "id": "e1", "journee": true },
    { "type": "educateur", "id": "e3", "debut": "13:30", "fin": "16:30" },
    { "type": "jeune", "id": "j5", "journee": true }
  ],
  "renfortsDuJour": ["r1"],
  "epingles": ["p012", "p034"],
  "affectationsManuelles": [ /* même format que planningType */ ]
}
```

`structureVersion` permet à l'appli de refuser un fichier du jour construit sur une
structure périmée.

---

## Points à trancher avant de coder

1. **Le coût d'un changement.** Quand le moteur répare, faut-il minimiser le nombre de
   jeunes impactés, ou le nombre d'éducateurs déplacés ? Les deux donnent des plannings
   très différents.
2. **Détachement.** Un éducateur détaché est-il retiré du terrain (donc indisponible), ou
   reste-t-il mobilisable en urgence ? Cela change la façon de compter les effectifs.
3. **Encadrement fractionnaire.** Le champ `encadrement` en décimal (0.33) est simple mais
   approximatif. L'alternative est un `taux_encadrement` par groupe uniquement, plus rustique
   mais plus lisible pour les équipes.
