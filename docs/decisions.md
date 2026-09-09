# Décisions

Ce document répond aux « points à trancher avant de coder » de la spécification,
et consigne les écarts assumés par rapport à celle-ci. Toutes ces décisions sont
réversibles : elles vivent dans `OptionsMoteur` (`src/moteur/options.ts`), pas
dans le code du solveur.

---

## 1. Le coût d'un changement

**Question.** Quand le moteur répare, faut-il minimiser le nombre de jeunes
impactés, ou le nombre d'éducateurs déplacés ?

**Décision.** Les jeunes d'abord (`priorite: 'jeunes'`, valeur par défaut). Une
journée bousculée coûte plus cher à un jeune qu'à un adulte : c'est lui qui subit
la rupture de repère, pas l'équipe. Le barème :

| poste | `priorite: 'jeunes'` | `priorite: 'educateurs'` |
|---|---|---|
| `jeuneImpacte` | 100 | 40 |
| `educateurDeplace` | 40 | 100 |
| `creneauModifie` | 10 | 10 |
| `creneauNonResolu` | 10 000 | 10 000 |
| `mobilisationDetache` | 150 | 150 |
| `recoursRenfort` | 25 | 25 |

`creneauNonResolu` est volontairement à deux ordres de grandeur au-dessus du
reste : le moteur doit toujours préférer une journée bancale à une journée avec
un groupe non encadré.

Basculer le curseur ne demande pas de recompiler :

```ts
repare(ref, jour, { priorite: 'educateurs' });
repare(ref, jour, { couts: { recoursRenfort: 200 } }); // « l'intérim en dernier recours »
```

**À vérifier sur le terrain.** Le rapport 100/40 est un pari. Faites tourner les
deux priorités sur trois journées réelles et comparez les plannings avant de le
figer.

---

## 2. Détachement

**Question.** Un éducateur détaché est-il retiré du terrain (donc indisponible),
ou reste-t-il mobilisable en urgence ?

**Décision.** Mobilisable, mais cher (`detachement: 'mobilisable'`, par défaut).
C'est ce qui se passe en vrai : on ne rappelle pas quelqu'un d'une mission
transversale pour un confort d'organisation, on le rappelle quand il n'y a plus
d'autre solution. Le surcoût `mobilisationDetache` (150) place le détaché
derrière toutes les autres options sans jamais l'exclure.

Les trois modes :

- `indisponible` — le détaché sort du calcul des effectifs. Plus lisible pour les
  équipes, mais produit des conflits là où une solution existait.
- `mobilisable` — le détaché reste candidat, en dernier.
- `libre` — le détachement n'a aucun effet sur la disponibilité.

**Définition retenue de « détaché ».** Un éducateur est détaché sur un créneau
si aucun des jeunes présents n'appartient à un groupe dont il est éducateur de
référence (`src/detachement.ts`). C'est ce compte que plafonne la règle
`quota_detachement`. Un éducateur sans groupe de référence n'est jamais compté
comme détaché — sinon un remplaçant serait détaché en permanence.

Un éducateur dont `detachable` vaut `false` n'est jamais placé hors de son
périmètre de référence, quel que soit le mode.

---

## 3. Encadrement fractionnaire

**Question.** Garder le champ `encadrement` en décimal (0.33), ou passer à un
`taux_encadrement` par groupe, plus rustique mais plus lisible ?

**Décision.** Le décimal est conservé (`encadrement: 'individuel'`, par défaut),
avec le mode `ratioGroupe` disponible en une ligne d'option. Deux raisons :

1. Le décimal porte une information que le ratio de groupe perd — le jeune en 1:1
   et celui qui « compte pour un tiers » sont dans le même groupe.
2. Les deux modes cohabitent sans conflit : la règle `taux_encadrement` reste un
   plafond dur dans les deux cas. En mode `individuel` elle vérifie, en mode
   `ratioGroupe` elle dimensionne.

