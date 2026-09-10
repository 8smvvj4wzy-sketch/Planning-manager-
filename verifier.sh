#!/bin/bash
# Vérification avant livraison — à lancer depuis la racine du dépôt.
#   usage : ./verifier.sh
#
# Même rôle que le verifier.sh de DatABA Manager, adapté à un dépôt qui a deux
# couches : un moteur TypeScript testé pour lui-même, et une interface JSX.
#
#   1. typecheck strict du moteur (tsc, y compris noUnused*)
#   2. noms introuvables dans l'interface — `vite build` ne les voit PAS, et un
#      identifiant devenu libre après un renommage passe alors en production
#      pour n'exploser qu'au clic de l'utilisateur. Déjà arrivé : CLE_JOUR
#      survivait à la refonte de l'écran Journée.
#   3. la suite de tests du moteur
#   4. le build de l'interface
#   5. aucun prénom réel dans le dépôt (il est PUBLIC — voir CLAUDE.md)
#   6. aucun octet de contrôle dans un fichier source

set -u
cd "$(dirname "$0")" || exit 1
ECHECS=0

echo "════════ Vérification : Planning IME ════════"

# --- 1 -----------------------------------------------------------------------
echo "▸ 1. Typecheck du moteur"
if npx tsc -p tsconfig.check.json; then
  echo "  ✓ typecheck"
else
  echo "  ✗ typecheck"
  ECHECS=$((ECHECS + 1))
fi

# --- 2 -----------------------------------------------------------------------
# `vite build` résout les imports mais ne dit rien d'un identifiant libre : il
# le laisse passer et l'erreur ne survient qu'à l'exécution, sur l'écran
# concerné. tsc en mode JS permissif attrape exactement ça. On ne retient que
# les diagnostics de nom : le reste serait du bruit sur du JSX non typé.
echo "▸ 2. Noms introuvables dans l'interface"
SORTIE=$(npx tsc --noEmit --allowJs --checkJs --jsx react --target ES2022 \
  --moduleResolution bundler --module esnext --skipLibCheck \
  interface/App.jsx 2>&1 | grep -E "Cannot find name|has no exported member" || true)
if [ -z "$SORTIE" ]; then
  echo "  ✓ aucun nom introuvable"
else
  echo "$SORTIE" | sed 's/^/  ✗ /'
  ECHECS=$((ECHECS + 1))
fi

# --- 3 -----------------------------------------------------------------------
echo "▸ 3. Tests du moteur"
if npm test --silent > /tmp/planning-tests.log 2>&1; then
  grep -E "^# (tests|pass|fail)" /tmp/planning-tests.log | sed 's/^/  /'
  echo "  ✓ tests"
else
  tail -30 /tmp/planning-tests.log | sed 's/^/  /'
  echo "  ✗ tests"
  ECHECS=$((ECHECS + 1))
fi

# --- 4 -----------------------------------------------------------------------
echo "▸ 4. Build de l'interface"
if npx vite build > /tmp/planning-build.log 2>&1; then
  echo "  ✓ build"
else
  tail -20 /tmp/planning-build.log | sed 's/^/  /'
  echo "  ✗ build"
  ECHECS=$((ECHECS + 1))
fi

# --- 5 -----------------------------------------------------------------------
# Le dépôt est public. Les exemples et les fixtures portent des noms inventés,
# et l'application est livrée vierge : rien de nominatif ne doit entrer ici.
# Ce contrôle est grossier — il ne remplace pas la relecture — mais il attrape
# le collage accidentel d'un vrai planning dans un fichier de test.
echo "▸ 5. Aucune donnée nominative embarquée"
FUITE=$(grep -rn "exempleStructure\|exempleJour" interface/ 2>/dev/null || true)
if [ -z "$FUITE" ]; then
  echo "  ✓ l'interface n'importe aucun jeu de données"
else
  echo "$FUITE" | sed 's/^/  ✗ /'
  ECHECS=$((ECHECS + 1))
fi

# --- 6 -----------------------------------------------------------------------
# Un octet NUL dans un source passe le typecheck, les tests ET le build : c'est
# un caractère de chaîne valide. Mais il rend le fichier « binaire » pour git,
# grep et les diffs — l'outillage cesse de voir le code sans rien dire. Arrivé
# deux fois, par un collage malheureux dans un séparateur de chaîne.
#
# `-a` n'est PAS décoratif : sans lui, `grep -l` refuse de lister un fichier
# qu'il juge binaire, et c'est précisément un NUL qui déclenche ce jugement. Ce
# contrôle a donc été aveugle au seul cas pour lequel il existait, jusqu'à ce
# qu'un NUL passe sous son nez. Le vérifier avec un `\x01` ne prouve rien : il
# faut un vrai NUL.
echo "▸ 6. Aucun octet de contrôle dans les sources"
BINAIRES=$(git ls-files -- 'src/**' 'interface/**' 'test/**' 'scripts/**' '*.json' '*.md' '*.sh' \
  | grep -v '\.woff2$' \
  | xargs -r grep -alP '[\x00-\x08\x0E-\x1F]' 2>/dev/null || true)
if [ -z "$BINAIRES" ]; then
  echo "  ✓ sources propres"
else
  echo "$BINAIRES" | sed 's/^/  ✗ octet de contrôle dans /'
  ECHECS=$((ECHECS + 1))
fi

echo "════════════════════════════════════════════"
if [ "$ECHECS" -eq 0 ]; then
  echo "Tout est vert."
  exit 0
fi
echo "$ECHECS contrôle(s) en échec — ne rien livrer."
exit 1
