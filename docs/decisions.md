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

## 9. L'import depuis un tableur

Le planning réel vit dans un tableur — Numbers, sur iPhone. Deux portes d'entrée :
coller le contenu copié, ou déposer un fichier CSV/TSV exporté. Les deux passent par le
même lecteur (`src/import/tableur.ts`), qui ne fait que découper et lire — il ne
fabrique rien, il ne devine pas qui est jeune ou éducateur.

**Trois propriétés du format ont guidé le lecteur**, déduites du planning réel envoyé en
capture, pas supposées :

- la première colonne porte les heures, et sert à retrouver la grille (voir décision 4) ;
- les colonnes suivantes sont des couloirs d'activités simultanées, sans identité
  fixe — confirmé : un jeune peut décrocher du collectif pour une activité à lui, sur
  une durée qui n'est pas celle des autres ;
- une cellule fusionnée sur plusieurs lignes ressort **vide** à l'export : un créneau
  court donc de sa ligne jusqu'à la prochaine cellule non vide du même couloir.

**Le lecteur ne tranche jamais qui est jeune et qui est éducateur.** Il rend les noms
tels qu'ils sont écrits (`nomsRencontres`), et c'est un écran de correspondance qui les
classe avant que quoi que ce soit ne soit chargé — un CSV dit « Marie Dupont », jamais
`e1`. Les noms déjà connus dans la structure chargée sont pré-remplis par
correspondance sur les initiales ou le prénom, accents et casse ignorés
(`proposeCorrespondances`) ; les autres sont proposés comme nouveaux, avec un identifiant
généré par `slugifie`.

**Assembler, c'est fusionner dans une structure, jamais l'inventer d'un bloc.**
`assemble()` (`src/import/assemblage.ts`) prend une lecture, un jour, des
correspondances confirmées, et une structure de départ optionnelle :

- avec une structure (`base`), le jour importé **remplace ses propres créneaux** s'il en
  avait déjà, et les autres jours ne bougent pas — c'est ce qui rend « compléter la
  semaine » possible sans dupliquer à chaque réimport du même jour ;
- sans structure, tout repart de zéro avec ce seul jour — c'est le cas de la toute
  première importation, sur une application vierge.

Un créneau sans binôme nommé (une activité collective comme « Repas ») garde des listes
`jeunes`/`educateurs` vides plutôt que d'inventer qui y participe : l'assembleur le
signale (`import.creneau`), à compléter à la main. Une ligne de cellule qu'il n'a pas su
lire comme un binôme (« Angie (pas dispo) ») est mise de côté dans `restes` et
également signalée — jamais absorbée en silence.

Le résultat assemblé passe par la **même validation** que n'importe quel fichier
(`valideStructure`) avant d'être chargeable : rien ne contourne le contrat.

## 10. Le chiffrement de l'export

Reprise **à l'identique** du schéma de DatABA / DatABA Manager
(`src/App.jsx:155-185` de DatABA Manager) : WebCrypto, PBKDF2-SHA256 à 150 000
itérations, sel de 16 octets, AES-GCM-256, IV de 12 octets, enveloppe
`{ format, version, salt, iv, data }` en base64. Seul le tag change —
`format: 'planning-ime-encrypted'` — pour qu'un fichier DatABA ne soit jamais pris pour
un planning, et inversement.

Même schéma dans les trois applications, délibérément : les habitudes et le niveau de
protection restent les mêmes, et un dépôt qui sait déchiffrer l'un sait déchiffrer
l'autre sans rien adapter.

Trois réserves, assumées :

1. **Le chiffrement n'anonymise pas.** Il protège le fichier en transit ; quiconque a la
   phrase de passe lit les prénoms. Si la phrase circule dans la même boîte mail que le
   fichier, la protection est surtout formelle — l'écran d'export le rappelle au moment
   de la saisir.
2. **150 000 itérations PBKDF2** est un peu bas pour une phrase de passe humaine en
   2026. Choix de parité avec DatABA plutôt que de créer un second standard dans le
   même écosystème ; monter se ferait dans les trois applications ensemble, pas dans
   une seule.
3. **Le contrat de schéma s'affaiblit.** Un fichier chiffré n'est plus validable par un
   autre outil sans la clé. D'où l'export en clair, toujours proposé à côté — c'est lui
   qui reste le contrat lisible.

Détail technique qui a demandé une décision : les types WebCrypto (`CryptoKey`,
`KeyUsage`, `BufferSource`) ne sont pas globaux sans la lib DOM, que ce dépôt exclut
délibérément du moteur (« il ne connaît ni React ni le DOM », `CLAUDE.md`). Plutôt que
d'ajouter `"DOM"` à `tsconfig.json` — ce qui ouvrirait tout `src/` aux globals du
navigateur — `src/transport/chiffrement.ts` importe ces trois noms en **type seul**
depuis `node:crypto` (`import type { webcrypto } from 'node:crypto'`), effacé à la
compilation comme dans le navigateur. Aucune valeur n'en vient : `crypto.subtle` et
`crypto.getRandomValues` restent le global standard, identique en Node et en navigateur.

