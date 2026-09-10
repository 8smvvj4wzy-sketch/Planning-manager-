# Planning IME

Planning d'un IME : moteur d'affectation et de réparation, plus l'interface qui le
pilote. `docs/schema.md` est la spécification d'origine, `docs/decisions.md` les
arbitrages et les écarts assumés — les deux font foi.

## Réponses

En français. Direct et techniquement précis. Les limites et les compromis se disent,
ils ne se lissent pas.

## Architecture

Deux couches, et la séparation est le principe :

- **`src/` — le moteur**, en TypeScript, modulaire, testé pour lui-même
  (`npm test`, suite `node:test`). Il ne connaît ni React ni le DOM.
- **`interface/` — l'application**, en JSX, dans le style de DatABA Manager
  (`App.jsx` d'un seul tenant). Elle ne recalcule rien : elle appelle `repare`,
  `evalue`, `valideStructure` et affiche ce qu'ils rendent.

Toute règle métier qui apparaîtrait dans `interface/` est une seconde source de
vérité — c'est exactement ce que la séparation évite. Si l'interface a besoin d'un
calcul, il se pose dans `src/` et se teste là-bas.

`src/` n'est pas `src/App.jsx` comme dans DatABA Manager : ici le moteur mérite ses
modules, il a sa propre suite de tests et il est réutilisable sans l'interface.

## Le dépôt est PUBLIC

`8smvvj4wzy-sketch/Planning-manager-` est public. **Aucun prénom réel de jeune ou
d'éducateur ne doit y être commité** — ni en exemple, ni en fixture de test, ni dans
une capture d'écran jointe à une PR. Les fichiers de `examples/` portent des noms
inventés, et c'est délibéré.

Corollaire : **l'application est livrée vierge.** Aucune donnée nominative n'entre
dans le bundle, pas même un exemple de démonstration. `examples/` sert à la suite de
tests et n'est jamais importé depuis `interface/`.

## Pièges connus

- **Collision de stockage.** DatABA, DatABA Manager et cette application partagent la
  même adresse `github.io`, donc le même `localStorage`. Un `localStorage.clear()`
  global ici effacerait les données de production des tablettes. **Toute suppression
  est bornée au préfixe `planning-ime:`.** Jamais de clear global, y compris pour
  toute nouvelle clé.
- **Une écriture qui ne lève pas n'est pas une écriture réussie.** `setItem` accepte
  puis ne rend rien dans une session éphémère. Tout passe par `ecrireStockage`, qui
  relit avant d'annoncer le succès, et un échec remonte à l'écran (`erreurStockage`) —
  sinon le poste rouvre vide sans que personne n'ait rien vu passer. Leçon reprise de
  DatABA Manager, où elle a coûté des données.
- **`ref` est un prop réservé en React.** Un composant qui reçoit `ref={referentiel}`
  ne le voit jamais arriver. Le référentiel se passe sous le nom `referentiel`. Déjà
  attrapé une fois.
- **L'admissibilité se juge en écart, jamais dans l'absolu.** Un planning en cours de
  réparation viole déjà des règles dures — c'est ce qu'on répare. Le solveur accepte
  un candidat qui *n'ajoute pas* de violation (`introduitViolationDure`). Exiger un
  essai irréprochable bloquait toute réparation dès qu'un créneau était cassé
  ailleurs : le moteur ne trouvait aucun candidat et rendait six conflits sur une
  journée parfaitement réparable.
- **`0.33 × 3 = 0.99` en virgule flottante.** Un `Math.ceil` naïf sur la somme des
  encadrements donnait 1 ici et 2 ailleurs selon l'ordre des additions. La somme passe
  par `arrondiStable` (`src/encadrement.ts`), et un test le verrouille.
- **Le pas de 30 minutes de la spécification est faux.** Le planning réel a des bornes
  à 11h15, 12h10 et 13h30 : le plus grand pas commun est 5 minutes. `pasMinutes` est
  un paramètre, il n'y a rien à recoder — mais toute règle exprimée en pas change
  d'échelle avec lui. `tousLesPas: 2` vaut dix minutes avec un pas de 5, pas une heure.
- **Un créneau ne dit pas seulement qui est présent, mais qui est avec qui.** Les
  `affectations` (paires jeune/éducateur) portent cette information. Quand elles
  manquent pour un jeune, le repli est que *tous* les éducateurs du créneau comptent
  comme étant auprès de lui — c'est ce qui laisse fonctionner les plannings qui ne
  nomment pas leurs paires. Voir `src/affectations.ts`.
- **Une interdiction ne se relâche pas quand la donnée s'affine.** Les règles portent
  un paramètre `porte` : `binome` pour les autorisations et la continuité,
  `presence` pour les interdictions et les règles de sécurité. Les défauts sont dans
  `docs/decisions.md` ; changer un défaut change ce que le moteur autorise.
- **Une modale ne retient que l'identité de ce qu'elle affiche**, jamais l'objet : le
  détail d'un créneau garde son `creneauId` et relit le planning à chaque rendu, sinon
  il fige l'état du moment du clic pendant que le planning change derrière.
- **Les types WebCrypto ne sont pas globaux sans la lib DOM.** `src/transport/chiffrement.ts`
  les importe en type seul depuis `node:crypto` (`import type { webcrypto } from
  'node:crypto'`) plutôt que d'ajouter `"DOM"` à `tsconfig.json`, ce qui ouvrirait tout
  le moteur aux globals du navigateur. Effacé à la compilation, comme dans le
  navigateur ; `crypto.subtle` reste le global standard des deux côtés.
- **Le chiffrement n'anonymise pas.** `chiffre`/`dechiffre` (`src/transport/chiffrement.ts`)
  protègent un fichier en transit, pas son contenu pour qui a la phrase de passe.
  L'export en clair reste toujours disponible à côté : c'est lui le contrat lisible par
  un autre outil.
- **Une cellule fusionnée s'arrête à la prochaine rangée qui porte quelque chose, pas à
  la prochaine cellule de sa colonne.** Un couloir peut rester vide longtemps sans que
  l'activité qui le précédait dure jusque-là : il ne sert simplement plus, pendant que la
  journée continue à côté. Chercher la prochaine cellule non vide du *même* couloir
  étirait « Protocole : Adiyan » de 9h30 à 13h10 sur un fichier réel, là où l'accueil
  d'à côté durait une heure — et le même mécanisme produisait des centaines de
  `creneau.chevauchement` sans rapport apparent avec la cause. Seule une rangée
  **muette** (aucune cellule non vide nulle part, `rangeesMuettes` dans
  `src/import/tableur.ts`) est traversée : c'est un trait de grille à l'intérieur d'une
  cellule fusionnée, pas une borne. Sur le fichier réel : 154 erreurs et 8 conflits →
  66 et 3. Voir `docs/decisions.md` §13.
- **Le repli d'une durée inconnue est minimal, pas maximal.** Quand plus aucune rangée ne
  porte quoi que ce soit après une cellule (`CreneauLu.finDeduite`), la fin se replie sur
  la **prochaine borne de la grille**, jamais sur la fermeture de journée. Entre deux
  durées également invérifiables, la plus courte est celle qui invente le moins de
  chevauchements. Signaler l'incertitude (`import.duree-incertaine`) ne suffit pas si la
  valeur choisie est le pire des deux extrêmes.
- **Une modification d'un créneau entraîne ce qui la suit.** `src/edition.ts` maintient
  les invariants que la validation exige, plutôt que de laisser l'interface les
  reconstituer : retirer quelqu'un d'un créneau retire ses `affectations`, supprimer une
  salle l'efface aussi des `activites[].sallesPossibles` et des créneaux qui s'y tenaient
  (cette dernière a été trouvée par un test, pas à la relecture). Sans ça, un geste
  anodin à l'écran produit un fichier invalide juste après — exactement ce que
  l'utilisateur venait corriger. Comme `repare`, ces fonctions ne modifient rien sur
  place : elles rendent une nouvelle structure.
- **Les colonnes du planning ne sont pas des personnes.** Une colonne par jeune découpait
  une même activité en autant de blocs qu'elle avait d'enfants — l'utilisateur l'a rejeté
  d'emblée, et il a raison : ce n'est pas comme ça qu'on lit un planning. Les colonnes
  sont des **couloirs** d'activités simultanées (`couloirsDuJour`, `src/vues.ts`), et le
  sort d'une personne se lit dans sa fiche (`journeeDe`). Le document d'origine fait
  exactement ça, et c'est lui la référence de forme.
- **L'axe des temps se gradue sur les bornes réelles, pas sur les pas.** Une ligne par pas
  donnait 78 lignes de 34 px pour une journée au pas de 5 minutes, là où le document
  d'origine en porte treize. `bornesDuJour` (`src/vues.ts`) ne rend que les moments où
  quelque chose change ; la hauteur d'une bande suit sa durée **et** ce que son contenu
  réclame — sans le second terme, un accueil à cinq paires se fait tronquer par une heure
  de repas de même durée.
- **Rien ne s'affiche pas par pas.** Même famille que les deux points précédents :
  « Jeunes sans affectation » listait 78 horaires, « Salles libres » 78 lignes identiques.
  `plagesDePas` (`src/vues.ts`) replie des pas contigus en plages. Dès qu'une liste
  d'écran vient d'une boucle sur `tousLesPas()`, elle doit être repliée avant d'être
  rendue.
- **Un chevauchement se signale une fois, pas à chaque pas.** La détection travaille pas
  par pas — seul moyen de comparer des créneaux qui ne s'alignent pas — mais
  `verifieChevauchements` regroupe avant de rendre. Au pas de 5 minutes, trois collisions
  réelles donnaient 66 lignes, dont seules les 50 premières s'affichaient : le lecteur ne
  voyait même pas qu'il n'y en avait que trois.
- **Les erreurs de cohérence ne bloquent pas le chargement ; la forme, si.** Un planning
  réel comporte presque toujours de vraies collisions — deux activités au même moment, un
  éducateur nommé à deux endroits. Refuser de charger tant qu'elles restent condamnait
  l'utilisateur à corriger son tableur à l'aveugle, sans jamais voir la grille : l'app
  était littéralement inutilisable sur le premier fichier réel. `estChargeable`
  (`src/validation/index.ts`) trace la ligne — un fichier qui viole le JSON Schema n'a pas
  les champs dont le reste de l'application dépend et reste refusé, le reste se charge et
  se corrige à l'écran.
- **Un fichier déposé n'est pas forcément en UTF-8.** `decodeOctets`
  (`src/import/tableur.ts`) essaie l'UTF-8 strict, bascule sur windows-1252 sinon — un
  export Numbers/Excel réel a été trouvé encodé ainsi (confirmé par l'octet `0xE9` pour
  « é »). Le collage n'est pas concerné : le presse-papiers livre toujours du texte déjà
  décodé.
- **Un placeholder de grille doit être un extrême, pas une valeur "raisonnable".**
  `structureVide()` (`src/import/assemblage.ts`) posait `09:00`–`17:00` : ça semblait
  fonctionner tant que le fichier importé commençait après 9h et un pas qui divisait
  l'écart — un pas de 5 minutes avec un fichier commençant à 9h30 a suffi à faire
  échouer l'alignement de grille pour toute heure non ronde. Les bornes de départ sont
  maintenant `23:59`/`00:00` : le premier élargissement réel les remplace forcément par
  les bornes exactes du fichier, sans compter sur la chance.

## Avant toute livraison

```bash
./verifier.sh
```

Cinq contrôles, dans l'ordre où ils attrapent le plus de choses. Ne rien livrer
sur un contrôle rouge — la CI (`.github/workflows/deploy.yml`) fait passer le
vérificateur avant le build, et la publication en dépend.

**`vite build` ne suffit pas.** Il résout les imports mais ne dit rien d'un
identifiant devenu libre après un renommage : il le laisse passer, et l'erreur
n'explose qu'au clic de l'utilisateur sur l'écran concerné. C'est le contrôle 2
(`tsc` en mode JS permissif, filtré sur « Cannot find name ») qui attrape ça —
il a déjà rattrapé un `CLE_JOUR` survivant à la refonte de l'écran Journée,
alors que le build était vert.

## Avis npm audit

Vite 5 traîne quatre avis, tous limités au serveur de développement (`npm run dev`) :
aucun n'atteint le build statique publié. C'est la même exposition que DatABA Manager.
Monter à Vite 8 divergerait de cet autre dépôt — décision de l'auteur, pas un correctif
à appliquer d'office.