**Le piège d'arrondi, réglé.** `0.33 × 3 = 0.99` en virgule flottante, et un
`Math.ceil` naïf donnait 1 ici et 2 ailleurs selon l'ordre des additions. La
somme est arrondie à trois décimales avant plafonnement
(`arrondiStable`, `src/encadrement.ts`), et un test le verrouille.

Ordre de décision de l'effectif requis sur un créneau :

1. une règle `binome_jeunes` active qui couvre exactement les jeunes présents ;
2. `activite.educateursRequis`, s'il est renseigné ;
3. le mode d'encadrement retenu.

---

## Écarts et précisions par rapport à la spécification

Ces points n'étaient pas tranchés par le document d'origine ; ils le sont ici.

**`educateurs_autorises` est exclusif par défaut.** « L.M. uniquement avec Marie
ou Karim » se lit : *tout* éducateur présent sur un créneau de L.M. doit figurer
dans la liste. C'est la lecture la plus sûre pour une règle dure, mais elle
interdit à L.M. les activités collectives à trois adultes. Un paramètre
`mode: "au-moins-un"` relâche la contrainte quand c'est le sens voulu.

**`quota_detachement.maxPasParSemaine` n'est pas évaluable sur une journée.**
Il est vérifié par `evalueSemaine()`, sur l'ensemble des journées de la semaine.
`maxPasParJour` reste évalué à chaque réparation.

**`continuite_journee` prend un paramètre `sur`.** Les ruptures se comptent par
défaut sur l'équipe d'éducateurs ; `sur: "salle"` ou `sur: "activite"` comptent
les autres formes de rupture.

**`rotation_educateur` accepte `fenetre` en plus de `tousLesPas`.**
`tousLesPas` plafonne une séquence continue avec le même éducateur ; `fenetre`
exige au moins deux éducateurs différents sur toute fenêtre glissante.

**Une absence est soit `journee: true`, soit `debut` + `fin`.** Le schéma refuse
la combinaison des deux, qui n'a pas de sens univoque.

**Un éducateur partiellement absent est retiré de tout le créneau.** Il ne peut
pas en assurer la totalité ; le solveur lui cherche un remplaçant pour l'ensemble.

**Un créneau `verrouille` peut recevoir un éducateur, jamais en perdre un.**
« Le moteur contournera au lieu de le déplacer » : contourner veut dire ne pas y
puiser. Ajouter quelqu'un sur un créneau sous-encadré ne le déplace pas, et c'est
souvent la seule façon de le sauver. Idem pour un créneau épinglé dans `jour.json`.

**L'admissibilité se juge en écart, pas dans l'absolu.** Un planning en cours de
réparation viole déjà des règles dures — c'est ce qu'on répare. Le solveur
accepte donc un candidat qui *n'ajoute pas* de violation, plutôt que d'exiger un
essai irréprochable. Sans cela, un créneau cassé quelque part bloquerait toute
réparation ailleurs.

---

## Ce que le solveur ne fait pas

Il faut le savoir avant de s'appuyer dessus :

- **Il ne déplace pas les jeunes.** Il ne change ni les horaires, ni les salles,
  ni la composition des groupes. Il affecte et réaffecte des éducateurs. Un
  créneau qu'aucun adulte ne peut couvrir devient un conflit signalé, pas un
  créneau déplacé.
- **Il ne crée pas de créneau.** Un jeune présent sans activité apparaît dans
  `jeunesSansAffectation()`, à l'humain de trancher.
- **Sa recherche est gloutonne**, pas exhaustive : premier comblement au moindre
  coût, puis substitutions tant que le coût baisse. Sur des plannings de cette
  taille (quelques dizaines de créneaux) le résultat est bon et surtout
  explicable — chaque changement porte son motif. Il n'est pas garanti optimal.