## 11. Ce que le deuxième planning réel a corrigé

Un vrai export CSV a révélé trois bugs dans l'import, plus deux autres découverts en
vérifiant le correctif sur ce même fichier — les cinq confirmés et corrigés sur les
données réelles, jamais committées (voir CLAUDE.md).

**A — un seul jour importé, toute la semaine dedans.** Le lecteur prenait la première
cellule de titre trouvée et traitait toutes les colonnes comme un seul jour. Le fichier
réel a cinq jours côte à côte, en groupes de colonnes de **largeur inégale** (4 ou 5
selon le jour). Le lecteur détecte maintenant chaque en-tête de jour en tête de son
groupe de colonnes ; un seul groupe trouvé reste le cas particulier d'un seul jour
couvrant toute la ligne — pas un second chemin de code. Un en-tête qui ne correspond à
aucun jour connu donne `jour: null`, jamais deviné, résolu par l'écran de
correspondance.

**B — une cellule à plusieurs jeunes devenait un seul « jeune » au nom absurde.** Le
fichier utilise `+` des deux côtés du `/` (« Héléna + Valentin + Ilian / Camille+Callista »),
pas seulement côté éducateur. `BinomeLu` porte maintenant des listes des deux côtés, et
l'assembleur en tire le produit croisé jeunes × éducateurs.

**C — le dépôt de fichier corrompait les accents.** Le fichier réel est encodé en
windows-1252, pas en UTF-8 (confirmé par l'octet `0xE9` pour « é », qui échoue en UTF-8
strict). `decodeOctets` essaie l'UTF-8 strict puis bascule sur windows-1252 — la même
logique que le chiffrement pour les types WebCrypto : un global standard, pas une API
DOM, testable sans navigateur.

**Le `maxLength` de `initiales` (8) était hérité du principe d'initiales de la
spécification**, jamais révisé quand l'usage réel est devenu le prénom complet —
« Dianguina » (9) le dépassait même une fois B corrigé. Relâché à 40.

**D — trouvé en vérifiant sur le vrai fichier, pas dans le rapport initial : le pas de
grille restait à 30 minutes sur une structure construite depuis zéro**, même quand le
fichier importé avait un pas de 5. `structureVide()` figeait `pasMinutes: 30` en dur ;
`assemble()` ne le corrigeait jamais. Conséquence : chaque heure non ronde (11h15,
12h10…) échouait la validation d'alignement sur la grille — une erreur qui ne pointait
vers rien d'utile. Les bornes de grille par défaut (09:00–17:00) souffraient du même
problème par coïncidence heureuse plutôt que par construction : elles ne sont désormais
plus des placeholders « raisonnables » mais des extrêmes (23:59–00:00) que le premier
élargissement réel ramène exactement aux bornes du fichier — robuste même si un futur
fichier ne tombe pas par chance sur un multiple du pas.

**Une ambiguïté restante, assumée et signalée plutôt que résolue.** Un CSV ne peut pas
distinguer « cette cellule fusionnée s'arrête ici, suivie de cellules vides » de
« fusionnée plus loin » — les deux ressortent identiques à l'export. Quand un couloir ne
comporte plus rien après une cellule, sa durée est signalée précisément
(`CreneauLu.finDeduite: true`, `import.duree-incertaine`), créneau par créneau — plutôt
qu'une remarque générique qui ne visait que la toute dernière ligne du tableau, comme
avant ce correctif. Le repli lui-même (fermeture de journée, puis borne suivante) a
changé : voir §12.

## 12. Le repli d'une durée incertaine doit être minimal, pas maximal

§11 fermait un couloir `finDeduite` sur la fin de journée, en jugeant que le
chevauchement de validation qui en résultait était « la validation qui fait son
travail ». Retesté sur le même fichier réel après correction des bugs A–D, ce choix
s'est révélé être le pire des deux extrêmes plutôt qu'un simple signal : un couloir de
« décroché individuel » (une activité à un jeune, hors du collectif) qui n'est réutilisé
qu'une fois dans la journée devient un bloc de plusieurs heures, qui chevauche
mécaniquement *toutes* les activités suivantes du même jeune dans d'autres couloirs —
plusieurs centaines de `creneau.chevauchement`, noyant les quelques vrais conflits de
données sous un bruit sans rapport avec eux.

La durée réelle reste tout aussi inconnue qu'avant — rien ne permet de la déduire du
CSV — mais entre deux inconnues, choisir la plus courte est le choix le moins
dommageable : elle minimise le risque de chevauchement inventé, quand la maximiser le
garantissait presque. Le repli est donc désormais la **prochaine borne de la grille**
(un seul pas), pas la fermeture de journée. `finDeduite` reste `true` et
`import.duree-incertaine` reste posé dans les deux cas : le signal ne change pas, seule
la valeur choisie en son absence change. Une durée sous-estimée reste visible et
corrigible à la main depuis l'écran de correspondance ; une durée sur-estimée bloquait
la validation entière du fichier.

Vérifié sur le même fichier réel (jamais committé) : les erreurs `creneau.chevauchement`
tombent d'environ 570 à 154 lignes, qui se ramènent à **8 paires de créneaux** réellement
en collision dans les données sources (des jeunes affectés deux fois au même moment,
comme au §11) — plus une seule fois chacune par pas de 5 minutes de leur recouvrement.
Ce ne sont plus des artefacts du repli : ce sont les vrais conflits que la validation est
censée trouver.

## 13. Une cellule fusionnée s'arrête quand la journée avance, pas quand sa colonne se remplit

§12 avait corrigé le repli d'une durée inconnue, mais laissé intacte la règle principale :
un créneau courait jusqu'à la prochaine cellule non vide **du même couloir**. Sur le
fichier réel, ça restait faux, et l'utilisateur l'a formulé exactement : « si une activité
est marquée à 9h30, c'est qu'elle dure jusqu'au prochain créneau ».

Le défaut est le même qu'au §12, à un cran de moins : un couloir peut rester vide
longtemps sans que l'activité qui le précédait dure jusque-là. Il ne sert simplement plus
— le jeune a rejoint le collectif — pendant que la journée continue dans les colonnes
voisines. « Protocole : Adiyan » posé à 9h30 s'étirait ainsi jusqu'à 13h10, trois heures
quarante, là où l'accueil d'à côté durait une heure.

Ce qui distingue les deux cas est dans le fichier, mais pas là où on le cherchait. Une
cellule fusionnée sur plusieurs lignes laisse derrière elle des rangées qui gardent leur
heure et **rien d'autre, nulle part** — un trait de grille. La ligne « 10h » du fichier
réel est vide sur les vingt-quatre colonnes des cinq jours. Une rangée qui porte quelque
chose, où que ce soit, dit au contraire que l'emploi du temps a avancé : ce qui précédait
s'y arrête. D'où la règle : **un créneau court jusqu'à la prochaine rangée non muette**,
et les rangées muettes sont traversées (`rangeesMuettes`, `src/import/tableur.ts`).

Trois règles ont été mesurées sur le fichier réel avant de trancher :

| règle d'extension | erreurs | conflits distincts |
|---|---|---|
| prochaine cellule non vide du même couloir (§12) | 154 | 8 |
| prochaine rangée non vide du même jour | 206 | 3 |
| **prochaine rangée non muette, tout le tableau** | **66** | **3** |

La deuxième échoue sur le mercredi, dont l'après-midi n'est pas détaillé : « vide sur tout
le jour » y devient à tort « toujours fusionné », et trois créneaux de midi s'étirent
jusqu'à 15h30. La troisième garde les vraies fusions (« Accueil » 9h30 → 10h30, traversant
la ligne « 10h » muette) et coupe les fausses.

Les trois conflits restants ne sont pas des artefacts de lecture : deux sont l'alternance
**Semaine A / Semaine B** du mercredi, écrite dans une seule cellule — les mêmes jeunes y
figurent deux fois parce que ce sont des alternatives, et le modèle n'a pas la notion de
semaine paire/impaire. Le troisième est une vraie double affectation (une éducatrice sur
deux activités le jeudi à 14h30). C'est ce que la validation est censée trouver.

**Ce que la règle coûte.** Une vraie fusion longue dans un couloir, pendant que le couloir
voisin tourne vite, sera coupée trop tôt. Le fichier réel n'en contient pas, mais un autre
le pourrait. Le compromis est délibéré et asymétrique : une durée sous-estimée laisse un
trou visible dans la grille, corrigible d'un clic ; une durée sur-estimée invente des
chevauchements en cascade et bloquait la validation entière.

## 14. Une erreur de cohérence n'empêche plus de charger — une erreur de forme, si

L'application refusait tout chargement tant que `valideStructure` rendait la moindre
erreur. Sur un planning réel, qui comporte presque toujours de vraies collisions, ça
revenait à dire : corrigez votre tableur à l'aveugle, vous verrez la grille après.
L'utilisateur l'a dit sans détour — « l'app est inutilisable, je ne peux rien faire ».

`estChargeable` (`src/validation/index.ts`) trace la ligne au bon endroit :

- **la forme bloque.** Un fichier qui viole le JSON Schema n'a pas les champs sur lesquels
  le reste de l'application compte (`meta.version`, un `jour` qui est bien un jour). Le
  charger ne donnerait pas un planning à corriger, mais un écran blanc et une exception.
- **la cohérence ne bloque pas.** Chevauchements, références croisées, capacités : ce sont
  exactement les problèmes qu'on veut voir *dans* la grille pour les corriger. Ils restent
  affichés, comptés, et le message de chargement les annonce.