- **Il ne répare qu'une journée à la fois.** Les quotas hebdomadaires se
  vérifient après coup, ils ne guident pas la recherche.

---

# Ce que le planning réel a corrigé

Les décisions ci-dessus ont été prises sur la spécification seule. La lecture d'un
planning d'établissement réel en a démenti une et en a rendu une autre indispensable.

## 4. Le pas de 30 minutes ne tient pas

Les bornes horaires réelles ne sont pas régulières : 9h30, 10h, 10h30, 11h, **11h15**,
12h, **12h10**, 13h10, **13h30**, 14h30, 15h, 15h30. Le plus grand pas qui tombe juste
sur toutes ces bornes est **5 minutes**.

`pasMinutes` étant déjà un paramètre du fichier et le schéma acceptant 5, il n'y a rien
à recoder. Mais la conséquence doit être écrite noir sur blanc, parce qu'elle est
silencieuse : **toute règle exprimée en pas change d'échelle avec le pas.** Avec
`pasMinutes: 5`, `tousLesPas: 2` veut dire dix minutes, `maxPasParJour: 4` vingt
minutes, et une activité d'une heure fait `dureePas: 12`. Un fichier passé de 30 à 5
minutes sans retoucher ses règles ne dit plus du tout la même chose.

## 5. Le binôme jeune/éducateur

Un créneau ne dit pas seulement qui est présent, il dit **qui est avec qui** : « Mand :
Valentin / Simon, Habib / Agathe, Héléna / Sabrina » — une activité, trois paires
nommées. Le modèle d'origine perdait cette information, et avec elle la moitié du sens
de ses propres règles : `educateurs_autorises` ne pouvait vérifier que la co-présence
dans la salle, et `rotation_educateur` ne savait pas de quel éducateur le jeune change.

D'où `affectations: [{ jeuneId, educateurId }]` sur le créneau — facultatif et partiel.

**Repli, valable partout :** sans binôme nommé pour un jeune, tous les éducateurs du
créneau comptent comme étant auprès de lui. C'est ce qui laisse fonctionner à
l'identique les plannings qui ne nomment pas leurs paires.

**La nature nominative d'un créneau survit aux absences.** Le drapeau `nominatif` du
planning résolu retient que le créneau *d'origine* nommait ses binômes. Sans lui, une
absence qui vide les paires d'un créneau le ferait passer pour un collectif, et le
solveur ne refermerait jamais la paire qu'il vient de rompre — le jeune se retrouverait
avec un remplaçant, mais sans référent nommé, et les règles en portée binôme
retomberaient sur le repli sans que personne ne l'ait décidé.

## 6. La portée des règles : `porte`

Une fois les binômes disponibles, chaque règle qui met en rapport un jeune et un
éducateur doit dire ce qu'elle regarde. `params.porte` :

- `presence` — la personne est sur le créneau, point ;
- `binome` — elle est nommée auprès de ce jeune.

Les défauts ne sont pas symétriques, et c'est délibéré :

| règle | défaut | pourquoi |
|---|---|---|
| `educateurs_autorises` | `binome` | Une autorisation gagne en justesse dès qu'on sait qui accompagne. En `presence`, « L.M. uniquement avec Marie ou Karim » lui interdit toute activité collective à trois adultes. |
| `educateurs_interdits` | `presence` | Une interdiction ne se relâche pas parce que la donnée s'affine : « pas de stagiaire avec N.K. » reste vrai si le stagiaire est dans la pièce sans en être le référent. |
| `perimetre_renfort` | `presence` | Règle de sécurité, même raison. |
| `rotation_educateur` | `binome` | La rotation porte sur l'accompagnant, pas sur qui passe dans la salle. |
| `continuite_journee` (`sur: "educateurs"`) | `binome` | La rupture que vit le jeune, c'est le changement de référent. |

Le principe derrière la table : **une permission se précise avec la donnée, une
interdiction ne se relâche pas avec elle.** Changer un défaut change ce que le moteur
autorise — ce n'est pas un réglage d'affichage.