Le moteur, lui, n'avait pas besoin d'être changé : l'interface construit déjà
`new Referentiel(structure)` directement, sans passer par `chargeStructure` qui lève. Un
chevauchement n'est pas une corruption — c'est un conflit, et un conflit s'affiche.

## 15. Un éditeur, parce qu'un planning réel ne se corrige pas dans le tableur

Les §13 et §14 ont rendu le fichier lisible et chargeable. Restaient les vrais conflits —
ceux que le tableur contient réellement — et aucun moyen de les corriger : l'écran
Structure était en lecture seule, la modale d'un créneau aussi. L'utilisateur voyait le
problème sans pouvoir y toucher.

**Les gestes d'édition sont dans `src/edition.ts`, pas dans l'interface.** C'est la règle
d'architecture du dépôt, et elle se justifie ici mieux qu'ailleurs : modifier un créneau
n'est pas un `setState`, c'est une opération qui doit maintenir des invariants que la
validation vérifiera juste après.

- Retirer un jeune ou un éducateur d'un créneau retire ses `affectations` : un binôme
  nommant quelqu'un d'absent du créneau est refusé par le schéma.
- Supprimer une salle l'efface des créneaux qui s'y tenaient **et** des
  `activites[].sallesPossibles`. Ce second point a été trouvé par un test, pas à la
  relecture — la première version laissait une référence pendante et rendait la structure
  invalide après un geste sans ambiguïté.
- `termineCreneauA` s'exprime en heure, pas en pas : c'est ainsi qu'on lit la grille
  (« ça doit s'arrêter à 13h30 »), et c'est la correction la plus fréquente d'un
  chevauchement venu d'un import.

Comme `repare`, rien n'est modifié sur place : chaque fonction rend une nouvelle
structure. L'appelant garde la précédente, ce qui rend l'annulation possible et évite
qu'un rendu React parte d'un objet muté sous lui.

**Ce qui reste hors de l'éditeur.** Une journée analysée est un résultat du moteur, pas
une source : elle ne se modifie pas. Seul le planning type s'édite, et l'écran le dit
quand on ouvre un créneau depuis une journée réparée.

**Les salles se saisissent dans l'application.** Un planning manuscrit ne les nomme
jamais ; elles n'ont donc aucun autre endroit où exister, et sans elles l'axe « par
salle » de la grille n'a rien à montrer. C'est la seule partie de l'écran Structure qui
ne soit pas en lecture seule, et c'est délibéré : le reste vient d'un fichier, pas elles.

**D'une erreur au créneau fautif.** Une liste d'erreurs ne dit pas où aller. Chaque
problème dont le pointeur vise un créneau (`/planningType/14`) est désormais cliquable :
l'écran se recale sur le bon jour, bascule sur le planning type, et ouvre le créneau.
C'est ce qui transforme une liste en file de travail.

## 16. Le planning doit ressembler au planning

Les trois vues de la grille — par salle, par éducateur, par jeune — plaçaient une colonne
par *ressource*. L'utilisateur a tranché en une phrase : « la vue découpée par jeunes ne
me convient pas », et « ça doit ressembler au planning que j'ai fourni ».

Il avait raison, et le défaut était structurel. Une colonne par jeune découpe une activité
collective en autant de blocs qu'elle a d'enfants : l'accueil du matin, une seule chose
dans la tête de l'équipe, apparaissait cinq fois. Personne ne lit un planning comme ça.

Son document, lui, met le temps à gauche et les activités côte à côte, chacune listant ses
paires « Jeune / Éducateur ». Les colonnes n'y sont pas des ressources : ce sont des
**couloirs** d'activités simultanées, sans identité fixe. `couloirsDuJour`
(`src/vues.ts`) les reconstitue par rangement d'intervalles — trois ou quatre colonnes au
lieu de quinze, et l'accueil redevient un bloc unique.

Le sort d'une personne en particulier n'est pas perdu pour autant, il change de forme :
`journeeDe` rend sa journée en liste chronologique, avec qui elle se passe et les trous
marqués. Une seule fonction pour les deux sens — le sujet et le vis-à-vis s'échangent —
et le vis-à-vis vient de `educateursAupresDe` / `jeunesSelonPorte`, repli documenté
compris. C'est le « juste le planning d'un jeune, et inversement pour les éducateurs »
demandé.

**Deux défauts de forme corrigés au passage, de la même famille.**

L'axe des temps se graduait sur les **pas** : 78 lignes de 34 px pour une journée au pas
de 5 minutes, là où le document en porte treize. `bornesDuJour` ne rend que les moments où
quelque chose change. Et la hauteur d'une bande ne peut pas suivre la seule durée : une
heure d'accueil à cinq paires demande plus de place qu'une heure de repas, et la rogner
tronque des noms. Elle suit donc la durée **et** ce que le contenu réclame — un tableur
fait pareil.

Enfin, « Jeunes sans affectation » listait `11:15 · 11:20 · 11:25 · …` et « Salles
libres » répétait 78 fois la même ligne. `plagesDePas` replie des pas contigus. C'est la
troisième fois dans ce projet que le pas-à-pas du moteur remonte tel quel à l'écran (voir
§14 pour les chevauchements) : **le moteur a raison de raisonner pas par pas, l'écran a
tort de le recopier.**

## 17. Éditer sans tableur

L'éditeur de créneaux (§15) n'existait qu'après un import. Sans fichier, l'application
était un mur : pas de structure, donc pas de grille, donc rien à éditer. C'est une
demande directe de l'utilisateur — « on améliore l'éditeur en le rendant disponible même
sans CSV » — et elle touchait un manque réel, pas un confort.

**Trois entrées au lieu d'une** : déposer un `structure.json`, coller un planning de
tableur, ou partir d'une grille vide. La troisième ne demande que ce dont la grille a
besoin pour exister — jours d'accueil, horaires, pas — et le reste se saisit ensuite.

`structureVierge` (`src/edition.ts`) porte cette construction. Le `structureVide` de
`src/import/assemblage.ts` s'y ramène désormais : même forme, bornes en paramètre. Les
siennes restent volontairement extrêmes (23:59–00:00), pour que le premier élargissement
les ramène aux bornes exactes du fichier (§11). Un seul constructeur, deux usages — une
structure vide n'a pas à exister en deux versions qui divergeront.

**Les listes deviennent éditables.** Jeunes, éducateurs, activités et salles se saisissent
dans l'écran Structure, par une seule carte générique : les quatre se ressemblent au point
que les écrire séparément ferait quatre fois le même bug à corriger. Chacune n'a que deux
champs qui comptent — un nom, une valeur propre au type — et les mêmes gestes.

Les invariants restent dans `src/edition.ts`, jamais dans l'écran :

- supprimer un jeune ou un éducateur le retire des créneaux, de leurs `affectations`, des
  `refEducateurs` d'un groupe **et** des `cibles` des règles. Quatre endroits ; en oublier
  un rend la structure invalide juste après un geste sans ambiguïté ;
- supprimer une activité encore utilisée est **refusé**, avec le nombre de créneaux
  concernés. Une activité n'est pas une personne : la retirer d'un créneau ne veut rien
  dire, un créneau sans activité n'existe pas. Les seules issues seraient de supprimer les
  créneaux dans la foulée — détruire du travail sans le dire — ou de refuser.

**Ajouter un créneau** se fait depuis la grille : il se pose à la suite du dernier de la
journée, avec la durée déclarée de son activité, et l'éditeur s'ouvre dessus. Pas de
formulaire de création à part : ce serait deux endroits où régler les mêmes champs.

## 18. Un octet de contrôle passe tous les contrôles

Trouvé en travaillant sur ce lot : un octet NUL s'était glissé dans `interface/App.jsx`,
au milieu d'un séparateur de chaîne. Le typecheck, les 255 tests et le build restaient
verts — c'est un caractère de chaîne parfaitement valide. Mais `file` répondait
« data », `grep` refusait de chercher dedans, et git le traitait comme un binaire : tout
l'outillage cessait de voir le code, sans rien dire.

D'où un sixième contrôle dans `verifier.sh`, vérifié en le mettant volontairement en
échec avant de le garder. Un séparateur NUL délibéré s'écrit en échappement — c'est ce
que fait `src/affectations.ts` — jamais en octet brut.

## 19. Semaine A, semaine B : des alternatives, pas un chevauchement

Deux des trois conflits qui restaient sur le fichier réel venaient du mercredi, où
« Semaine A » et « Semaine B » sont écrites dans les mêmes cellules, avec les mêmes
jeunes. Le modèle n'avait pas la notion de semaine paire/impaire : il y voyait deux
activités simultanées. Ce sont des **alternatives**, qui ne coexistent jamais.

**Le champ.** `CreneauType.quinzaine?: 'A' | 'B'`, absent = toutes les semaines. Pas
`semaine` : `Semaine<T>` est déjà pris par l'emploi du temps hebdomadaire
(`Jeune.presence`). « Quinzaine » nomme le cycle de deux semaines ; l'écran, lui, dit
« semaine A / semaine B », comme le document.

**Le filtre.** `Referentiel.creneauxTypeDuJour(jour, quinzaine?)` est le pivot : un
créneau sans quinzaine ressort des deux côtés, puisqu'il a lieu chaque semaine. Le
paramètre remonte à `planningTypeDuJour` et redescend dans `planningInitial`, qui possède
déjà la date.