Une seule fonction porte cette sémantique, `educateursSelonPorte`
(`src/affectations.ts`) ; les cinq règles s'en servent. Cinq définitions concurrentes de
la portée finiraient par diverger.

## 7. La semaine, et l'absence qui dure

Deux couches s'ajoutent au-dessus du solveur journalier, sans en réécrire une ligne.

**La semaine n'est pas cinq journées mises bout à bout.** Les quotas hebdomadaires
(`quota_detachement.maxPasParSemaine`) ne sont visibles que là : un éducateur peut
respecter son plafond journalier tous les jours de la semaine et dépasser son plafond
hebdomadaire. `auditeSemaine` (`src/moteur/semaine.ts`) audite chaque jour d'accueil de
la grille puis passe les plannings obtenus à `evalueSemaine`, qui existait déjà.

**Une absence qui dure se projette sur chaque date.** `FichierPeriode` borne les
absences par des dates (`du` / `au`), et `reparePeriode` produit un planning par jour
d'accueil de l'intervalle. Le fichier du jour reste l'unité atomique du moteur : la
période le fabrique, elle ne le remplace pas.

Quatre points qui ont demandé une décision :

- **Le retour au fonctionnement initial se lit depuis la fin.** `retourNominal` est la
  première date à partir de laquelle *toutes les suivantes* sont nominales, pas la
  première journée calme rencontrée. Une accalmie au milieu d'une absence n'est pas un
  retour à la normale, et l'annoncer comme tel serait un mensonge utile à personne.
- **Une journée sans créneau est nominale.** Rien à faire veut bien dire rien à changer.
  Conséquence à connaître : sur une grille dont certains jours sont vides, le retour à
  la normale peut tomber sur un de ces jours — il est correct, mais il ne prouve rien
  sur la reprise réelle.
- **Une absence sans terme oblige à borner la période.** Sinon la série n'a pas de fin.
  Le moteur lève plutôt que de produire un résultat arbitraire, et la validation le dit
  avant (`periode.sans-fin`).
- **Les quotas se comptent par semaine ISO.** Une période à cheval sur deux semaines a
  deux plafonds distincts, pas un seul étalé sur dix jours. D'où `cleSemaineIso`
  (`src/dates.ts`).

**Toute l'arithmétique de dates est en UTC.** Construire un `Date` local et ajouter
24 h se décale d'une heure au passage à l'heure d'hiver, et une série de journées finit
par sauter ou répéter un jour. Les dates du modèle sont des jours calendaires, pas des
instants — `src/dates.ts` ne fait rien d'autre que tenir cette distinction.

## 8. Un planning enregistré est figé

Un planning produit et affiché a été imprimé, affiché au mur, annoncé à l'équipe. Il ne
doit plus bouger — même si la structure évolue ensuite. C'est pourquoi un scénario
enregistré garde **deux choses** : la situation saisie (« Lucas absent du 14 au 19 ») et
le gel, c'est-à-dire le résultat tel qu'il a été produit.

Rouvrir un planning enregistré affiche le gel, sans relancer le moteur : sinon ce ne
serait plus le planning enregistré. « Recalculer » relance le calcul **à côté** et
`comparePeriodes` dit ce qui aurait changé — quelles journées, quels créneaux, quels
jeunes. Rien n'est écrasé.

Quand la structure a changé de version depuis l'enregistrement, l'écran le signale avant
tout le reste : un gel calculé sur une autre structure ne se compare pas naïvement, les
identifiants ont pu changer de sens.

Le stockage est local (`planning-ime:scenarios`), comme tout le reste. Une semaine gelée
pèse quelques dizaines de Ko ; le repli IndexedDB ne se justifierait qu'au-delà de ~2 Mo
cumulés, soit une centaine de scénarios. À surveiller, pas à anticiper.