**La détection.** `verifieChevauchements` fait deux passes — A, puis B — avec deux tables
d'occupation mais **une seule** table de collisions, dont les pas sont un `Set` : deux
créneaux hebdomadaires sont examinés dans les deux passes et ne doivent être comptés
qu'une fois. Un conflit *à l'intérieur* d'une semaine reste détecté ; c'est seulement
entre A et B que la rencontre n'a plus lieu.

**L'ancre.** `Grille.semaineAOrigine` : « la semaine contenant cette date est une semaine
A ». `quinzaineDeLaDate` (`src/dates.ts`) compare les **lundis** des deux semaines et
prend la parité de l'écart en jours. Surtout pas le numéro de semaine ISO : une année en
compte parfois 53, et l'alternance se retournerait toute seule au 1ᵉʳ janvier. Sans ancre,
une analyse datée mélangerait les deux : c'est signalé (`grille.alternance`), non bloquant
— le planning type, lui, se lit très bien semaine par semaine.

**La lecture du tableur, sans quoi le champ ne servirait à rien.** Le fichier réel écrit
`"Protocole Semaine A:\nAdiyan / Sabrina\n\nProtocole Semaine B:\nAdiyan / Agathe"` dans
**une seule cellule**. `analyseCellule` rendait une seule lecture : les deux semaines
fondues, Sabrina et Agathe posées ensemble, et un conflit fabriqué de toutes pièces. Elle
rend désormais une **liste de blocs**, un nouveau bloc s'ouvrant à chaque ligne qui porte
un `:` sans `/`.

Le marqueur `semaine A|B` est ensuite retiré du nom. Quand il ne restait que lui, deux
replis, dans cet ordre :

1. le vrai nom est sur la ligne suivante (« Semaine A : / Motricité fine + Tartinage / …
   ») — on le prend, **mais seulement si le bloc porte des binômes**, sinon on baptiserait
   l'activité du nom d'une personne ;
2. sinon, le bloc hérite du dernier nom rencontré au-dessus de lui dans la même cellule
   (« Détache: / Angie / Semaine A : / Camille » → « Détache », semaine A). Sans ce second
   repli ces blocs ressortaient « (sans nom) » : exact, et inexploitable.

**Résultat sur le fichier réel** (jamais commité) : les deux conflits du mercredi
disparaissent. Il reste **une** erreur — une éducatrice sur deux activités le jeudi à
14h30, une vraie double affectation à arbitrer. Le trajet complet depuis le premier
import : 570 → 154 → 66 → 6 → **1**.

## 20. Proposer des issues, ne pas corriger tout seul

« L'app peut-elle proposer des correctifs ? » — oui, et c'est une question de forme autant
que de fond. Un chevauchement se résout de plusieurs façons qui ne se valent pas :
raccourcir le créneau qui déborde, retirer la personne de l'un ou de l'autre, supprimer
l'un des deux. Aucune n'est « la » bonne dans l'absolu.

`correctifsPour` (`src/correctifs.ts`) les **énumère**, du moins destructeur au plus, en
disant ce que chacune emporte — « 1 jeune(s) et 1 educateur(s) y sont nommes » avant une
suppression. Il ne tranche pas : le moteur ne sait pas laquelle des deux activités compte
pour l'établissement. D'où « proposer », jamais « corriger automatiquement » — un bouton
qui promet de réparer seul finirait par détruire du travail en silence.

**Rien n'y manipule une structure en propre** : tout passe par `src/edition.ts`, qui
maintient déjà les invariants. Un correctif n'est qu'un libellé, une explication, et un
appel.

**Retrouver le constat depuis le problème.** Un `Probleme` porte un message fait pour être
lu ; y chercher de quels créneaux vient une collision serait fragile. `Probleme.cle`
(`table|personne|creneau|autre`, posée par `verifieChevauchements`) identifie le constat
sous-jacent et tient d'un rendu à l'autre. Les identifiants ne peuvent pas contenir de
`|` — le schéma les restreint à `[A-Za-z0-9_-]` — donc le découpage est sûr.

**Ce que le test vérifie.** Pas les libellés : qu'après application, la collision visée a
**disparu** de `valideStructure`, et qu'aucune autre erreur n'est apparue. Un correctif
peut être bien formulé et ne rien régler.

Un correctif dont l'un des deux créneaux a déjà disparu — parce qu'on vient d'en appliquer
un autre — rend une liste vide plutôt que de lever : c'est un état normal, pas une erreur.

## 21. Fusionner deux classes : un mode d'import, pas un module

Deux classes partagent le bâtiment, les journées et les salles, mais chacune a son propre
export de tableur. Le planning complet est leur somme — et c'est seulement une fois
réunies qu'on voit ce qui compte vraiment : qui se dispute quelle salle, à quelle heure.

Le seul obstacle était que `assemble` remplaçait systématiquement les créneaux des jours
importés. Ce comportement est le bon par défaut : on réimporte le plus souvent une version
corrigée du même planning, et cumuler produirait des doublons. Mais il rendait la fusion
impossible — la seconde classe effaçait la première.

D'où `OptionsAssemblage.surJoursImportes` : `'remplace'` (défaut, inchangé) ou `'ajoute'`.
Trois lignes dans le moteur, un troisième choix dans l'écran d'import, et le texte d'aide
qui dit lequel écrase quoi. Les identifiants passaient déjà par `idUnique` : rien à faire
de ce côté.

**Rien d'autre n'était nécessaire.** Les conflits de salle entre les deux classes sont des
chevauchements ordinaires — `verifieChevauchements` traite déjà `salleId` comme une
ressource — et la vue « par salle » les montre, colonne « sans salle » comprise. C'était
la décision prise avec l'utilisateur : les salles se saisissent à la main, l'application
signale les conflits, elle ne place rien toute seule.

## 22. Garder les fichiers importés, sur ce poste seulement

Un planning se reprend en plusieurs fois : on importe, on corrige, on s'interrompt, et le
lendemain le fichier n'est plus sous la main. Les dix derniers fichiers déposés sont donc
gardés, avec leur nom et leur date, et se rechargent d'un clic.

**Seul un fichier DÉPOSÉ est mémorisé.** `analyseTexte` est aussi appelée à chaque frappe
dans la zone de collage : enregistrer là produirait une entrée par caractère. Le nom du
fichier, lui, arrivait déjà — `ZoneDepot` transmet `(contenu, nom)` depuis le début.

**Un fichier trop gros n'est pas gardé** (200 ko ; l'export réel en fait 8). Le quota du
navigateur se remplit en silence, et perdre la structure chargée pour avoir voulu garder
une copie du tableur serait un mauvais échange. `ecrireStockage` relit derrière lui, donc
un dépassement se voit quand même — autant ne pas le provoquer.

**Ils portent de vrais prénoms.** Ils restent dans le stockage local de ce poste, n'entrent
dans aucun export, et « Vider ce poste » les efface avec le reste. Cette dernière ligne
n'est pas décorative : le bouton porte **la seule énumération des clés** de l'application,
et une clé qu'on oublierait d'y inscrire survivrait à un vidage sans que personne ne s'en
aperçoive. C'est le corollaire du piège de collision de `localStorage` — trois applications
partagent la même adresse `github.io`, donc jamais de `clear()` global, donc une liste
explicite qu'il faut tenir à jour.

## 23. Les pauses sont des temps communs : rien à y affecter, rien à y exiger

`docs/schema.md` annonçait que le moteur n'affecte rien pendant les pauses. Il ne le
faisait pas : `estPause` n'était lu que par deux règles et une vue — jamais par le
solveur, jamais par l'encadrement. Le moteur pouvait donc placer un éducateur en plein
repas. L'utilisateur a tranché le sens : *« pas d'affectation, ce sont des temps communs
qui font l'objet d'un planning spécifique »*.

**Le correctif a deux moitiés, et elles sont indissociables.**

1. `mobilisable` (`src/moteur/disponibilite.ts`) rend `false` sur un pas de pause. C'est la
   porte unique par laquelle le solveur recrute : la fermer suffit à garantir « pas
   d'affectation », il n'y a pas de second chemin à surveiller.
2. `educateursRequis` (`src/encadrement.ts`) rend **0** pour un créneau dont *tous* les pas
   sont des pauses.

Sans la seconde, la première serait un recul : un créneau « Repas » réclamerait des
éducateurs que plus personne ne peut fournir, et chaque repas deviendrait un conflit
insoluble — l'écran passerait du silence à une ligne rouge par jour, sans qu'aucun geste
ne puisse la faire disparaître. Strictement pire que de n'avoir rien fait.

**Un créneau à cheval garde son besoin entier.** L'encadrement se calcule par créneau, pas
par pas ; un besoin proratisé serait une règle que personne n'a demandée et que personne ne
saurait relire. La bonne réponse à un créneau à moitié en pause est de le couper en deux —
l'éditeur le permet.

**Les éducateurs déjà inscrits sur un créneau de pause y restent.** C'est la donnée de
l'utilisateur. Le moteur cesse d'en ajouter, il n'en retire pas — retirer serait défaire un
choix explicite au nom d'une règle qui n'a jamais parlé de ça.

Effet de bord assumé : `educateursLibres` rend une liste vide pendant les pauses. C'est
exact — personne n'est mobilisable pendant le repas.

## 24. Une personne créée à la main est présente par défaut

`jeunePresent` rend `false` quand `presence[jour]` est absent, et `ajouteJeune` posait
`presence: {}`. Un jeune créé dans l'application était donc **invisible pour le moteur** :
aucun encadrement demandé pour lui, aucun éducateur mobilisable à ses côtés. Et rien ne le
signalait — la grille l'affichait normalement, puisqu'elle lit `planningType` en direct.
Trou ouvert avec « commencer sans tableur » : tant que tout le monde venait d'un import,
la présence arrivait avec les créneaux.

`ajouteJeune` et `ajouteEducateur` prennent maintenant leur défaut **dans la grille** :
présent tous les jours d'accueil, de `grille.debut` à `grille.fin`. Un jeune qu'on inscrit
dans son IME est là ; c'est l'absence qui se déclare, pas la présence.

Le champ reste passable explicitement — `presence: {}` est respecté si on l'écrit. C'est
l'omission qui déclenche le défaut, pas la valeur vide : les deux ne veulent pas dire la
même chose. L'import, lui, continue de poser la présence jour par jour, d'après les
créneaux où la personne apparaît réellement (`src/import/assemblage.ts`).

Le test qui verrouille ça ne se contente pas de `valideStructure` : une structure peut être
parfaitement valide et invisible au moteur, c'était précisément le cas. Il vérifie le bout
de la chaîne — `educateursRequis > 0` et l'éducateur `mobilisable`.

## 25. Les règles éditables, sans que l'interface sache ce qu'est une règle

L'écran Règles n'éditait que `actif`, `dure` et `poids`. Les cibles étaient des badges, les
`params` un `<pre>` JSON, et on ne pouvait ni créer ni supprimer une règle. Le README
annonçait pourtant qu'on y réglait la portée : c'était faux, `porte` n'était modifiable
nulle part.

**Le problème n'est pas de dessiner un formulaire, c'est de savoir quoi y mettre.** Ce
qu'un type de règle attend n'existait qu'à l'état impératif, dans le corps de `valide()`.
L'interface ne peut pas le déduire d'une fonction, et le lui réécrire en dur aurait créé
la seconde source de vérité que l'architecture de ce dépôt refuse : douze formulaires dans
le JSX, douze `valide()` dans le moteur, et la certitude qu'ils divergeraient.

`EvaluateurRegle` porte donc deux descripteurs déclaratifs, **dans le même fichier que
l'évaluateur** :

- `cibles: { cles, minimum }` — plusieurs clés veulent dire « l'une **ou** l'autre » :
  `taux_encadrement` accepte des groupes ou des activités ;
- `champs: ChampRegle[]` — cinq formes suffisent aux douze types (`nombre`, `ids`,
  `choix`, `heure`, `texte`), chacune avec son libellé, son aide, son défaut et son
  caractère obligatoire.

Un seul endroit par type, qui ne peut pas dériver de son voisin. Le JSX ne connaît plus
aucune règle : il connaît cinq formes. Ajouter un type de règle ne le touche pas ; ajouter
une *forme* le toucherait, et c'est le seul cas.

### Le test fait le travail que la relecture ne fait pas

Un descripteur peut mentir sur son évaluateur. `test/descripteurs.test.ts` les tient
synchronisés en parcourant le catalogue, **dans les deux sens** :

- une règle bâtie depuis le descripteur passe `valide()` sans erreur ;
- retirer un champ déclaré **obligatoire** la fait échouer — sinon le descripteur
  sur-déclare, et le formulaire réclame l'inutile ;
- retirer un champ déclaré **facultatif** ne la fait *pas* échouer — sinon il sous-déclare,
  et le formulaire laisse produire une règle que la validation refusera. C'est le pire des
  deux sens, et c'est celui qu'on oublie de tester.

J'ai vérifié que ce test mord en corrompant un descripteur dans chaque sens.

### Le trou que ce test ne voyait pas

Un paramètre **facultatif** que `evalue()` lit mais que le descripteur ne déclare pas passe
tout : `valide()` ne l'exige pas, donc « accepte une règle sans lui » reste vert — et
l'interface ne l'expose jamais. Le paramètre existe, fonctionne, et reste inatteignable.

C'est arrivé à `fenetre` (`rotation_educateur`), trouvé à la main en comparant les clés
lues par le code aux clés déclarées. Un dernier contrôle lit maintenant les sources du
catalogue et refait cette comparaison. **C'est un grep**, avec ce que ça vaut : il ne
verrait pas une clé construite dynamiquement. Aucune ne l'est, et c'est le seul filet
contre cette dérive.

### `undefined` retire une clé, il ne la pose pas

`modifieRegle` et `modifieParamRegle` traitent une valeur `undefined` comme un retrait.
Ce n'est pas ce que fait un spread : `{ ...regle, poids: undefined }` **garde** la clé.
`JSON.stringify` la laisserait tomber à l'export, mais la validation en mémoire verrait un
`poids` présent et non numérique — un fichier refusé juste après un geste anodin. Passer
une règle de souple à dure passe exactement par là.

### Ce qui reste hors d'atteinte

Une règle d'un type **inconnu** de ce moteur n'a pas de descripteur, donc pas de formulaire
possible. Sa carte affiche le JSON brut, en lecture seule. Éditer à l'aveugle quelque chose
que rien n'évaluera serait pire que de ne pas l'éditer.
