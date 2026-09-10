/* Planning IME — interface.

   Le moteur vit dans src/ (TypeScript, testé à part) : cet écran ne recalcule
   rien, il appelle `repare`, `evalue`, `valideStructure` et affiche ce qu'ils
   rendent. Toute règle métier qui apparaîtrait ici serait une seconde source
   de vérité — c'est exactement ce que la séparation évite.

   Même grammaire visuelle que DatABA Manager : navigation latérale
   persistante, tokens de surface sur [data-theme], couleur sur [data-accent],
   palette catégorielle fixe hors thème. DESIGN.md du dépôt DatABA Manager
   fait foi. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  FileJson,
  GitCompare,
  Grid3x3,
  Info,
  Moon,
  Pin,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Settings,
  Sun,
  Trash2,
  Upload,
  Library,
  Lock,
  Users,
  Wrench,
  X,
} from 'lucide-react';

import {
  JOURS,
  Referentiel,
  ajouteActivite,
  ajouteCreneau,
  ajouteEducateur,
  ajouteJeune,
  ajouteSalle,
  assemble,
  bornesDuJour,
  correctifsPour,
  couloirsDuJour,
  educateursAupresDe,
  auditeJourNominal,
  calculDisponibilite,
  catalogue,
  chiffre,
  comparePeriodes,
  dechiffre,
  decodeOctets,
  decoupeTableau,
  educateursLibres,
  estChargeable,
  estEnveloppeChiffree,
  etatJourNominal,
  jeunesSansAffectation,
  journeeDe,
  litPlanning,
  modifieActivite,
  modifieCreneau,
  modifieEducateur,
  modifieJeune,
  modifieSalle,
  nomsRencontres,
  optionsAvec,
  plagesDePas,
  planningTypeDuJour,
  proposeCorrespondances,
  reparePeriode,
  retireDuCreneau,
  sallesLibres,
  structureVierge,
  supprimeActivite,
  supprimeCreneau,
  supprimeEducateur,
  supprimeJeune,
  supprimeSalle,
  termineCreneauA,
  validePeriode,
  valideStructure,
} from '../src/index.ts';

/* L'application est livrée VIERGE : aucune donnee nominative n'entre dans le
   bundle, pas meme un exemple. `examples/` reste au depot pour la suite de
   tests, et n'est jamais importe ici — le depot est public. */

/* ==================== Constantes ==================== */

const F_DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const F_BODY = "'IBM Plex Sans', system-ui, sans-serif";
const F_MONO = "'IBM Plex Mono', ui-monospace, monospace";

/* Palette catégorielle, reprise de DatABA Manager. Fixe dans tous les thèmes :
   elle porte du sens (quelle activité, quel groupe), pas de la décoration.
   Un thème rose ne repeint pas la piscine. */
const CAT_TEAL = '#00A870';
const CAT_INDIGO = '#3B5BDB';
const CAT_AMBER = '#FF8A3D';
const CAT_CORAL = '#FF4D6D';
const CAT_VIOLET = '#7C5CFF';
const CAT_CYAN = '#00B8D9';
const CAT_LILAS = '#A78BFA';
const CAT_ARDOISE = '#64748B';

const PALETTE = [CAT_INDIGO, CAT_TEAL, CAT_AMBER, CAT_VIOLET, CAT_CYAN, CAT_CORAL, CAT_LILAS, CAT_ARDOISE];

const PREFIXE = 'planning-ime:';
const CLE_STRUCTURE = `${PREFIXE}structure`;
const CLE_PERIODE = `${PREFIXE}periode`;
const CLE_SCENARIOS = `${PREFIXE}scenarios`;
const CLE_OPTIONS = `${PREFIXE}options`;
const CLE_THEME = `${PREFIXE}theme`;
const CLE_ACCENT = `${PREFIXE}accent`;
/* Les fichiers déposés ou collés, pour pouvoir les reprendre sans les
   redemander. Ils portent de VRAIS prénoms : ils restent dans le navigateur de
   ce poste, n'entrent dans aucun export, et « Vider ce poste » les efface avec
   le reste — la liste ci-dessous est la seule énumération des clés. */
const CLE_IMPORTS = `${PREFIXE}imports`;

const ACCENTS = [
  { id: null, nom: 'Neutre', swatch: 'var(--swatch-neutre)' },
  { id: 'rose', nom: 'Rose', swatch: 'var(--swatch-rose)' },
  { id: 'vert', nom: 'Vert', swatch: 'var(--swatch-vert)' },
  { id: 'jaune', nom: 'Jaune', swatch: 'var(--swatch-jaune)' },
  { id: 'rouge', nom: 'Rouge', swatch: 'var(--swatch-rouge)' },
];

/* ==================== Petites fonctions ==================== */

/* Le contraste d'un texte posé sur une couleur de la palette catégorielle
   n'est pas supposé blanc : un badge ambre ou lilas se lit en encre sombre.
   Portée de DatABA Manager. */
function texteLisibleSur(hex) {
  const n = hex.replace('#', '');
  const composante = (i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * composante(0) + 0.7152 * composante(2) + 0.0722 * composante(4);
  return luminance > 0.45 ? '#0E1B33' : '#FFFFFF';
}

/* Couleur stable d'une activité : même activité, même teinte d'une session à
   l'autre. L'index dans le référentiel plutôt qu'un hachage — l'ordre du
   fichier est stable et le résultat reste lisible en cas d'ajout. */
function couleurActivite(ref, activiteId) {
  const index = ref.structure.activites.findIndex((a) => a.id === activiteId);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}

function classeDate(date) {
  try {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return date;
  }
}

function aujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ==================== Stockage ====================
   PRÉFIXE OBLIGATOIRE `planning-ime:`. DatABA, DatABA Manager et cette
   application partagent la même adresse github.io, donc le même
   localStorage : un `localStorage.clear()` global ici effacerait les données
   de production des autres. Aucune suppression ne sort de ce préfixe.

   Pas d'IndexedDB, contrairement à DatABA Manager : ce qu'on stocke est un
   structure.json (quelques dizaines de Ko même pour un gros établissement),
   pas un bloc consolidé de séances. Le repli devrait être revu au-delà de
   ~2 Mo, soit environ 3 000 créneaux — on en est loin.

   La leçon de Manager tient quand même : un `setItem` qui ne lève pas ne
   prouve rien. Toute écriture est relue avant d'être annoncée réussie, et un
   échec remonte à l'écran plutôt que d'être avalé. */

function lireStockage(cle) {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : null;
  } catch {
    return null;
  }
}

function ecrireStockage(cle, valeur) {
  try {
    const texte = JSON.stringify(valeur);
    localStorage.setItem(cle, texte);
    // Relecture : une session éphémère accepte l'écriture puis ne rend rien.
    return localStorage.getItem(cle) === texte;
  } catch {
    return false;
  }
}

function effacerStockage(cle) {
  try {
    localStorage.removeItem(cle);
    return true;
  } catch {
    return false;
  }
}

/* ==================== Primitives ==================== */

function Carte({ titre, sousTitre, actions, children, className = '', ...reste }) {
  return (
    <section
      className={`rounded-2xl border ${className}`}
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      {...reste}
    >
      {(titre || actions) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div>
            {titre && (
              <h2 className="text-base" style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: 'var(--ink)' }}>
                {titre}
              </h2>
            )}
            {sousTitre && (
              <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
                {sousTitre}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

function Bouton({ variante = 'outline', icone: Icone, enfants, children, ...reste }) {
  const styles =
    variante === 'primaire'
      ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
      : variante === 'danger'
        ? { background: 'transparent', color: 'var(--crisis)', borderColor: 'var(--crisis)' }
        : { background: 'transparent', color: 'var(--ink)', borderColor: 'var(--border)' };
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-40"
      style={{ fontFamily: F_BODY, ...styles }}
      {...reste}
    >
      {Icone && <Icone size={16} aria-hidden="true" />}
      {children ?? enfants}
    </button>
  );
}

function Etiquette({ children }) {
  return (
    <span
      className="text-[11px] uppercase tracking-wide"
      style={{ fontFamily: F_MONO, fontWeight: 500, color: 'var(--ink-soft)' }}
    >
      {children}
    </span>
  );
}

function Badge({ couleur, children, titre }) {
  return (
    <span
      className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs"
      style={{ background: couleur, color: texteLisibleSur(couleur), fontFamily: F_MONO, fontWeight: 500 }}
      title={titre}
    >
      {children}
    </span>
  );
}

function Champ({ libelle, aide, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm" style={{ color: 'var(--ink)' }}>
        {libelle}
      </span>
      {children}
      {aide && (
        <span className="mt-1 block text-xs" style={{ color: 'var(--ink-soft)' }}>
          {aide}
        </span>
      )}
    </label>
  );
}

const styleSaisie = {
  background: 'var(--card)',
  color: 'var(--ink)',
  borderColor: 'var(--border)',
  fontFamily: F_BODY,
};

function Selecteur({ valeur, onChange, options, ...reste }) {
  return (
    <select
      className="w-full rounded-xl border px-3 py-2 text-sm"
      style={styleSaisie}
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      {...reste}
    >
      {options.map((o) => (
        <option key={String(o.valeur)} value={o.valeur}>
          {o.libelle}
        </option>
      ))}
    </select>
  );
}

function Vide({ children }) {
  return (
    <p className="py-6 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
      {children}
    </p>
  );
}

/* Bandeau d'alerte. `ton` : 'info' | 'alerte' | 'succes'. */
function Bandeau({ ton = 'info', icone: Icone, titre, children }) {
  const couleur = ton === 'alerte' ? 'var(--crisis)' : ton === 'succes' ? CAT_TEAL : 'var(--ink-soft)';
  return (
    <div
      className="flex gap-3 rounded-xl border p-3 text-sm"
      style={{ borderColor: couleur, color: 'var(--ink)', background: 'var(--card)' }}
    >
      {Icone && <Icone size={18} style={{ color: couleur }} className="mt-0.5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0">
        {titre && <p style={{ fontWeight: 600 }}>{titre}</p>}
        <div style={{ color: 'var(--ink-soft)' }}>{children}</div>
      </div>
    </div>
  );
}

/* Index du créneau visé par un pointeur de validation, ou `null` si le problème
   porte sur autre chose. Le pointeur est produit par `src/validation` sous la
   forme « /planningType/14 » : c'est ce qui permet de passer d'une erreur au
   créneau à corriger, au lieu de laisser l'utilisateur le chercher. */
function creneauDuChemin(chemin) {
  const m = /^\/planningType\/(\d+)/.exec(chemin ?? '');
  return m ? Number(m[1]) : null;
}

/* Liste de problèmes de validation, avec son code et son pointeur JSON : c'est
   ce qui permet de retrouver le champ fautif dans le fichier sans le relire
   en entier. Avec `onProbleme`, chaque ligne qui vise un créneau devient
   cliquable et l'ouvre dans l'éditeur. */
/* Un problème, et ce qu'on peut en faire.

   Signaler un chevauchement ne suffit pas : il faut encore savoir par quel bout
   le prendre. Les issues viennent de `correctifsPour` (src/correctifs.ts), du
   moins destructeur au plus, chacune disant ce qu'elle emporte. Le moteur ne
   choisit pas — il ne sait pas laquelle des deux activités compte, seul
   l'établissement le sait. D'où « proposer », et jamais « corriger
   automatiquement ». */
function ProblemeACorriger({ referentiel, probleme, onOuvrir, onAppliquer }) {
  const [deplie, setDeplie] = useState(false);
  const correctifs = useMemo(() => correctifsPour(referentiel, probleme), [referentiel, probleme]);

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--crisis)', background: 'var(--card)' }}>
      <div className="flex items-start gap-2 px-3 py-2 text-sm">
        <span
          className="mt-0.5 shrink-0 text-[11px] uppercase"
          style={{ fontFamily: F_MONO, fontWeight: 600, color: 'var(--crisis)' }}
        >
          erreur
        </span>
        <span className="min-w-0 flex-1" style={{ color: 'var(--ink)' }}>
          {probleme.message}
        </span>
        <button
          type="button"
          onClick={() => onOuvrir?.(probleme)}
          className="shrink-0 rounded-lg border px-2 py-0.5 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
        >
          Ouvrir
        </button>
        {correctifs.length > 0 && (
          <button
            type="button"
            onClick={() => setDeplie((d) => !d)}
            aria-expanded={deplie}
            className="shrink-0 rounded-lg border px-2 py-0.5 text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
          >
            {deplie ? 'Masquer' : `${correctifs.length} correctif(s)`}
          </button>
        )}
      </div>

      {deplie && (
        <div className="space-y-1 border-t px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          {correctifs.map((correctif) => (
            <button
              key={correctif.id}
              type="button"
              onClick={() => onAppliquer(correctif)}
              className="block w-full rounded-lg border px-3 py-1.5 text-left text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{correctif.libelle}</span>
              <span className="block text-xs" style={{ color: 'var(--ink-soft)' }}>
                {correctif.explication}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ListeProblemes({ problemes, limite = 50, onProbleme }) {
  if (problemes.length === 0) {
    return (
      <Bandeau ton="succes" icone={Check} titre="Aucun problème">
        Le fichier est exploitable tel quel.
      </Bandeau>
    );
  }
  const affiches = problemes.slice(0, limite);
  return (
    <div className="space-y-1.5">
      {affiches.map((p, i) => (
        <div
          key={`${p.chemin}-${p.code}-${i}`}
          {...(onProbleme && creneauDuChemin(p.chemin) !== null
            ? {
                role: 'button',
                tabIndex: 0,
                onClick: () => onProbleme(p),
                onKeyDown: (e) => (e.key === 'Enter' || e.key === ' ') && onProbleme(p),
                title: 'Ouvrir ce créneau pour le corriger',
                className:
                  'flex w-full cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm',
              }
            : { className: 'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm' })}
          style={{
            borderColor: p.gravite === 'erreur' ? 'var(--crisis)' : 'var(--border)',
            background: 'var(--card)',
          }}
        >
          <span
            className="mt-0.5 shrink-0 text-[11px] uppercase"
            style={{
              fontFamily: F_MONO,
              fontWeight: 600,
              color: p.gravite === 'erreur' ? 'var(--crisis)' : 'var(--ink-soft)',
            }}
          >
            {p.gravite === 'erreur' ? 'erreur' : 'avert.'}
          </span>
          <span className="min-w-0">
            <code className="text-xs" style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
              {p.chemin}
            </code>{' '}
            <span style={{ color: 'var(--ink)' }}>{p.message}</span>{' '}
            <span className="text-xs" style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
              [{p.code}]
            </span>
          </span>
        </div>
      ))}
      {problemes.length > affiches.length && (
        <p className="pt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
          … et {problemes.length - affiches.length} autre(s).
        </p>
      )}
    </div>
  );
}

/* ==================== Navigation ==================== */

const DESTINATIONS = [
  { id: 'planning', nom: 'Planning', icone: Grid3x3 },
  { id: 'periode', nom: 'Période', icone: CalendarDays },
  { id: 'plannings', nom: 'Plannings', icone: Library },
  { id: 'regles', nom: 'Règles', icone: Wrench },
  { id: 'structure', nom: 'Structure', icone: Users },
  { id: 'fichiers', nom: 'Fichiers', icone: FileJson },
  { id: 'reglages', nom: 'Réglages', icone: Settings },
];

function NavigationLaterale({ destination, setDestination, replie, setReplie, theme, basculerTheme }) {
  return (
    <nav
      className="no-print flex shrink-0 flex-col border-r"
      style={{ width: replie ? 64 : 232, background: 'var(--nav-bg)', borderColor: 'var(--border)' }}
      aria-label="Navigation principale"
    >
      <div className="flex items-center gap-2 px-4 py-4">
        {!replie && (
          <span className="truncate text-sm" style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: 'var(--ink)' }}>
            Planning IME
          </span>
        )}
      </div>

      <ul className="flex-1 space-y-1 px-2">
        {DESTINATIONS.map(({ id, nom, icone: Icone }) => {
          const actif = destination === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => setDestination(id)}
                title={replie ? nom : undefined}
                aria-current={actif ? 'page' : undefined}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm"
                style={{
                  background: actif ? 'var(--accent)' : 'transparent',
                  color: actif ? 'var(--accent-ink)' : 'var(--ink)',
                  fontFamily: F_BODY,
                  justifyContent: replie ? 'center' : 'flex-start',
                }}
              >
                <Icone size={18} aria-hidden="true" />
                {!replie && <span>{nom}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 px-2 pb-3" style={{ justifyContent: replie ? 'center' : 'flex-start' }}>
        <button
          type="button"
          onClick={basculerTheme}
          title={theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
          aria-label={theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
          className="rounded-xl border p-2"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          type="button"
          onClick={() => setReplie(!replie)}
          title={replie ? 'Déplier' : 'Replier'}
          aria-label={replie ? 'Déplier la navigation' : 'Replier la navigation'}
          className="rounded-xl border p-2"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
        >
          {replie ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </nav>
  );
}

/* ==================== Grille ====================
   Le temps à gauche, et en face les activités côte à côte : la forme d'un
   planning d'IME tel qu'il s'écrit vraiment, et celle du document fourni par
   l'établissement.

   Deux choix commandent le reste :

   - **Les colonnes ne sont pas des personnes.** Une colonne par jeune découpait
     une même activité en autant de blocs qu'elle avait d'enfants, et personne
     ne lit un planning comme ça. Ce sont des COULOIRS d'activités simultanées
     (`couloirsDuJour`, src/vues.ts) : trois ou quatre colonnes au lieu de
     quinze. Le sort d'une personne en particulier se lit dans sa fiche.
   - **L'axe est en minutes, pas en pas.** Une ligne par pas donnait 78 lignes
     de 34 px pour une journée au pas de 5 minutes, là où le document d'origine
     en porte treize. Seules les bornes réelles portent une étiquette, et chaque
     bande est haute au prorata de sa durée — avec un plancher, sinon un créneau
     de cinq minutes serait illisible. */

const AFFICHAGES = [
  { valeur: 'activite', libelle: 'par activité' },
  { valeur: 'salle', libelle: 'par salle' },
  { valeur: 'jeune', libelle: 'fiche d’un jeune' },
  { valeur: 'educateur', libelle: 'fiche d’un éducateur' },
];

const estFiche = (affichage) => affichage === 'jeune' || affichage === 'educateur';

/* Hauteur d'une bande : proportionnelle à sa durée, jamais sous le plancher —
   ET jamais sous ce que son contenu réclame.

   Le prorata seul ne suffit pas : une heure d'accueil collectif à cinq paires
   demande plus de place qu'une heure de repas, et la rogner tronque des noms.
   Un tableur fait pareil, il grandit ses lignes selon ce qu'elles portent. */
const PIXELS_PAR_MINUTE = 0.9;
const HAUTEUR_MIN_BANDE = 30;
const HAUTEUR_TITRE = 20;
const HAUTEUR_LIGNE = 15;
const HAUTEUR_SALLE = 13;

function hauteurNecessaire(nbLignes, avecSalle) {
  return 10 + HAUTEUR_TITRE + nbLignes * HAUTEUR_LIGNE + (avecSalle ? HAUTEUR_SALLE : 0);
}

/**
 * `besoins` : ce que chaque créneau réclame — `{ pasDebut, pasFin, hauteur }`.
 * Un créneau qui déborde de la place que lui laissent ses bandes fait grandir
 * la DERNIÈRE d'entre elles : les créneaux qui commencent plus tard descendent
 * avec, et rien ne se recouvre.
 */
function bandesDeTemps(bornes, grille, besoins = []) {
  const hauteurs = [];
  for (let i = 0; i < bornes.length - 1; i++) {
    const minutes = (bornes[i + 1] - bornes[i]) * grille.pasMinutes;
    hauteurs.push(Math.max(HAUTEUR_MIN_BANDE, Math.round(minutes * PIXELS_PAR_MINUTE)));
  }

  const couvertes = (pasDebut, pasFin) => {
    const premiere = bornes.findIndex((b, i) => i < hauteurs.length && b <= pasDebut && pasDebut < bornes[i + 1]);
    let derniere = premiere;
    while (derniere + 1 < hauteurs.length && bornes[derniere + 1] < pasFin) derniere++;
    return { premiere, derniere };
  };

  // Du plus court au plus long : un créneau court impose sa hauteur d'abord,
  // et celui qui l'englobe en profite au lieu de la lui reprendre.
  for (const besoin of [...besoins].sort((a, b) => a.pasFin - a.pasDebut - (b.pasFin - b.pasDebut))) {
    const { premiere, derniere } = couvertes(besoin.pasDebut, besoin.pasFin);
    if (premiere < 0) continue;
    let disponible = 0;
    for (let i = premiere; i <= derniere; i++) disponible += hauteurs[i];
    if (disponible < besoin.hauteur) hauteurs[derniere] += besoin.hauteur - disponible;
  }

  const bandes = [];
  let haut = 0;
  for (let i = 0; i < hauteurs.length; i++) {
    bandes.push({ debut: bornes[i], fin: bornes[i + 1], haut, hauteur: hauteurs[i] });
    haut += hauteurs[i];
  }
  return { bandes, hauteur: haut };
}

/* Position verticale d'un créneau sur cet axe non linéaire : il faut cumuler
   les bandes, une règle graduée ne suffirait pas. */
function placeSurLAxe(bandes, pasDebut, pasFin) {
  const premiere = bandes.find((b) => b.debut <= pasDebut && pasDebut < b.fin) ?? bandes[0];
  const derniere =
    [...bandes].reverse().find((b) => b.debut < pasFin && pasFin <= b.fin) ?? bandes[bandes.length - 1];
  if (!premiere || !derniere) return { haut: 0, hauteur: HAUTEUR_MIN_BANDE };
  return { haut: premiere.haut, hauteur: derniere.haut + derniere.hauteur - premiere.haut };
}

/* « Héléna + Valentin / Camille + Callista » — les jeunes qui partagent les
   mêmes accompagnants tiennent sur une ligne, comme dans le document. Sans ce
   regroupement, une activité collective à cinq enfants ferait cinq lignes
   presque identiques. L'ordre de première apparition est conservé. */
function pairesDuCreneau(referentiel, creneau) {
  const groupes = new Map();
  for (const jeuneId of creneau.jeunes) {
    const educateurs = educateursAupresDe(creneau, jeuneId);
    const cle = educateurs.join(' ');
    const groupe = groupes.get(cle);
    if (groupe) groupe.jeunes.push(jeuneId);
    else groupes.set(cle, { jeunes: [jeuneId], educateurs });
  }
  return [...groupes.values()].map((g) => ({
    jeunes: g.jeunes.map((id) => referentiel.libelleJeune(id)).join(' + '),
    educateurs: g.educateurs.map((id) => referentiel.libelleEducateur(id)).join(' + '),
  }));
}

/* Lignes qu'un créneau sans binôme nommé occupe quand même : ses éducateurs,
   ou rien du tout pour un repas collectif. */
const creneau0Lignes = (creneau) => (creneau.educateurs.length > 0 ? 1 : 0);

function contourDuSignal(signal) {
  if (signal?.conflit) return '0 0 0 3px var(--crisis)';
  if (signal?.dur) return '0 0 0 2px var(--crisis)';
  if (signal?.souple) return '0 0 0 2px var(--ink-soft)';
  return 'none';
}

/* Le contenu d'un bloc : le nom de l'activité, puis les paires. */
function BlocCreneau({ referentiel, creneau, signal, onCreneau, montreSalle }) {
  const couleur = couleurActivite(referentiel, creneau.activiteId);
  const encre = texteLisibleSur(couleur);
  const nom = referentiel.activite(creneau.activiteId)?.nom ?? creneau.activiteId;
  const paires = pairesDuCreneau(referentiel, creneau);
  const salle = creneau.salleId ? (referentiel.salle(creneau.salleId)?.nom ?? creneau.salleId) : null;

  return (
    <button
      type="button"
      onClick={() => onCreneau?.(creneau.id)}
      className="absolute inset-x-[3px] overflow-hidden rounded-lg px-2 py-1 text-left"
      style={{ background: couleur, color: encre, boxShadow: contourDuSignal(signal) }}
      title={`${nom} — ${referentiel.grille.heureDePas(creneau.pasDebut)} à ${referentiel.grille.heureDePas(creneau.pasDebut + creneau.pas)}`}
    >
      <span className="flex items-center gap-1 text-xs" style={{ fontWeight: 600 }}>
        {(creneau.verrouille || creneau.epingle) && <Pin size={11} className="shrink-0" aria-label="Créneau figé" />}
        <span className="truncate">{nom}</span>
      </span>
      {/* Une activité collective sans binôme nommé — un repas, une pause — ne
          porte volontairement personne. Écrire « — personne » en travers de
          chaque cellule de ce genre ne signale rien et encombre tout. */}
      {paires.length === 0 ? (
        creneau.educateurs.length > 0 && (
          <span className="block truncate text-[11px]" style={{ opacity: 0.85, fontFamily: F_MONO }}>
            {creneau.educateurs.map((e) => referentiel.libelleEducateur(e)).join(', ')}
          </span>
        )
      ) : (
        paires.map((p, i) => (
          <span key={i} className="block truncate text-[11px]" style={{ opacity: 0.9, fontFamily: F_MONO }}>
            {p.jeunes} / {p.educateurs || '—'}
          </span>
        ))
      )}
      {montreSalle && salle && (
        <span className="block truncate text-[10px]" style={{ opacity: 0.75 }}>
          {salle}
        </span>
      )}
    </button>
  );
}

/* Colonnes de la grille. « par activité » range les créneaux en couloirs ;
   « par salle » garde une colonne par salle, plus une colonne « sans salle »
   quand il en reste à placer — c'est là qu'on voit ce qui reste à faire. */
function colonnesEtPlacement(referentiel, planning, affichage) {
  if (affichage === 'salle') {
    const orphelins = planning.creneaux.filter((c) => !c.salleId);
    const colonnes = referentiel.structure.salles.map((s) => ({
      id: s.id,
      nom: s.nom,
      sousTitre: `${s.capacite} places`,
    }));
    if (orphelins.length > 0) {
      colonnes.unshift({ id: ' sans-salle', nom: 'Sans salle', sousTitre: `${orphelins.length} à placer` });
    }
    const placement = new Map();
    for (const creneau of planning.creneaux) {
      const index = colonnes.findIndex((c) => c.id === (creneau.salleId ?? ' sans-salle'));
      if (index >= 0) placement.set(creneau.id, index);
    }
    return { colonnes, placement };
  }

  const { parCreneau, nombre } = couloirsDuJour(planning);
  return {
    colonnes: Array.from({ length: nombre }, (_, i) => ({ id: `couloir-${i}`, nom: '', sousTitre: '' })),
    placement: parCreneau,
  };
}

function Grille({ referentiel, planning, affichage, signalements, onCreneau }) {
  const grille = referentiel.grille;
  const { colonnes, placement } = colonnesEtPlacement(referentiel, planning, affichage);

  /* Les bornes viennent des créneaux : sans créneau il n'y a pas d'axe, et une
     grille vide se lit comme une application cassée. */
  const bornes = bornesDuJour(planning);
  if (bornes.length < 2) {
    return <Vide>Aucun créneau ce jour-là.</Vide>;
  }
  if (colonnes.length === 0) {
    return (
      <Vide>
        Aucune salle dans cette structure : il n’y a rien à afficher sur cet axe. Un planning importé depuis un
        tableur n’en nomme généralement pas — ajoutez-les dans l’écran Structure, ou revenez à l’affichage par
        activité.
      </Vide>
    );
  }

  const montreSalle = affichage !== 'salle';
  const besoins = planning.creneaux.map((c) => {
    const paires = pairesDuCreneau(referentiel, c);
    const lignes = paires.length > 0 ? paires.length : creneau0Lignes(c);
    return {
      pasDebut: c.pasDebut,
      pasFin: c.pasDebut + c.pas,
      hauteur: hauteurNecessaire(lignes, montreSalle && Boolean(c.salleId)),
    };
  });

  const { bandes, hauteur } = bandesDeTemps(bornes, grille, besoins);
  const montreEnTetes = colonnes.some((c) => c.nom !== '');
  const hauteurEnTete = montreEnTetes ? 49 : 0;

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max">
        {/* Axe des heures : seulement les bornes réelles */}
        <div className="sticky left-0 z-10 w-16 shrink-0" style={{ background: 'var(--card)' }}>
          {montreEnTetes && (
            <div className="border-b" style={{ borderColor: 'var(--border)', height: hauteurEnTete }} />
          )}
          <div className="relative" style={{ height: hauteur }}>
            {bandes.map((b) => (
              <div
                key={b.debut}
                className="absolute inset-x-0 border-b border-r px-2 text-[11px]"
                style={{
                  top: b.haut,
                  height: b.hauteur,
                  borderColor: 'var(--border)',
                  color: 'var(--ink-soft)',
                  fontFamily: F_MONO,
                }}
              >
                {grille.heureDePas(b.debut)}
              </div>
            ))}
          </div>
        </div>

        {/* Une colonne par couloir (ou par salle) */}
        {colonnes.map((colonne, i) => (
          <div key={colonne.id} className="min-w-[172px] flex-1 shrink-0">
            {montreEnTetes && (
              <div
                className="border-b border-r px-2 py-2"
                style={{ borderColor: 'var(--border)', height: hauteurEnTete }}
              >
                <div className="truncate text-sm" style={{ color: 'var(--ink)', fontWeight: 600 }} title={colonne.nom}>
                  {colonne.nom}
                </div>
                <div className="truncate text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {colonne.sousTitre}
                </div>
              </div>
            )}
            <div className="relative border-r" style={{ height: hauteur, borderColor: 'var(--border)' }}>
              {bandes.map((b) => (
                <div
                  key={b.debut}
                  className="absolute inset-x-0 border-b"
                  style={{
                    top: b.haut,
                    height: b.hauteur,
                    borderColor: 'var(--border)',
                    background: grille.estPause(b.debut) ? 'var(--nav-bg)' : 'transparent',
                  }}
                />
              ))}
              {planning.creneaux
                .filter((c) => placement.get(c.id) === i)
                .map((creneau) => {
                  const place = placeSurLAxe(bandes, creneau.pasDebut, creneau.pasDebut + creneau.pas);
                  return (
                    <div
                      key={creneau.id}
                      className="absolute inset-x-0"
                      style={{ top: place.haut + 2, height: Math.max(24, place.hauteur - 4) }}
                    >
                      <BlocCreneau
                        referentiel={referentiel}
                        creneau={creneau}
                        signal={signalements?.get(creneau.id)}
                        onCreneau={onCreneau}
                        montreSalle={affichage !== 'salle'}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== Fiche d'une personne ====================
   « Juste le planning d'un jeune avec les différents éducateurs qu'il va
   avoir, et inversement pour les éducateurs. » Une liste chronologique, pas
   une grille : on suit une journée, on ne compare pas des colonnes. */

function Fiche({ referentiel, planning, type, personneId, signalements, onCreneau }) {
  if (!personneId) return <Vide>Choisissez qui vous voulez suivre.</Vide>;

  const lignes = journeeDe(planning, { type, id: personneId });
  if (lignes.length === 0) {
    return <Vide>Aucun créneau ce jour-là pour cette personne.</Vide>;
  }

  const libelleEnFace = (id) =>
    type === 'jeune' ? referentiel.libelleEducateur(id) : referentiel.libelleJeune(id);

  return (
    <div className="space-y-1.5">
      {lignes.map((ligne, i) => {
        if (ligne.type === 'trou') {
          return (
            <div
              key={`trou-${i}`}
              className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--ink-soft)' }}
            >
              <span style={{ fontFamily: F_MONO }}>
                {referentiel.grille.heureDePas(ligne.pasDebut)} –{' '}
                {referentiel.grille.heureDePas(ligne.pasDebut + ligne.pas)}
              </span>
              <span>sans activité</span>
            </div>
          );
        }

        const creneau = ligne.creneau;
        const signal = signalements?.get(creneau.id);
        const salle = creneau.salleId ? (referentiel.salle(creneau.salleId)?.nom ?? creneau.salleId) : null;
        return (
          <button
            key={creneau.id}
            type="button"
            onClick={() => onCreneau?.(creneau.id)}
            className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm"
            style={{ borderColor: signal?.conflit || signal?.dur ? 'var(--crisis)' : 'var(--border)' }}
          >
            <span className="shrink-0" style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
              {referentiel.grille.heureDePas(creneau.pasDebut)} –{' '}
              {referentiel.grille.heureDePas(creneau.pasDebut + creneau.pas)}
            </span>
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ background: couleurActivite(referentiel, creneau.activiteId) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {referentiel.activite(creneau.activiteId)?.nom ?? creneau.activiteId}
            </span>
            <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--ink)' }}>
              {ligne.enFace.length > 0 ? ligne.enFace.map(libelleEnFace).join(', ') : '— personne en face'}
            </span>
            {salle && (
              <span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                {salle}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ==================== Détail d'un créneau ====================
   La modale ne retient que l'identifiant du créneau, jamais l'objet : sinon
   elle afficherait un état figé au moment du clic pendant que le planning
   change derrière elle (leçon de DatABA Manager). */

/* Chips d'une liste de personnes, retirables quand le créneau est éditable.
   Le même bloc sert aux jeunes et aux éducateurs : la seule différence est ce
   qu'on affiche, pas ce qu'on fait. */
function ListePersonnes({ titre, couleur, ids, catalogue, vide, titrePour, editable, onRetirer, onAjouter }) {
  const absents = catalogue.filter((p) => !ids.includes(p.id));
  return (
    <div>
      <dt>
        <Etiquette>
          {titre} ({ids.length})
        </Etiquette>
      </dt>
      <dd className="flex flex-wrap items-center gap-1.5 pt-1">
        {ids.length === 0 ? (
          <span style={{ color: vide.alerte ? 'var(--crisis)' : 'var(--ink-soft)' }}>{vide.texte}</span>
        ) : (
          ids.map((id) => (
            <span key={id} className="inline-flex items-center gap-1">
              <Badge couleur={couleur} titre={titrePour(id)}>
                {catalogue.find((p) => p.id === id)?.nom ?? id}
              </Badge>
              {editable && (
                <button
                  type="button"
                  onClick={() => onRetirer(id)}
                  aria-label={`Retirer ${catalogue.find((p) => p.id === id)?.nom ?? id}`}
                  title="Retirer de ce créneau"
                  className="rounded-md border p-0.5"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink-soft)' }}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))
        )}
        {editable && absents.length > 0 && (
          <select
            className="rounded-lg border px-2 py-1 text-xs"
            style={styleSaisie}
            value=""
            aria-label={`Ajouter ${titre.toLowerCase()}`}
            onChange={(e) => e.target.value && onAjouter(e.target.value)}
          >
            <option value="">+ ajouter…</option>
            {absents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        )}
      </dd>
    </div>
  );
}

/* Détail d'un créneau, et son éditeur.
   La modale ne retient que `creneauId` : elle relit le planning et la structure
   à chaque rendu. Garder l'objet figerait l'état du moment du clic pendant que
   le planning change derrière — y compris sous les modifications faites ici. */
function DetailCreneau({
  referentiel,
  structure,
  setStructure,
  planning,
  creneauId,
  violations,
  conflit,
  modifiable,
  onFermer,
}) {
  const creneau = planning.creneau(creneauId);
  const dansStructure = structure?.planningType.find((c) => c.id === creneauId) ?? null;
  if (!creneau) return null;

  /* On ne modifie que le planning TYPE : une journée réparée est un résultat
     figé, produit par le moteur, pas une source qu'on retouche. */
  const editable = Boolean(modifiable && dansStructure && setStructure);
  const grille = referentiel.grille;
  const activite = referentiel.activite(creneau.activiteId);
  const debut = grille.heureDePas(creneau.pasDebut);
  const fin = grille.heureDePas(creneau.pasDebut + creneau.pas);

  const appliquer = (changement) => setStructure(modifieCreneau(structure, creneauId, changement));

  const supprimer = () => {
    const nom = activite?.nom ?? creneau.activiteId;
    if (!window.confirm(`Supprimer « ${nom} » ${debut}–${fin} du planning type ?`)) return;
    setStructure(supprimeCreneau(structure, creneauId));
    onFermer();
  };

  const heures = (premier, dernier) =>
    Array.from({ length: dernier - premier + 1 }, (_, i) => {
      const h = grille.heureDePas(premier + i);
      return { valeur: h, libelle: h };
    });

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay-backdrop)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Détail du créneau"
      onClick={onFermer}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-5"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg" style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: 'var(--ink)' }}>
              {activite?.nom ?? creneau.activiteId}
            </h3>
            <p className="text-sm" style={{ color: 'var(--ink-soft)', fontFamily: F_MONO }}>
              {debut} – {fin} · {creneau.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="rounded-xl border p-1.5"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
          >
            <X size={16} />
          </button>
        </div>

        {!editable && modifiable === false && (
          <p className="mt-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Une journée analysée est un résultat du moteur, pas une source : elle ne se modifie pas ici.
            Passez sur « Planning type » pour corriger le planning de référence.
          </p>
        )}

        <dl className="mt-4 space-y-3 text-sm">
          {editable && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ libelle="Début">
                <Selecteur
                  valeur={debut}
                  onChange={(h) => appliquer({ debut: h })}
                  options={heures(0, grille.nbPas - 1)}
                />
              </Champ>
              <Champ libelle="Fin" aide="Déplacer le début conserve la durée ; changer la fin la modifie.">
                <Selecteur
                  valeur={fin}
                  onChange={(h) => setStructure(termineCreneauA(structure, creneauId, h))}
                  options={heures(creneau.pasDebut + 1, grille.nbPas)}
                />
              </Champ>
              <Champ
                libelle="Semaine"
                aide="« Toutes » : le créneau a lieu chaque semaine. A ou B : une semaine sur deux."
              >
                <Selecteur
                  valeur={dansStructure.quinzaine ?? ''}
                  onChange={(v) => appliquer({ quinzaine: v === '' ? null : v })}
                  options={[
                    { valeur: '', libelle: 'Toutes les semaines' },
                    { valeur: 'A', libelle: 'Semaine A' },
                    { valeur: 'B', libelle: 'Semaine B' },
                  ]}
                />
              </Champ>
            </div>
          )}

          <div>
            <dt>
              <Etiquette>Salle</Etiquette>
            </dt>
            <dd style={{ color: 'var(--ink)' }} className="pt-1">
              {editable ? (
                referentiel.structure.salles.length === 0 ? (
                  <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                    Aucune salle dans cette structure — elles se créent dans l’écran Structure.
                  </span>
                ) : (
                  <Selecteur
                    valeur={creneau.salleId ?? ''}
                    onChange={(v) => appliquer({ salleId: v === '' ? null : v })}
                    options={[
                      { valeur: '', libelle: 'aucune' },
                      ...referentiel.structure.salles.map((s) => ({ valeur: s.id, libelle: s.nom })),
                    ]}
                  />
                )
              ) : creneau.salleId ? (
                (referentiel.salle(creneau.salleId)?.nom ?? creneau.salleId)
              ) : (
                'aucune'
              )}
            </dd>
          </div>

          <ListePersonnes
            titre="Jeunes"
            couleur={CAT_INDIGO}
            ids={creneau.jeunes}
            catalogue={referentiel.structure.jeunes
              .filter((j) => j.actif)
              .map((j) => ({ id: j.id, nom: referentiel.libelleJeune(j.id) }))}
            vide={{ texte: 'aucun jeune présent', alerte: false }}
            titrePour={(id) => `encadrement ${referentiel.jeune(id)?.encadrement ?? '?'}`}
            editable={editable}
            onRetirer={(id) => setStructure(retireDuCreneau(structure, creneauId, { type: 'jeune', id }))}
            onAjouter={(id) => appliquer({ jeunes: [...creneau.jeunes, id] })}
          />

          <ListePersonnes
            titre="Éducateurs"
            couleur={CAT_TEAL}
            ids={creneau.educateurs}
            catalogue={referentiel.structure.educateurs
              .filter((e) => e.actif)
              .map((e) => ({ id: e.id, nom: referentiel.libelleEducateur(e.id) }))}
            vide={{ texte: 'aucun éducateur', alerte: true }}
            titrePour={(id) => referentiel.educateur(id)?.statut ?? ''}
            editable={editable}
            onRetirer={(id) => setStructure(retireDuCreneau(structure, creneauId, { type: 'educateur', id }))}
            onAjouter={(id) => appliquer({ educateurs: [...creneau.educateurs, id] })}
          />

          {editable ? (
            <div>
              <dt>
                <Etiquette>Statut</Etiquette>
              </dt>
              <dd className="pt-1">
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(dansStructure.verrouille)}
                    onChange={(e) => appliquer({ verrouille: e.target.checked })}
                  />
                  Verrouillé — le moteur contourne ce créneau au lieu de le déplacer
                </label>
              </dd>
            </div>
          ) : (
            (creneau.verrouille || creneau.epingle) && (
              <div>
                <dt>
                  <Etiquette>Statut</Etiquette>
                </dt>
                <dd style={{ color: 'var(--ink)' }}>
                  {creneau.verrouille && 'Verrouillé dans la structure — le moteur contourne au lieu de le déplacer. '}
                  {creneau.epingle && 'Épinglé pour aujourd’hui.'}
                </dd>
              </div>
            )
          )}
        </dl>

        {conflit && (
          <div className="mt-4">
            <Bandeau ton="alerte" icone={CircleAlert} titre="Conflit non résolu">
              {conflit.message}
            </Bandeau>
          </div>
        )}

        {violations.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <Etiquette>Règles concernées</Etiquette>
            {violations.map((v, i) => (
              <p
                key={`${v.regleId}-${i}`}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: v.dure ? 'var(--crisis)' : 'var(--border)', color: 'var(--ink)' }}
              >
                <span style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
                  {v.regleId} · {v.dure ? 'dure' : 'souple'}
                </span>
                <br />
                {v.message}
              </p>
            ))}
          </div>
        )}

        {editable && (
          <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              Les modifications s’appliquent au planning type et sont enregistrées localement.
            </p>
            <Bouton variante="danger" icone={Trash2} onClick={supprimer}>
              Supprimer
            </Bouton>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== Écran Planning ==================== */

function EcranPlanning({
  referentiel,
  structure,
  setStructure,
  jourAffiche,
  setJourAffiche,
  axe,
  setAxe,
  source,
  setSource,
  resultat,
  dateAffichee,
  setDateAffichee,
  options,
  creneauOuvert,
  setCreneauOuvert,
  validation,
  onProbleme,
  personneSuivie,
  setPersonneSuivie,
  quinzaine,
  setQuinzaine,
}) {

  /* Deux plannings possibles : le planning type d'un jour de la semaine (la
     référence, ce qui tourne quand tout le monde est là) et une journée datée
     de la série réparée. La seconde n'existe qu'après une analyse. */
  const journee = resultat?.journees.find((j) => j.date === dateAffichee) ?? null;
  const montreReparation = source === 'reparation' && journee;

  /* La semaine choisie ne filtre que le planning TYPE : une journée analysée
     est datée, c'est la date qui décide de sa quinzaine, pas ce sélecteur. */
  const planning = useMemo(
    () =>
      montreReparation
        ? journee.reparation.planning
        : planningTypeDuJour(referentiel, jourAffiche, quinzaine ?? undefined),
    [montreReparation, journee, referentiel, jourAffiche, quinzaine],
  );

  const jourDuPlanning = montreReparation ? journee.jour : jourAffiche;
  const etat = useMemo(() => etatJourNominal(jourDuPlanning), [jourDuPlanning]);

  /* Audit du planning type : sans réparation affichée, on montre quand même
     ce que le jour de référence viole déjà. */
  const audit = useMemo(
    () => (montreReparation ? null : auditeJourNominal(referentiel, jourAffiche, options)),
    [montreReparation, referentiel, jourAffiche, options],
  );

  const violations = montreReparation ? journee.reparation.violations : (audit?.violations ?? []);
  const conflits = montreReparation ? journee.reparation.conflits : (audit?.conflits ?? []);

  const signalements = useMemo(() => {
    const m = new Map();
    for (const v of violations) {
      for (const id of v.creneaux) {
        const e = m.get(id) ?? {};
        if (v.dure) e.dur = true;
        else e.souple = true;
        m.set(id, e);
      }
    }
    for (const c of conflits) m.set(c.creneauId, { ...(m.get(c.creneauId) ?? {}), conflit: true });
    return m;
  }, [violations, conflits]);

  const libres = useMemo(() => sallesLibres(referentiel, planning), [referentiel, planning]);
  const oublies = useMemo(() => jeunesSansAffectation(referentiel, planning, etat), [referentiel, planning, etat]);

  const imprimer = useCallback(() => {
    document.body.classList.add('impression-ciblee');
    const nettoyer = () => {
      document.body.classList.remove('impression-ciblee');
      window.removeEventListener('afterprint', nettoyer);
    };
    window.addEventListener('afterprint', nettoyer);
    window.print();
  }, []);

  const joursDeLaGrille = referentiel.structure.grille.jours;

  /* Qui l'on peut suivre dans une fiche. La liste change avec la vue : suivre
     un éducateur dans la fiche d'un jeune n'aurait pas de sens. */
  const personnesSuivables = useMemo(() => {
    if (!estFiche(axe)) return [];
    return axe === 'jeune'
      ? referentiel.structure.jeunes
          .filter((j) => j.actif)
          .map((j) => ({ valeur: j.id, libelle: referentiel.libelleJeune(j.id) }))
      : referentiel.structure.educateurs
          .filter((e) => e.actif)
          .map((e) => ({ valeur: e.id, libelle: referentiel.libelleEducateur(e.id) }));
  }, [axe, referentiel]);

  /* Ajouter un créneau, puis l'ouvrir : on le pose à la suite du dernier de la
     journée avec la durée déclarée de l'activité, et c'est l'éditeur qui sert à
     l'ajuster. Un formulaire de création de plus ferait deux endroits où régler
     les mêmes champs. */
  const [messageAjout, setMessageAjout] = useState(null);

  const ajouterCreneau = () => {
    const activite = referentiel.structure.activites[0];
    if (!activite) {
      setMessageAjout(
        'Aucune activité définie : un créneau doit en désigner une. Créez-en une dans l’écran Structure.',
      );
      return;
    }
    setMessageAjout(null);

    const grille = referentiel.grille;
    const finsDuJour = planning.creneaux.map((c) => c.pasDebut + c.pas);
    const duree = Math.max(1, Math.min(activite.dureePas, grille.nbPas));
    const pasDebut = Math.min(finsDuJour.length > 0 ? Math.max(...finsDuJour) : 0, grille.nbPas - duree);

    const suivante = ajouteCreneau(structure, {
      jour: jourAffiche,
      debut: grille.heureDePas(Math.max(0, pasDebut)),
      pas: duree,
      activiteId: activite.id,
      salleId: null,
      jeunes: [],
      educateurs: [],
      verrouille: false,
    });
    setStructure(suivante);
    setCreneauOuvert(suivante.planningType[suivante.planningType.length - 1].id);
  };

  /* Une fiche sans personne choisie n'affiche rien : on prend la première. */
  useEffect(() => {
    if (!estFiche(axe)) return;
    setPersonneSuivie((actuelle) =>
      actuelle && personnesSuivables.some((p) => p.valeur === actuelle)
        ? actuelle
        : (personnesSuivables[0]?.valeur ?? null),
    );
  }, [axe, personnesSuivables, setPersonneSuivie]);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Champ libelle="Jour">
            <Selecteur
              valeur={jourAffiche}
              onChange={setJourAffiche}
              options={joursDeLaGrille.map((j) => ({ valeur: j, libelle: j }))}
            />
          </Champ>
        </div>
        <div className="w-52">
          <Champ libelle="Vue">
            <Selecteur valeur={axe} onChange={setAxe} options={AFFICHAGES} />
          </Champ>
        </div>
        {referentiel.aDesQuinzaines && !montreReparation && (
          <div className="w-44">
            <Champ libelle="Semaine">
              <Selecteur
                valeur={quinzaine ?? ''}
                onChange={(v) => setQuinzaine(v === '' ? null : v)}
                options={[
                  { valeur: '', libelle: 'Les deux' },
                  { valeur: 'A', libelle: 'Semaine A' },
                  { valeur: 'B', libelle: 'Semaine B' },
                ]}
              />
            </Champ>
          </div>
        )}
        {estFiche(axe) && (
          <div className="w-52">
            <Champ libelle={axe === 'jeune' ? 'Jeune suivi' : 'Éducateur suivi'}>
              <Selecteur
                valeur={personneSuivie ?? ''}
                onChange={setPersonneSuivie}
                options={personnesSuivables}
              />
            </Champ>
          </div>
        )}
        <div className="w-56">
          <Champ libelle="Source">
            <Selecteur
              valeur={source}
              onChange={setSource}
              options={[
                { valeur: 'type', libelle: 'Planning type' },
                {
                  valeur: 'reparation',
                  libelle: resultat ? 'Journée analysée' : 'Journée analysée (aucune)',
                },
              ]}
            />
          </Champ>
        </div>
        {source === 'reparation' && resultat && (
          <div className="w-56">
            <Champ libelle="Date">
              <Selecteur
                valeur={dateAffichee ?? ''}
                onChange={setDateAffichee}
                options={resultat.journees.map((j) => ({
                  valeur: j.date,
                  libelle: `${j.date} — ${j.jour}${j.nominale ? '' : ' ·  réorganisée'}`,
                }))}
              />
            </Champ>
          </div>
        )}
        {!montreReparation && setStructure && (
          <Bouton icone={Plus} onClick={ajouterCreneau}>
            Ajouter un créneau
          </Bouton>
        )}
        <Bouton icone={Printer} onClick={imprimer}>
          Imprimer
        </Bouton>
      </div>

      {messageAjout && (
        <Bandeau ton="alerte" icone={AlertTriangle}>
          {messageAjout}
        </Bandeau>
      )}

      {source === 'reparation' && !journee && (
        <Bandeau ton="info" icone={Info} titre="Aucune journée analysée">
          Passez par l’écran Période : saisissez les dates et les absences, puis lancez l’analyse.
        </Bandeau>
      )}

      {(() => {
        /* Les erreurs de la structure elle-même — celles qui viennent d'un
           import. Cliquer une ligne ouvre le créneau fautif : sans ça, une
           liste d'erreurs ne dit pas où aller. */
        const aCorriger = (validation?.problemes ?? []).filter(
          (p) => p.gravite === 'erreur' && creneauDuChemin(p.chemin) !== null,
        );
        if (aCorriger.length === 0) return null;
        return (
          <Carte
            className="no-print"
            titre={`${aCorriger.length} créneau(x) à corriger`}
            sousTitre="« Ouvrir » mène au créneau ; « correctifs » propose les issues possibles"
          >
            <div className="space-y-1.5">
              {aCorriger.slice(0, 50).map((p, i) => (
                <ProblemeACorriger
                  key={p.cle ?? `${p.chemin}-${i}`}
                  referentiel={referentiel}
                  probleme={p}
                  onOuvrir={onProbleme}
                  onAppliquer={(correctif) => setStructure(correctif.applique(structure))}
                />
              ))}
              {aCorriger.length > 50 && (
                <p className="pt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  … et {aCorriger.length - 50} autre(s).
                </p>
              )}
            </div>
          </Carte>
        );
      })()}

      {conflits.length > 0 && (
        <Bandeau ton="alerte" icone={CircleAlert} titre={`${conflits.length} créneau(x) sans solution`}>
          {conflits.map((c) => (
            <p key={c.creneauId}>{c.message}</p>
          ))}
        </Bandeau>
      )}

      <div className="chemin-impression">
        <Carte
          className="zone-impression"
          titre={
            montreReparation
              ? `${classeDate(journee.date)} — journée réorganisée`
              : `${jourAffiche.charAt(0).toUpperCase()}${jourAffiche.slice(1)} — planning type`
          }
          sousTitre={
            montreReparation
              ? `${journee.reparation.changements.length} changement(s), coût ${journee.reparation.cout}`
              : `${planning.creneaux.length} créneaux, pas de ${referentiel.grille.pasMinutes} min`
          }
        >
          {estFiche(axe) ? (
            <Fiche
              referentiel={referentiel}
              planning={planning}
              type={axe}
              personneId={personneSuivie}
              signalements={signalements}
              onCreneau={setCreneauOuvert}
            />
          ) : (
            <Grille
              referentiel={referentiel}
              planning={planning}
              affichage={axe}
              signalements={signalements}
              onCreneau={setCreneauOuvert}
            />
          )}
        </Carte>
      </div>

      <div className="no-print grid gap-4 lg:grid-cols-2">
        <Carte titre="Salles libres" sousTitre="La grille des salles moins ce qui les occupe">
          {referentiel.structure.salles.length === 0 ? (
            <Vide>Aucune salle saisie — l’écran Structure les crée.</Vide>
          ) : (
            <div className="space-y-1">
              {/* Les pas où la même chose est libre se replient en une plage :
                  au pas de 5 minutes, la version pas-à-pas faisait 78 lignes
                  pour dire trois choses. */}
              {libres
                .reduce((plages, c) => {
                  const cle = c.libres.join(' ');
                  const derniere = plages[plages.length - 1];
                  if (derniere && derniere.cle === cle) derniere.fin = c.pas + 1;
                  else plages.push({ cle, libres: c.libres, debut: c.pas, fin: c.pas + 1 });
                  return plages;
                }, [])
                .map((p) => (
                  <div key={p.debut} className="flex items-baseline gap-3 text-sm">
                    <span className="w-24 shrink-0" style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
                      {referentiel.grille.heureDePas(p.debut)}–{referentiel.grille.heureDePas(p.fin)}
                    </span>
                    <span style={{ color: p.libres.length === 0 ? 'var(--crisis)' : 'var(--ink)' }}>
                      {p.libres.length === 0
                        ? 'aucune salle libre'
                        : p.libres.map((id) => referentiel.salle(id)?.nom ?? id).join(', ')}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </Carte>

        <Carte
          titre="Jeunes sans affectation"
          sousTitre="Présents ce jour-là, sur aucun créneau — hors pause"
        >
          {oublies.length === 0 ? (
            <Vide>Chaque jeune présent est affecté sur toute sa journée.</Vide>
          ) : (
            <div className="space-y-1.5">
              {oublies.map((o) => (
                <div key={o.jeuneId} className="flex items-baseline gap-3 text-sm">
                  <span className="w-16 shrink-0" style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {referentiel.libelleJeune(o.jeuneId)}
                  </span>
                  <span style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
                    {plagesDePas(o.pas)
                      .map(
                        (p) =>
                          `${referentiel.grille.heureDePas(p.debut)}–${referentiel.grille.heureDePas(p.fin)}`,
                      )
                      .join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Carte>
      </div>

      {violations.length > 0 && (
        <Carte
          className="no-print"
          titre={`${violations.length} règle(s) violée(s)`}
          sousTitre="Les règles dures d’abord : elles ne devraient jamais apparaître ici"
        >
          <div className="space-y-1.5">
            {[...violations]
              .sort((a, b) => Number(b.dure) - Number(a.dure))
              .map((v, i) => (
                <div
                  key={`${v.regleId}-${i}`}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: v.dure ? 'var(--crisis)' : 'var(--border)' }}
                >
                  <span style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
                    {v.regleId} · {v.type} · {v.dure ? 'dure' : `souple (coût ${v.cout})`}
                  </span>
                  <br />
                  <span style={{ color: 'var(--ink)' }}>{v.message}</span>
                </div>
              ))}
          </div>
        </Carte>
      )}

      {creneauOuvert && (
        <DetailCreneau
          referentiel={referentiel}
          structure={structure}
          setStructure={setStructure}
          planning={planning}
          creneauId={creneauOuvert}
          violations={violations.filter((v) => v.creneaux.includes(creneauOuvert))}
          conflit={conflits.find((c) => c.creneauId === creneauOuvert)}
          modifiable={!montreReparation}
          onFermer={() => setCreneauOuvert(null)}
        />
      )}
    </div>
  );
}

/* ==================== Écran Journée ====================
   Le fichier jour.json : absences, renforts, épingles. Il ne circule pas —
   c'est le seul endroit où l'on saisit ce qui change aujourd'hui. */
/* ==================== Écran Période ====================
   Une situation qui dure — « Lucas absent jusqu'au 19 » — et la série de
   plannings qu'elle appelle, jusqu'au retour au fonctionnement initial.
   Ce fichier ne circule pas : c'est le seul endroit où l'on saisit ce qui
   change. */

function LigneAbsence({ referentiel, absence, index, onChange, onSupprimer }) {
  const gens =
    absence.type === 'jeune'
      ? referentiel.structure.jeunes.map((j) => ({ valeur: j.id, libelle: j.initiales }))
      : referentiel.structure.educateurs.map((e) => ({ valeur: e.id, libelle: referentiel.libelleEducateur(e.id) }));

  const journee = absence.journee === true || (!absence.debut && !absence.fin);

  const maj = (suite) => onChange(index, suite);

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-32">
          <Champ libelle="Qui">
            <Selecteur
              valeur={absence.type}
              onChange={(type) => maj({ type, id: '', du: absence.du, au: absence.au, journee: true })}
              options={[
                { valeur: 'educateur', libelle: 'Éducateur' },
                { valeur: 'jeune', libelle: 'Jeune' },
              ]}
            />
          </Champ>
        </div>
        <div className="w-44">
          <Champ libelle="Personne">
            <Selecteur
              valeur={absence.id}
              onChange={(id) => maj({ ...absence, id })}
              options={[{ valeur: '', libelle: '— choisir —' }, ...gens]}
            />
          </Champ>
        </div>
        <div className="w-40">
          <Champ libelle="À partir du">
            <input
              type="date"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={styleSaisie}
              value={absence.du ?? ''}
              onChange={(e) => maj({ ...absence, du: e.target.value })}
            />
          </Champ>
        </div>
        <div className="w-40">
          <Champ libelle="Jusqu’au" aide={absence.au ? undefined : 'vide = jusqu’à nouvel ordre'}>
            <input
              type="date"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={styleSaisie}
              value={absence.au ?? ''}
              onChange={(e) => {
                const suite = { ...absence };
                if (e.target.value) suite.au = e.target.value;
                else delete suite.au;
                maj(suite);
              }}
            />
          </Champ>
        </div>
        <Bouton variante="danger" icone={Trash2} onClick={() => onSupprimer(index)}>
          Retirer
        </Bouton>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Champ libelle="Chaque jour">
            <Selecteur
              valeur={journee ? 'journee' : 'partielle'}
              onChange={(v) => {
                const base = { type: absence.type, id: absence.id, du: absence.du };
                if (absence.au) base.au = absence.au;
                if (absence.motif) base.motif = absence.motif;
                maj(
                  v === 'journee'
                    ? { ...base, journee: true }
                    : { ...base, debut: absence.debut ?? '13:00', fin: absence.fin ?? '16:30' },
                );
              }}
              options={[
                { valeur: 'journee', libelle: 'Toute la journée' },
                { valeur: 'partielle', libelle: 'Sur une plage horaire' },
              ]}
            />
          </Champ>
        </div>
        {!journee && (
          <>
            <div className="w-28">
              <Champ libelle="De">
                <input
                  type="time"
                  step="300"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={styleSaisie}
                  value={absence.debut ?? ''}
                  onChange={(e) => maj({ ...absence, debut: e.target.value })}
                />
              </Champ>
            </div>
            <div className="w-28">
              <Champ libelle="À">
                <input
                  type="time"
                  step="300"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={styleSaisie}
                  value={absence.fin ?? ''}
                  onChange={(e) => maj({ ...absence, fin: e.target.value })}
                />
              </Champ>
            </div>
          </>
        )}
        <div className="min-w-[12rem] flex-1">
          <Champ libelle="Motif">
            <input
              type="text"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={styleSaisie}
              value={absence.motif ?? ''}
              placeholder="facultatif"
              onChange={(e) => {
                const suite = { ...absence };
                if (e.target.value) suite.motif = e.target.value;
                else delete suite.motif;
                maj(suite);
              }}
            />
          </Champ>
        </div>
      </div>
    </div>
  );
}

/** Une journée de la série, repliée sur une ligne. */
function LigneJournee({ referentiel, journee, ouverte, onOuvrir }) {
  const { reparation } = journee;
  const etat = reparation.conflits.length > 0 ? 'conflit' : journee.nominale ? 'nominale' : 'reparee';
  const couleur = etat === 'conflit' ? CAT_CORAL : etat === 'nominale' ? CAT_TEAL : CAT_AMBER;

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        onClick={onOuvrir}
        className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left text-sm"
        aria-expanded={ouverte}
      >
        <span className="w-28 shrink-0" style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
          {journee.date}
        </span>
        <span className="w-20 shrink-0" style={{ color: 'var(--ink)' }}>
          {journee.jour}
        </span>
        <Badge couleur={couleur}>
          {etat === 'conflit'
            ? `${reparation.conflits.length} conflit(s)`
            : etat === 'nominale'
              ? 'inchangée'
              : `${reparation.changements.length} changement(s)`}
        </Badge>
        {reparation.jeunesImpactes.length > 0 && (
          <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
            {reparation.jeunesImpactes.map((id) => referentiel.libelleJeune(id)).join(', ')}
          </span>
        )}
      </button>
      {ouverte && (
        <div className="border-t px-3 py-3" style={{ borderColor: 'var(--border)' }}>
          <ResultatReparation referentiel={referentiel} reparation={reparation} />
        </div>
      )}
    </div>
  );
}

function EcranPeriode({
  referentiel,
  periode,
  setPeriode,
  resultat,
  lancerAnalyse,
  validationPeriode,
  onEnregistrer,
}) {
  const [ouverte, setOuverte] = useState(null);

  const majAbsence = (index, valeur) =>
    setPeriode({ ...periode, absences: periode.absences.map((a, i) => (i === index ? valeur : a)) });
  const supprimerAbsence = (index) =>
    setPeriode({ ...periode, absences: periode.absences.filter((_, i) => i !== index) });
  const ajouterAbsence = () =>
    setPeriode({
      ...periode,
      absences: [...periode.absences, { type: 'educateur', id: '', du: periode.du, journee: true }],
    });

  const renforts = referentiel.structure.educateurs.filter((e) => e.statut === 'renfort');
  const absencesCompletes = periode.absences.every((a) => a.id && a.du);
  const erreurs = (validationPeriode?.problemes ?? []).filter((p) => p.gravite === 'erreur');

  return (
    <div className="space-y-4">
      <Carte
        titre="La situation"
        sousTitre="Ce que vous saisissez ici ne quitte pas le poste."
        actions={
          resultat && (
            <Bouton icone={Save} onClick={onEnregistrer}>
              Enregistrer ce planning
            </Bouton>
          )
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Champ libelle="À partir du" aide={classeDate(periode.du)}>
              <input
                type="date"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={styleSaisie}
                value={periode.du}
                onChange={(e) => setPeriode({ ...periode, du: e.target.value })}
              />
            </Champ>
          </div>
          <div className="w-44">
            <Champ
              libelle="Jusqu’au"
              aide={periode.au ? classeDate(periode.au) : 'vide = jusqu’au retour à la normale'}
            >
              <input
                type="date"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={styleSaisie}
                value={periode.au ?? ''}
                onChange={(e) => {
                  const suite = { ...periode };
                  if (e.target.value) suite.au = e.target.value;
                  else delete suite.au;
                  setPeriode(suite);
                }}
              />
            </Champ>
          </div>
          <Bouton
            variante="primaire"
            icone={RefreshCw}
            onClick={lancerAnalyse}
            disabled={!absencesCompletes || erreurs.length > 0}
          >
            Analyser la période
          </Bouton>
        </div>

        {erreurs.length > 0 && (
          <div className="mt-3">
            <ListeProblemes problemes={erreurs} />
          </div>
        )}
        {erreurs.length === 0 && !absencesCompletes && (
          <div className="mt-3">
            <Bandeau ton="info" icone={Info} titre="Une absence est incomplète">
              Choisissez la personne et la date de début, ou retirez la ligne.
            </Bandeau>
          </div>
        )}
      </Carte>

      <Carte titre={`Absences (${periode.absences.length})`} actions={<Bouton onClick={ajouterAbsence}>Ajouter</Bouton>}>
        {periode.absences.length === 0 ? (
          <Vide>Personne d’absent : l’analyse dira simplement si le planning type tient debout.</Vide>
        ) : (
          <div className="space-y-2">
            {periode.absences.map((a, i) => (
              <LigneAbsence
                key={i}
                referentiel={referentiel}
                absence={a}
                index={i}
                onChange={majAbsence}
                onSupprimer={supprimerAbsence}
              />
            ))}
          </div>
        )}
      </Carte>

      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Renforts mobilisables" sousTitre="Sur toute la période">
          {renforts.length === 0 ? (
            <Vide>Aucun éducateur de statut « renfort » dans la structure.</Vide>
          ) : (
            <div className="space-y-1.5">
              {renforts.map((e) => {
                const actif = (periode.renforts ?? []).includes(e.id);
                return (
                  <label key={e.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                    <input
                      type="checkbox"
                      checked={actif}
                      onChange={() =>
                        setPeriode({
                          ...periode,
                          renforts: actif
                            ? (periode.renforts ?? []).filter((id) => id !== e.id)
                            : [...(periode.renforts ?? []), e.id],
                        })
                      }
                    />
                    {referentiel.libelleEducateur(e.id)}
                    <span className="text-xs" style={{ color: 'var(--ink-soft)', fontFamily: F_MONO }}>
                      {Object.keys(e.disponibilites).join(', ') || 'aucune disponibilité'}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </Carte>

        <Carte titre="Créneaux épinglés" sousTitre="Intouchables sur toute la période">
          {referentiel.structure.planningType.length === 0 ? (
            <Vide>Aucun créneau dans le planning type.</Vide>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {referentiel.structure.planningType.map((c) => {
                const epingle = (periode.epingles ?? []).includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                    <input
                      type="checkbox"
                      checked={epingle}
                      onChange={() =>
                        setPeriode({
                          ...periode,
                          epingles: epingle
                            ? (periode.epingles ?? []).filter((id) => id !== c.id)
                            : [...(periode.epingles ?? []), c.id],
                        })
                      }
                    />
                    <span style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
                      {c.jour.slice(0, 3)} {c.debut}
                    </span>
                    {referentiel.activite(c.activiteId)?.nom ?? c.activiteId}
                    {c.verrouille && <Pin size={12} aria-label="déjà verrouillé dans la structure" />}
                  </label>
                );
              })}
            </div>
          )}
        </Carte>
      </div>

      {validationPeriode && validationPeriode.problemes.length > erreurs.length && (
        <Carte titre="Avertissements">
          <ListeProblemes problemes={validationPeriode.problemes.filter((p) => p.gravite !== 'erreur')} />
        </Carte>
      )}

      {resultat && (
        <ResultatPeriode
          referentiel={referentiel}
          resultat={resultat}
          ouverte={ouverte}
          setOuverte={setOuverte}
        />
      )}
    </div>
  );
}

function ResultatPeriode({ referentiel, resultat, ouverte, setOuverte }) {
  const reparees = resultat.journees.filter((j) => !j.nominale).length;
  const conflits = resultat.journees.reduce((t, j) => t + j.reparation.conflits.length, 0);

  return (
    <Carte
      titre={`${resultat.journees.length} journée(s) analysée(s)`}
      sousTitre={`coût total ${resultat.cout}`}
      actions={
        <Badge couleur={resultat.admissible ? CAT_TEAL : CAT_CORAL}>
          {resultat.admissible ? 'admissible' : 'non admissible'}
        </Badge>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Statistique valeur={reparees} libelle="journées à réorganiser" />
        <Statistique valeur={conflits} libelle="conflits" alerte={conflits > 0} />
        <Statistique
          valeur={resultat.retourNominal ?? '—'}
          libelle="retour au fonctionnement initial"
          detail={
            resultat.retourNominal
              ? 'à partir de cette date, plus rien ne change'
              : 'la période s’achève sans y revenir'
          }
          alerte={!resultat.retourNominal}
        />
      </div>

      {resultat.violationsHebdomadaires.length > 0 && (
        <div className="mt-4">
          <Bandeau ton="alerte" icone={AlertTriangle} titre="Quotas hebdomadaires dépassés">
            <p className="mb-1">
              Invisibles journée par journée : c’est la lecture à la semaine qui les fait apparaître.
            </p>
            {resultat.violationsHebdomadaires.map((v, i) => (
              <p key={i}>
                {v.regleId} — {v.message}
              </p>
            ))}
          </Bandeau>
        </div>
      )}

      <div className="mt-4 space-y-1.5">
        {resultat.journees.map((journee) => (
          <LigneJournee
            key={journee.date}
            referentiel={referentiel}
            journee={journee}
            ouverte={ouverte === journee.date}
            onOuvrir={() => setOuverte(ouverte === journee.date ? null : journee.date)}
          />
        ))}
      </div>
    </Carte>
  );
}

function ResultatReparation({ referentiel, reparation }) {
  const violationsDures = reparation.violations.filter((v) => v.dure);
  const violationsSouples = reparation.violations.filter((v) => !v.dure);

  return (
    <Carte
      titre="Résultat"
      sousTitre={`coût total ${reparation.cout}`}
      actions={
        <Badge couleur={reparation.admissible ? CAT_TEAL : CAT_CORAL}>
          {reparation.admissible ? 'admissible' : 'non admissible'}
        </Badge>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Statistique valeur={reparation.changements.length} libelle="changements" />
        <Statistique
          valeur={reparation.jeunesImpactes.length}
          libelle="jeunes impactés"
          detail={reparation.jeunesImpactes.map((id) => referentiel.libelleJeune(id)).join(', ')}
        />
        <Statistique
          valeur={reparation.conflits.length}
          libelle="conflits"
          alerte={reparation.conflits.length > 0}
        />
      </div>

      {reparation.conflits.length > 0 && (
        <div className="mt-4">
          <Bandeau ton="alerte" icone={CircleAlert} titre="Créneaux sans solution">
            <p className="mb-2">
              Le moteur n’a rien trouvé qui ne viole pas une règle dure. Il le signale plutôt que de passer outre.
            </p>
            {reparation.conflits.map((c) => (
              <p key={c.creneauId}>{c.message}</p>
            ))}
          </Bandeau>
        </div>
      )}

      {reparation.changements.length > 0 && (
        <div className="mt-4">
          <Etiquette>Ce que le moteur a fait</Etiquette>
          <div className="mt-1.5 space-y-1">
            {reparation.changements.map((c, i) => (
              <div key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span
                  className="rounded px-1.5 text-[11px] uppercase"
                  style={{ fontFamily: F_MONO, background: 'var(--accent-wash)', color: 'var(--ink)' }}
                >
                  {c.action}
                </span>
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{referentiel.libelleEducateur(c.educateurId)}</span>
                <span style={{ color: 'var(--ink-soft)' }}>→ {c.creneauId}</span>
                <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {c.motif} · coût {c.cout}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {violationsDures.length > 0 && (
        <div className="mt-4">
          <Bandeau ton="alerte" icone={AlertTriangle} titre="Règles dures violées">
            Elles ne devraient jamais apparaître ici : le planning type en violait déjà avant réparation.
            {violationsDures.map((v, i) => (
              <p key={i}>
                {v.regleId} — {v.message}
              </p>
            ))}
          </Bandeau>
        </div>
      )}

      {violationsSouples.length > 0 && (
        <div className="mt-4">
          <Etiquette>Règles souples non tenues ({violationsSouples.length})</Etiquette>
          <div className="mt-1.5 space-y-1 text-sm">
            {violationsSouples.map((v, i) => (
              <p key={i} style={{ color: 'var(--ink)' }}>
                <span style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
                  {v.regleId} (coût {v.cout})
                </span>{' '}
                {v.message}
              </p>
            ))}
          </div>
        </div>
      )}
    </Carte>
  );
}

function Statistique({ valeur, libelle, detail, alerte }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: alerte ? 'var(--crisis)' : 'var(--border)' }}>
      <div
        className="text-2xl"
        style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: alerte ? 'var(--crisis)' : 'var(--ink)' }}
      >
        {valeur}
      </div>
      <div className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        {libelle}
      </div>
      {detail && (
        <div className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
          {detail}
        </div>
      )}
    </div>
  );
}

/* ==================== Écran Règles ====================
   Ajouter une règle, c'est ajouter une entrée dans structure.json — pas
   toucher au code. Cet écran édite ce qui se change le plus souvent en
   réunion (activer, désactiver, repondérer) et montre le reste tel qu'il est
   écrit dans le fichier. */

const LIBELLES_CIBLES = {
  jeunes: 'jeunes',
  educateurs: 'éducateurs',
  groupes: 'groupes',
  activites: 'activités',
  salles: 'salles',
};

function nomDeCible(referentiel, cle, id) {
  if (cle === 'jeunes') return referentiel.libelleJeune(id);
  if (cle === 'educateurs') return referentiel.libelleEducateur(id);
  if (cle === 'groupes') return referentiel.groupes.get(id)?.nom ?? id;
  if (cle === 'activites') return referentiel.activite(id)?.nom ?? id;
  if (cle === 'salles') return referentiel.salle(id)?.nom ?? id;
  return id;
}

function CarteRegle({ referentiel, regle, index, onChange }) {
  const evaluateur = catalogue().find((e) => e.type === regle.type);
  const inconnue = !evaluateur;

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: inconnue ? 'var(--crisis)' : 'var(--border)',
        opacity: regle.actif ? 1 : 0.55,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-xs" style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
              {regle.id}
            </code>
            <span style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: 'var(--ink)' }}>{regle.type}</span>
            <Badge couleur={regle.dure ? CAT_CORAL : CAT_ARDOISE}>
              {regle.dure ? 'dure' : `souple · ${regle.poids ?? 'poids par défaut'}`}
            </Badge>
            {inconnue && <Badge couleur={CAT_CORAL}>type inconnu</Badge>}
          </div>
          {regle.commentaire ? (
            <p className="mt-1 text-sm" style={{ color: 'var(--ink)' }}>
              {regle.commentaire}
            </p>
          ) : (
            <p className="mt-1 text-sm" style={{ color: 'var(--crisis)' }}>
              Sans commentaire — dans six mois, personne ne saura pourquoi cette règle existe.
            </p>
          )}
        </div>

        <label className="flex shrink-0 items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
          <input
            type="checkbox"
            checked={regle.actif}
            onChange={() => onChange(index, { ...regle, actif: !regle.actif })}
          />
          active
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Etiquette>Cibles</Etiquette>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(regle.cibles ?? {}).flatMap(([cle, ids]) =>
              (ids ?? []).map((id) => (
                <Badge key={`${cle}-${id}`} couleur={CAT_INDIGO} titre={LIBELLES_CIBLES[cle] ?? cle}>
                  {nomDeCible(referentiel, cle, id)}
                </Badge>
              )),
            )}
            {Object.values(regle.cibles ?? {}).every((v) => (v ?? []).length === 0) && (
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                aucune
              </span>
            )}
          </div>
        </div>
        <div>
          <Etiquette>Paramètres</Etiquette>
          <pre
            className="mt-1 overflow-x-auto rounded-lg border p-2 text-xs"
            style={{ fontFamily: F_MONO, borderColor: 'var(--border)', color: 'var(--ink)' }}
          >
            {JSON.stringify(regle.params ?? {}, null, 1)}
          </pre>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Champ libelle="Nature">
            <Selecteur
              valeur={regle.dure ? 'dure' : 'souple'}
              onChange={(v) => {
                const suite = { ...regle, dure: v === 'dure' };
                if (suite.dure) delete suite.poids;
                else if (suite.poids === undefined) suite.poids = 50;
                onChange(index, suite);
              }}
              options={[
                { valeur: 'dure', libelle: 'Dure — jamais violée' },
                { valeur: 'souple', libelle: 'Souple — négociable' },
              ]}
            />
          </Champ>
        </div>
        {!regle.dure && (
          <div className="w-32">
            <Champ libelle="Poids" aide="plus il est élevé, plus la violation coûte">
              <input
                type="number"
                min="0"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={styleSaisie}
                value={regle.poids ?? 50}
                onChange={(e) => onChange(index, { ...regle, poids: Number(e.target.value) })}
              />
            </Champ>
          </div>
        )}
      </div>
    </div>
  );
}

function EcranRegles({ referentiel, structure, setStructure, validation }) {
  const regles = structure.regles;
  const majRegle = (index, valeur) =>
    setStructure({ ...structure, regles: regles.map((r, i) => (i === index ? valeur : r)) });

  const problemesDeRegles = (validation?.problemes ?? []).filter((p) => p.chemin.startsWith('/regles'));

  return (
    <div className="space-y-4">
      <Carte
        titre={`${regles.length} règle(s)`}
        sousTitre={`${regles.filter((r) => r.actif).length} active(s) · ${regles.filter((r) => r.dure).length} dure(s)`}
      >
        <Bandeau ton="info" icone={Info} titre="Ce que cet écran modifie">
          Activation, nature (dure / souple) et poids — ce qui se rediscute en réunion. Les cibles et les
          paramètres se modifient dans le fichier : ils engagent la sémantique de la règle, pas son arbitrage.
          Toute modification doit être exportée pour être conservée.
        </Bandeau>
      </Carte>

      {problemesDeRegles.length > 0 && (
        <Carte titre="Règles mal configurées">
          <ListeProblemes problemes={problemesDeRegles} />
        </Carte>
      )}

      <div className="space-y-3">
        {regles.map((r, i) => (
          <CarteRegle key={r.id} referentiel={referentiel} regle={r} index={i} onChange={majRegle} />
        ))}
      </div>

      <Carte titre="Types disponibles" sousTitre="Ajouter un type demande du code ; ajouter une règle, non.">
        <div className="flex flex-wrap gap-1.5">
          {catalogue().map((e) => (
            <Badge key={e.type} couleur={e.dureParDefaut ? CAT_CORAL : CAT_ARDOISE} titre={e.dureParDefaut ? 'dure par défaut' : 'souple par défaut'}>
              {e.type}
            </Badge>
          ))}
        </div>
      </Carte>
    </div>
  );
}

/* ==================== Écran Structure ====================
   Lecture, sauf les salles. Le fichier reste la source de ce qui vient de lui —
   on ne retape pas ici un planning entier. Mais les salles, elles, ne viennent
   d'aucun fichier : un planning de tableur ne les nomme jamais. Elles n'ont
   donc pas d'autre endroit où exister. */

function Table({ colonnes, lignes }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th
                key={c}
                className="border-b px-2 py-1.5 text-left"
                style={{ borderColor: 'var(--border)', color: 'var(--ink-soft)', fontFamily: F_MONO, fontWeight: 500 }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne, i) => (
            <tr key={i}>
              {ligne.map((cellule, k) => (
                <td key={k} className="border-b px-2 py-1.5" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  {cellule}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function semaineEnTexte(semaine) {
  const entrees = Object.entries(semaine ?? {});
  if (entrees.length === 0) return '—';
  return entrees.map(([jour, p]) => `${jour.slice(0, 3)} ${p.debut}–${p.fin}`).join(' · ');
}

/* Carte d'une liste éditable : jeunes, éducateurs, activités, salles.

   Les quatre se ressemblent au point que les écrire séparément ferait quatre
   fois le même bug à corriger. Chacune n'a que deux champs qui comptent — un
   nom et une valeur propre au type — et les mêmes gestes : renommer sur place,
   supprimer, ajouter en bas.

   Rien de métier ici : la suppression passe par `src/edition.ts`, qui sait ce
   qu'il faut nettoyer avec (binômes, groupes, cibles de règles). L'écran ne
   fait que demander confirmation en annonçant l'impact. */
function CarteEditable({
  titre,
  sousTitre,
  vide,
  entrees,
  secondaire,
  placeholder,
  onRenommer,
  onSecondaire,
  onSupprimer,
  onAjouter,
}) {
  const [nom, setNom] = useState('');
  const [valeur, setValeur] = useState(secondaire.defaut);
  const [erreur, setErreur] = useState(null);

  const ajouter = () => {
    if (!nom.trim()) return;
    onAjouter(nom.trim(), valeur);
    setNom('');
    setValeur(secondaire.defaut);
  };

  /* Une suppression peut être refusée par le moteur — une activité encore
     utilisée, par exemple. Le message qu'il donne est plus précis que tout ce
     que l'écran pourrait inventer : on l'affiche tel quel. */
  const supprimer = (entree) => {
    try {
      setErreur(null);
      onSupprimer(entree);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };

  const champSecondaire = (val, onChange, aria) =>
    secondaire.options ? (
      <select
        className="w-32 rounded-lg border px-2 py-1 text-sm"
        style={styleSaisie}
        value={val}
        aria-label={aria}
        onChange={(e) => onChange(e.target.value)}
      >
        {secondaire.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : (
      <input
        type="number"
        min={secondaire.min ?? 0}
        step={secondaire.pas ?? 1}
        className="w-20 rounded-lg border px-2 py-1 text-sm"
        style={styleSaisie}
        value={val}
        aria-label={aria}
        onChange={(e) => onChange(e.target.value)}
      />
    );

  return (
    <Carte titre={`${titre} (${entrees.length})`} sousTitre={sousTitre}>
      {erreur && (
        <div className="mb-2">
          <Bandeau ton="alerte" icone={AlertTriangle}>
            {erreur}
          </Bandeau>
        </div>
      )}

      {entrees.length === 0 ? (
        <Vide>{vide}</Vide>
      ) : (
        <div className="space-y-1.5">
          {entrees.map((entree) => (
            <div
              key={entree.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <input
                className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm"
                style={styleSaisie}
                value={entree.nom}
                aria-label={`Nom de ${entree.nom}`}
                onChange={(e) => onRenommer(entree, e.target.value)}
              />
              {champSecondaire(entree.valeur, (v) => onSecondaire(entree, v), `${secondaire.libelle} de ${entree.nom}`)}
              <span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                {secondaire.unite}
              </span>
              <button
                type="button"
                onClick={() => supprimer(entree)}
                aria-label={`Supprimer ${entree.nom}`}
                className="rounded-lg border p-1"
                style={{ borderColor: 'var(--border)', color: 'var(--crisis)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <Champ libelle={`Ajouter ${titre.toLowerCase().replace(/s$/, '')}`}>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={styleSaisie}
              value={nom}
              placeholder={placeholder}
              onChange={(e) => setNom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ajouter()}
            />
          </Champ>
        </div>
        <div className="w-32">
          <Champ libelle={secondaire.libelle}>
            {champSecondaire(valeur, setValeur, `${secondaire.libelle} du nouvel élément`)}
          </Champ>
        </div>
        <Bouton variante="primaire" icone={Plus} onClick={ajouter} disabled={!nom.trim()}>
          Ajouter
        </Bouton>
      </div>
    </Carte>
  );
}

/* Combien de créneaux nomment cette personne : ce qu'il faut annoncer avant de
   la supprimer, parce que la suppression les touchera aussi. */
function creneauxDe(structure, id, champ) {
  return structure.planningType.filter((c) => c[champ].includes(id)).length;
}

function confirmeRetrait(quoi, nom, dessus, consequence) {
  const detail = dessus > 0 ? `\n\n${dessus} créneau(x) ${consequence}` : '';
  return window.confirm(`Supprimer ${quoi} « ${nom} » ?${detail}`);
}

function CarteJeunes({ structure, setStructure }) {
  return (
    <CarteEditable
      titre="Jeunes"
      sousTitre="Le prénom tel qu’il est écrit sur le planning, et le taux d’encadrement"
      vide="Aucun jeune. Ajoutez-les ici, ou importez un planning depuis un tableur."
      placeholder="Prénom"
      entrees={structure.jeunes.map((j) => ({ id: j.id, nom: j.initiales, valeur: j.encadrement }))}
      secondaire={{ libelle: 'Encadrement', unite: 'éduc./jeune', defaut: '1', min: 0.01, pas: 0.01 }}
      onRenommer={(e, v) => setStructure(modifieJeune(structure, e.id, { initiales: v }))}
      onSecondaire={(e, v) =>
        setStructure(modifieJeune(structure, e.id, { encadrement: Math.max(0.01, Number(v) || 0.01) }))
      }
      onSupprimer={(e) => {
        const dessus = creneauxDe(structure, e.id, 'jeunes');
        if (!confirmeRetrait('le jeune', e.nom, dessus, 'le nomment : il en sera retiré, binômes compris.')) return;
        setStructure(supprimeJeune(structure, e.id));
      }}
      onAjouter={(nom, valeur) =>
        setStructure(
          ajouteJeune(structure, {
            initiales: nom,
            encadrement: Math.max(0.01, Number(valeur) || 1),
            presence: {},
            actif: true,
          }),
        )
      }
    />
  );
}

function CarteEducateurs({ structure, setStructure }) {
  return (
    <CarteEditable
      titre="Éducateurs"
      sousTitre="Le statut décide qui le moteur peut mobiliser, et à quel coût"
      vide="Aucun éducateur. Sans eux, aucun créneau ne peut être encadré."
      placeholder="Nom ou prénom"
      entrees={structure.educateurs.map((e) => ({ id: e.id, nom: e.nom, valeur: e.statut }))}
      secondaire={{
        libelle: 'Statut',
        unite: '',
        defaut: 'titulaire',
        options: ['titulaire', 'renfort', 'autre-batiment', 'stagiaire'],
      }}
      onRenommer={(e, v) => setStructure(modifieEducateur(structure, e.id, { nom: v }))}
      onSecondaire={(e, v) => setStructure(modifieEducateur(structure, e.id, { statut: v }))}
      onSupprimer={(e) => {
        const dessus = creneauxDe(structure, e.id, 'educateurs');
        if (!confirmeRetrait('l’éducateur', e.nom, dessus, 'le nomment : il en sera retiré, binômes compris.'))
          return;
        setStructure(supprimeEducateur(structure, e.id));
      }}
      onAjouter={(nom, valeur) =>
        setStructure(
          ajouteEducateur(structure, {
            nom,
            statut: valeur,
            disponibilites: {},
            detachable: true,
            actif: true,
          }),
        )
      }
    />
  );
}

function CarteActivites({ structure, setStructure }) {
  return (
    <CarteEditable
      titre="Activités"
      sousTitre="La durée déclarée sert de référence : un créneau qui s’en écarte est signalé"
      vide="Aucune activité. Un créneau ne peut pas exister sans en désigner une."
      placeholder="Accueil, Sport, Repas…"
      entrees={structure.activites.map((a) => ({ id: a.id, nom: a.nom, valeur: a.dureePas }))}
      secondaire={{ libelle: 'Durée', unite: 'pas', defaut: '2', min: 1 }}
      onRenommer={(e, v) => setStructure(modifieActivite(structure, e.id, { nom: v }))}
      onSecondaire={(e, v) =>
        setStructure(modifieActivite(structure, e.id, { dureePas: Math.max(1, Number(v) || 1) }))
      }
      onSupprimer={(e) => {
        // Pas de confirmation : le moteur refuse tant qu'elle sert, et son
        // message dit exactement combien de créneaux la retiennent.
        setStructure(supprimeActivite(structure, e.id));
      }}
      onAjouter={(nom, valeur) =>
        setStructure(
          ajouteActivite(structure, {
            nom,
            dureePas: Math.max(1, Number(valeur) || 1),
            sallesPossibles: [],
            tagSalleRequis: null,
            capaciteJeunes: null,
            educateursRequis: null,
          }),
        )
      }
    />
  );
}

/* Les salles ne viennent presque jamais du tableur : un planning manuscrit ne
   les nomme pas. C'est le seul endroit où on les saisit, et sans elles l'axe
   « par salle » de la grille n'a rien à montrer. */
function CarteSalles({ structure, setStructure }) {
  return (
    <CarteEditable
      titre="Salles"
      sousTitre="Elles se saisissent ici, pas dans le tableur"
      vide="Aucune salle. Sans elles, la grille « par salle » et les règles de salle n’ont rien à dire."
      placeholder="Salle sensorielle"
      entrees={structure.salles.map((s) => ({ id: s.id, nom: s.nom, valeur: s.capacite }))}
      secondaire={{ libelle: 'Places', unite: 'places', defaut: '6', min: 0 }}
      onRenommer={(e, v) => setStructure(modifieSalle(structure, e.id, { nom: v }))}
      onSecondaire={(e, v) =>
        setStructure(modifieSalle(structure, e.id, { capacite: Math.max(0, Number(v) || 0) }))
      }
      onSupprimer={(e) => {
        const dessus = structure.planningType.filter((c) => c.salleId === e.id).length;
        if (!confirmeRetrait('la salle', e.nom, dessus, 's’y tiennent : ils se retrouveront sans salle.')) return;
        setStructure(supprimeSalle(structure, e.id));
      }}
      onAjouter={(nom, valeur) =>
        setStructure(ajouteSalle(structure, { nom, capacite: Math.max(0, Number(valeur) || 0) }))
      }
    />
  );
}

function EcranStructure({ referentiel, structure, setStructure }) {
  const s = structure;
  return (
    <div className="space-y-4">
      <Carte titre="Fichier" sousTitre={s.meta.libelle ?? ''}>
        <Table
          colonnes={['version', 'modifié le', 'auteur', 'établissement']}
          lignes={[[`v${s.meta.version}`, s.meta.dateModification, s.meta.auteur, s.meta.etablissement]]}
        />
      </Carte>

      <Carte
        titre="Grille"
        sousTitre={`${referentiel.grille.nbPas} pas de ${s.grille.pasMinutes} min, ${s.grille.debut} – ${s.grille.fin}`}
      >
        <p className="text-sm" style={{ color: 'var(--ink)' }}>
          Jours : {s.grille.jours.join(', ')}
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Pauses :{' '}
          {(s.grille.pauses ?? []).length === 0
            ? 'aucune'
            : s.grille.pauses.map((p) => `${p.libelle} ${p.debut} (${p.pas} pas)`).join(' · ')}
        </p>

        {/* L'ancre ne se demande que si l'alternance existe : sur un planning
            hebdomadaire, ce champ n'aurait rien à ancrer. */}
        {referentiel.aDesQuinzaines && (
          <div className="mt-3 max-w-xs">
            <Champ
              libelle="Semaine A à partir du"
              aide="La semaine contenant cette date est une semaine A ; l’alternance se déduit ensuite. Sans elle, une analyse datée mélange A et B."
            >
              <input
                type="date"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={styleSaisie}
                value={s.grille.semaineAOrigine ?? ''}
                onChange={(e) =>
                  setStructure({
                    ...s,
                    grille: e.target.value
                      ? { ...s.grille, semaineAOrigine: e.target.value }
                      : (({ semaineAOrigine, ...reste }) => reste)(s.grille),
                  })
                }
              />
            </Champ>
          </div>
        )}
      </Carte>

      <div className="grid gap-4 lg:grid-cols-2">
        <CarteJeunes structure={s} setStructure={setStructure} />
        <CarteEducateurs structure={s} setStructure={setStructure} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CarteActivites structure={s} setStructure={setStructure} />
        <CarteSalles structure={s} setStructure={setStructure} />
      </div>

      {/* Présences, disponibilités et groupes restent en lecture : ils viennent
          d'un fichier et se saisissent mal dans une liste. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Présences et disponibilités" sousTitre="Telles qu'elles arrivent du fichier">
          <Table
            colonnes={['qui', 'semaine']}
            lignes={[
              ...s.jeunes.map((j) => [j.initiales, semaineEnTexte(j.presence)]),
              ...s.educateurs.map((e) => [referentiel.libelleEducateur(e.id), semaineEnTexte(e.disponibilites)]),
            ]}
          />
        </Carte>
        <Carte titre={`Groupes (${s.groupes.length})`}>
          <Table
            colonnes={['nom', 'éducateurs de référence', 'jeunes']}
            lignes={s.groupes.map((g) => [
              g.nom,
              (g.refEducateurs ?? []).map((id) => referentiel.libelleEducateur(id)).join(', ') || '—',
              referentiel.jeunesDuGroupe(g.id).map((j) => j.initiales).join(', ') || '—',
            ])}
          />
        </Carte>
      </div>
    </div>
  );
}

/* ==================== Écran Fichiers ==================== */

function telecharger(nom, contenu) {
  const blob = new Blob([contenu], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

function ZoneDepot({ libelle, aide, onFichier, accept = 'application/json,.json', binaire = false }) {
  const [survol, setSurvol] = useState(false);
  const entree = useRef(null);

  const lire = (fichier) => {
    if (!fichier) return;
    const lecteur = new FileReader();
    if (binaire) {
      // Un export de tableur n'est pas forcément en UTF-8 : Numbers/Excel
      // peuvent sortir en windows-1252 selon la version et le systeme.
      // `readAsText` decoderait en UTF-8 par defaut et corromprait chaque
      // caractere accentue en silence. `decodeOctets` (src/import/tableur.ts)
      // essaie l'UTF-8 strict d'abord, bascule sinon — meme mecanisme que le
      // « coller », ou le presse-papiers livre deja du texte bien decode.
      lecteur.onload = () => onFichier(decodeOctets(new Uint8Array(lecteur.result)), fichier.name);
      lecteur.readAsArrayBuffer(fichier);
    } else {
      lecteur.onload = () => onFichier(String(lecteur.result), fichier.name);
      lecteur.readAsText(fichier);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        lire(e.dataTransfer.files?.[0]);
      }}
      className="rounded-xl border border-dashed p-6 text-center"
      style={{ borderColor: survol ? 'var(--accent)' : 'var(--border)', background: survol ? 'var(--accent-wash)' : 'transparent' }}
    >
      <Upload size={20} style={{ color: 'var(--ink-soft)' }} className="mx-auto" aria-hidden="true" />
      <p className="mt-2 text-sm" style={{ color: 'var(--ink)' }}>
        {libelle}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
        {aide}
      </p>
      <input
        ref={entree}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          lire(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="mt-3">
        <Bouton onClick={() => entree.current?.click()}>Choisir un fichier</Bouton>
      </div>
    </div>
  );
}

/* ==================== Import depuis un tableur ====================
   Coller le contenu copié depuis Numbers/Excel, ou déposer un fichier
   CSV/TSV exporté. Trois étapes, dans l'ordre où elles peuvent échouer :
   lecture du tableau, correspondance des noms, puis assemblage — chaque
   étape montre ce qu'elle a compris avant de laisser passer à la suivante.
   Rien n'est chargé avant que la structure assemblée ait été validée. */

function LigneCorrespondance({ correspondance, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
      <span className="w-40 shrink-0 truncate" style={{ color: 'var(--ink)', fontWeight: 600 }} title={correspondance.nom}>
        {correspondance.nom}
      </span>
      {correspondance.existant && (
        <Badge couleur={CAT_TEAL}>déjà connu</Badge>
      )}
      <div className="w-44">
        <Selecteur
          valeur={correspondance.cible}
          onChange={(cible) => onChange({ ...correspondance, cible })}
          options={[
            { valeur: 'jeune', libelle: 'Jeune' },
            { valeur: 'educateur', libelle: 'Éducateur' },
            { valeur: 'ignorer', libelle: 'Ignorer' },
          ]}
        />
      </div>
      <code className="text-xs" style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>
        {correspondance.cible === 'ignorer' ? '—' : correspondance.id}
      </code>
    </div>
  );
}
function LigneJourDetecte({ groupe, resolution, onChange }) {
  const resolu = groupe.jour !== null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: resolu ? 'var(--border)' : 'var(--crisis)' }}>
      <span className="w-40 shrink-0 truncate" style={{ color: 'var(--ink)', fontWeight: 600 }} title={groupe.brut || '(aucun jour détecté)'}>
        {groupe.brut || '(aucun jour détecté)'}
      </span>
      {resolu ? (
        <Badge couleur={CAT_TEAL}>{groupe.jour}</Badge>
      ) : (
        <>
          <div className="w-44">
            <Selecteur
              valeur={resolution === null ? 'ignorer' : (resolution ?? '')}
              onChange={(v) => onChange(v === 'ignorer' ? null : v === '' ? undefined : v)}
              options={[
                { valeur: '', libelle: '— à résoudre —' },
                ...JOURS.map((j) => ({ valeur: j, libelle: j })),
                { valeur: 'ignorer', libelle: 'Ignorer ce bloc' },
              ]}
            />
          </div>
          {resolution === undefined && (
            <span className="text-xs" style={{ color: 'var(--crisis)' }}>
              non résolu : ses créneaux seront ignorés
            </span>
          )}
        </>
      )}
    </div>
  );
}

/* Mémoire des fichiers importés.

   Un planning se reprend en plusieurs fois : on importe, on corrige, on
   s'interrompt, et le lendemain le fichier n'est plus sous la main. Les garder
   évite de le redemander.

   Ils portent de VRAIS prénoms. Ils restent donc dans le stockage local de ce
   poste, n'entrent dans aucun export, et « Vider ce poste » les efface avec le
   reste (voir CLE_IMPORTS). */
const IMPORTS_GARDES = 10;
const TAILLE_MAX_IMPORT = 200_000; // le fichier réel en fait 8 000

function litImports() {
  const liste = lireStockage(CLE_IMPORTS);
  return Array.isArray(liste) ? liste : [];
}

/**
 * Ajoute un fichier en tête, sans doublon de nom, et rend la liste tronquée.
 *
 * Un fichier trop gros n'est pas gardé : le quota du navigateur se remplit en
 * silence, et perdre la structure chargée pour avoir voulu garder une copie du
 * tableur serait un mauvais échange. `ecrireStockage` relit derrière lui, donc
 * un dépassement se voit — mais autant ne pas le provoquer.
 */
function avecImport(liste, nom, texte) {
  if (texte.length > TAILLE_MAX_IMPORT) return liste;
  const entree = { id: `${Date.now()}`, nom, date: new Date().toISOString(), taille: texte.length, texte };
  return [entree, ...liste.filter((i) => i.nom !== nom)].slice(0, IMPORTS_GARDES);
}

function CarteImportsRecents({ imports, onReprendre, onOublier }) {
  if (imports.length === 0) return null;

  return (
    <Carte
      titre={`Fichiers importés récemment (${imports.length})`}
      sousTitre="Gardés sur ce poste seulement, pour les reprendre sans les redemander"
    >
      <div className="space-y-1.5">
        {imports.map((fichier) => (
          <div
            key={fichier.id}
            className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {fichier.nom}
            </span>
            <span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)', fontFamily: F_MONO }}>
              {classeDate(fichier.date.slice(0, 10))} · {Math.max(1, Math.round(fichier.taille / 1024))} ko
            </span>
            <Bouton onClick={() => onReprendre(fichier)}>Reprendre</Bouton>
            <button
              type="button"
              onClick={() => onOublier(fichier)}
              aria-label={`Oublier ${fichier.nom}`}
              className="rounded-lg border p-1"
              style={{ borderColor: 'var(--border)', color: 'var(--crisis)' }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </Carte>
  );
}

function ImportTableur({ referentiel, structure, onCharge }) {
  const [texte, setTexte] = useState('');
  const [lu, setLu] = useState(null);
  const [erreurLecture, setErreurLecture] = useState(null);
  const [resolutionsJours, setResolutionsJours] = useState({});
  const [mode, setMode] = useState('completer');
  const [correspondances, setCorrespondances] = useState([]);
  const [metaAuteur, setMetaAuteur] = useState('');
  const [metaEtablissement, setMetaEtablissement] = useState('');
  const [resultatAssemblage, setResultatAssemblage] = useState(null);
  const [messageFinal, setMessageFinal] = useState(null);
  const [imports, setImportsEtat] = useState(litImports);

  /* Seul un fichier DÉPOSÉ est mémorisé : `analyseTexte` est aussi appelée à
     chaque frappe dans la zone de collage, et enregistrer là produirait une
     entrée par caractère. */
  const memorise = (nom, contenu) => {
    const suivants = avecImport(imports, nom, contenu);
    if (suivants === imports) return; // trop gros : voir TAILLE_MAX_IMPORT
    setImportsEtat(suivants);
    if (!ecrireStockage(CLE_IMPORTS, suivants)) setImportsEtat(imports);
  };

  const oublie = (fichier) => {
    const suivants = imports.filter((i) => i.id !== fichier.id);
    setImportsEtat(suivants);
    ecrireStockage(CLE_IMPORTS, suivants);
  };

  const analyseTexte = (contenu) => {
    setTexte(contenu);
    setResultatAssemblage(null);
    setMessageFinal(null);
    try {
      const table = decoupeTableau(contenu);
      const planning = litPlanning(table);
      setLu(planning);
      setErreurLecture(null);
      setResolutionsJours({});

      const base = mode === 'completer' && structure ? referentiel : null;
      setCorrespondances(proposeCorrespondances(base, nomsRencontres(planning)));
    } catch (e) {
      setLu(null);
      setErreurLecture(e instanceof Error ? e.message : String(e));
    }
  };

  const majCorrespondance = (index, valeur) =>
    setCorrespondances(correspondances.map((c, i) => (i === index ? valeur : c)));

  // Groupes dont l'en-tête ne correspond à aucun jour connu : c'est sur eux
  // seuls que `resolutionsJours` a un effet — les autres sont déjà résolus.
  const groupesAResoudre = (lu?.jours ?? []).filter((g) => g.jour === null);
  const toutResolu = groupesAResoudre.every((g) => resolutionsJours[g.brut] !== undefined);

  const assembler = () => {
    if (!lu) return;
    try {
      const options = {
        correspondances,
        resolutionsJours,
        ...(mode === 'completer' && structure ? { base: structure } : {}),
        ...(mode === 'remplacer' || !structure
          ? { metaDepart: { auteur: metaAuteur, etablissement: metaEtablissement } }
          : {}),
      };
      const resultat = assemble(lu, options);
      const controle = valideStructure(resultat.structure);
      setResultatAssemblage({ ...resultat, controle });
      setMessageFinal(null);
    } catch (e) {
      setMessageFinal({ ton: 'alerte', texte: e instanceof Error ? e.message : String(e) });
    }
  };

  /* Les erreurs de cohérence ne bloquent plus le chargement : c'est dans la
     grille qu'on les corrige, pas dans le tableur d'origine. Seule une forme
     cassée reste rédhibitoire — voir `estChargeable`. */
  const erreursControle = resultatAssemblage
    ? resultatAssemblage.controle.problemes.filter((p) => p.gravite === 'erreur')
    : [];
  const chargeable = resultatAssemblage ? estChargeable(resultatAssemblage.controle) : false;

  const charger = () => {
    if (!resultatAssemblage || !chargeable) return;
    onCharge(resultatAssemblage.structure);
    setMessageFinal(
      erreursControle.length > 0
        ? {
            ton: 'alerte',
            texte: `Planning chargé avec ${erreursControle.length} erreur(s) à corriger dans l’écran Planning.`,
          }
        : { ton: 'succes', texte: 'Planning chargé.' },
    );
    setTexte('');
    setLu(null);
    setResultatAssemblage(null);
  };

  const remplace = mode === 'remplacer' || !structure;
  const metaIncomplete = remplace && (!metaAuteur.trim() || !metaEtablissement.trim());
  const pretAAssembler = lu && !metaIncomplete;

  return (
    <Carte
      titre="Importer depuis un tableur"
      sousTitre="Coller le contenu copié depuis Numbers/Excel, ou déposer un fichier CSV/TSV exporté — un ou plusieurs jours à la fois"
    >
      <div className="space-y-4">
        <div>
          <Champ libelle="Contenu collé" aide="Sélectionnez les cellules dans le tableur, copiez, collez ici.">
            <textarea
              className="w-full rounded-xl border px-3 py-2 font-mono text-xs"
              style={{ ...styleSaisie, minHeight: '8rem' }}
              value={texte}
              onChange={(e) => analyseTexte(e.target.value)}
              placeholder={'9h30\tAccueil :\nOnyx / Wren\n10h\t…'}
            />
          </Champ>
          <div className="mt-2">
            <ZoneDepot
              libelle="…ou déposer un fichier CSV/TSV"
              aide="Exporté depuis le tableur. Les accents sont reconnus même si le fichier n’est pas en UTF-8."
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              binaire
              onFichier={(contenu, nom) => {
                analyseTexte(contenu);
                if (nom) memorise(nom, contenu);
              }}
            />
          </div>
        </div>

        <CarteImportsRecents
          imports={imports}
          onReprendre={(fichier) => analyseTexte(fichier.texte)}
          onOublier={oublie}
        />

        {erreurLecture && (
          <Bandeau ton="alerte" icone={AlertTriangle} titre="Lecture impossible">
            {erreurLecture}
          </Bandeau>
        )}

        {lu && (
          <>
            <div className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <Etiquette>Ce qui a été lu</Etiquette>
              <p className="mt-1" style={{ color: 'var(--ink)' }}>
                {lu.creneaux.length} créneau(x), de {lu.debut} à {lu.fin}
                {lu.jours.length > 0 &&
                  ` — ${lu.jours.length} jour(s) détecté(s) : ${lu.jours.map((g) => g.brut || '—').join(', ')}`}
              </p>
              {lu.remarques.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5" style={{ color: 'var(--ink-soft)' }}>
                  {lu.remarques.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>

            {groupesAResoudre.length > 0 && (
              <div>
                <Etiquette>Jour(s) à confirmer</Etiquette>
                <p className="mb-2 mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  Ces en-têtes ne correspondent à aucun jour de la grille — choisissez lequel, ou ignorez le
                  bloc de colonnes. Sans choix, ses créneaux ne sont pas importés.
                </p>
                <div className="space-y-1.5">
                  {groupesAResoudre.map((g) => (
                    <LigneJourDetecte
                      key={g.brut}
                      groupe={g}
                      resolution={resolutionsJours[g.brut]}
                      onChange={(v) => setResolutionsJours({ ...resolutionsJours, [g.brut]: v })}
                    />
                  ))}
                </div>
              </div>
            )}

            {structure && (
              <div className="w-64">
                <Champ libelle="Par rapport à la structure chargée">
                  <Selecteur
                    valeur={mode}
                    onChange={(v) => {
                      setMode(v);
                      const base = v === 'completer' ? referentiel : null;
                      setCorrespondances(proposeCorrespondances(base, nomsRencontres(lu)));
                    }}
                    options={[
                      { valeur: 'completer', libelle: 'Compléter (garder le reste)' },
                      { valeur: 'remplacer', libelle: 'Remplacer entièrement' },
                    ]}
                  />
                </Champ>
              </div>
            )}

            {remplace && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Champ libelle="Auteur">
                  <input
                    type="text"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    style={styleSaisie}
                    value={metaAuteur}
                    onChange={(e) => setMetaAuteur(e.target.value)}
                  />
                </Champ>
                <Champ libelle="Établissement">
                  <input
                    type="text"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    style={styleSaisie}
                    value={metaEtablissement}
                    onChange={(e) => setMetaEtablissement(e.target.value)}
                  />
                </Champ>
              </div>
            )}

            {correspondances.length > 0 && (
              <div>
                <Etiquette>Correspondance des noms ({correspondances.length})</Etiquette>
                <p className="mb-2 mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  Un fichier de tableur ne dit pas d’identifiant, seulement un nom : c’est cette liste qui décide qui
                  est qui, avant que quoi que ce soit ne soit chargé.
                </p>
                <div className="space-y-1.5">
                  {correspondances.map((c, i) => (
                    <LigneCorrespondance key={c.nom} correspondance={c} onChange={(v) => majCorrespondance(i, v)} />
                  ))}
                </div>
              </div>
            )}

            {!toutResolu && groupesAResoudre.length > 0 && (
              <Bandeau ton="info" icone={Info} titre="Jour(s) non confirmé(s)">
                Vous pouvez assembler sans les résoudre : leurs créneaux seront simplement ignorés et signalés.
              </Bandeau>
            )}

            <Bouton variante="primaire" onClick={assembler} disabled={!pretAAssembler}>
              Assembler
            </Bouton>
          </>
        )}

        {resultatAssemblage && (
          <div className="space-y-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
            <Etiquette>Résultat de l’assemblage</Etiquette>
            {resultatAssemblage.problemes.length > 0 && <ListeProblemes problemes={resultatAssemblage.problemes} />}
            {erreursControle.length > 0 ? (
              <Bandeau
                ton="alerte"
                icone={AlertTriangle}
                titre={`${erreursControle.length} erreur(s) dans le planning assemblé`}
              >
                <p className="mb-2">
                  {chargeable
                    ? 'Un planning réel en comporte presque toujours : deux activités qui se chevauchent, quelqu’un affecté à deux endroits à la fois. Chargez-le quand même — c’est dans la grille qu’on les voit et qu’on les corrige, pas dans le tableur.'
                    : 'Ce fichier ne respecte pas la forme attendue : il lui manque des champs sur lesquels l’application s’appuie. Il n’y a rien à corriger dans la grille tant que la forme ne tient pas.'}
                </p>
                <ListeProblemes problemes={resultatAssemblage.controle.problemes} />
              </Bandeau>
            ) : (
              resultatAssemblage.controle.problemes.length > 0 && (
                <ListeProblemes problemes={resultatAssemblage.controle.problemes} />
              )
            )}
            {chargeable && (
              <Bouton variante="primaire" icone={Upload} onClick={charger}>
                {erreursControle.length > 0 ? 'Charger quand même et corriger' : 'Charger ce planning'}
              </Bouton>
            )}
          </div>
        )}

        {messageFinal && (
          <Bandeau ton={messageFinal.ton} icone={messageFinal.ton === 'alerte' ? AlertTriangle : Check}>
            {messageFinal.texte}
          </Bandeau>
        )}
      </div>
    </Carte>
  );
}

/* Commencer un planning sans aucun fichier.

   Sans ça, l'application était un mur pour qui n'a pas d'export de tableur :
   pas de structure, donc pas de grille, donc rien à éditer. Ce formulaire ne
   demande que ce dont la grille a besoin pour exister — les jeunes, les
   éducateurs et les activités se saisissent ensuite dans l'écran Structure,
   les créneaux dans la grille elle-même. */
function CarteDepartVierge({ onCommencer }) {
  const [auteur, setAuteur] = useState('');
  const [etablissement, setEtablissement] = useState('');
  const [jours, setJours] = useState(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']);
  const [debut, setDebut] = useState('09:00');
  const [fin, setFin] = useState('16:30');
  const [pasMinutes, setPasMinutes] = useState('30');

  const bascule = (jour) =>
    setJours((actuels) =>
      actuels.includes(jour) ? actuels.filter((j) => j !== jour) : JOURS.filter((j) => actuels.includes(j) || j === jour),
    );

  const finApresDebut = fin > debut;
  const pret = auteur.trim() && etablissement.trim() && jours.length > 0 && finApresDebut;

  const commencer = () =>
    onCommencer(
      structureVierge({
        auteur: auteur.trim(),
        etablissement: etablissement.trim(),
        jours,
        debut,
        fin,
        pasMinutes: Number(pasMinutes),
      }),
    );

  return (
    <Carte
      titre="Commencer un planning vide"
      sousTitre="Sans fichier : vous saisissez tout à la main, en partant de la grille"
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ libelle="Auteur">
            <input
              type="text"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={styleSaisie}
              value={auteur}
              onChange={(e) => setAuteur(e.target.value)}
            />
          </Champ>
          <Champ libelle="Établissement">
            <input
              type="text"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={styleSaisie}
              value={etablissement}
              onChange={(e) => setEtablissement(e.target.value)}
            />
          </Champ>
        </div>

        <div>
          <Etiquette>Jours d’accueil</Etiquette>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {JOURS.map((jour) => (
              <button
                key={jour}
                type="button"
                onClick={() => bascule(jour)}
                aria-pressed={jours.includes(jour)}
                className="rounded-lg border px-2.5 py-1 text-sm"
                style={
                  jours.includes(jour)
                    ? { background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)' }
                    : { borderColor: 'var(--border)', color: 'var(--ink-soft)' }
                }
              >
                {jour}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Champ libelle="Ouverture">
            <input
              type="time"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={styleSaisie}
              value={debut}
              onChange={(e) => setDebut(e.target.value)}
            />
          </Champ>
          <Champ libelle="Fermeture">
            <input
              type="time"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              style={styleSaisie}
              value={fin}
              onChange={(e) => setFin(e.target.value)}
            />
          </Champ>
          <Champ
            libelle="Pas de la grille"
            aide="La plus petite durée manipulable. Toute règle exprimée en pas change d’échelle avec lui."
          >
            <Selecteur
              valeur={pasMinutes}
              onChange={setPasMinutes}
              options={[5, 10, 15, 30, 60].map((m) => ({ valeur: String(m), libelle: `${m} min` }))}
            />
          </Champ>
        </div>

        {!finApresDebut && (
          <Bandeau ton="alerte" icone={AlertTriangle}>
            La fermeture doit être après l’ouverture.
          </Bandeau>
        )}

        <Bouton variante="primaire" icone={Plus} onClick={commencer} disabled={!pret}>
          Commencer
        </Bouton>
      </div>
    </Carte>
  );
}

function EcranFichiers({
  structure,
  referentiel,
  validation,
  periode,
  chargerStructure,
  chargerPeriode,
  erreurStockage,
}) {
  const [messageStructure, setMessageStructure] = useState(null);
  const [messagePeriode, setMessagePeriode] = useState(null);

  const deposerStructure = async (texte, nom) => {
    let donnees;
    try {
      donnees = JSON.parse(texte);
    } catch (e) {
      setMessageStructure({ ton: 'alerte', texte: `${nom} n’est pas du JSON valide : ${e.message}` });
      return;
    }

    // Une enveloppe chiffrée n'est pas un structure.json : on la reconnaît
    // avant de tenter quoi que ce soit d'autre, et on demande la phrase de
    // passe pour en sortir le contenu — qui repasse ensuite par le même
    // contrôle que n'importe quel fichier en clair.
    if (estEnveloppeChiffree(donnees)) {
      const phrase = window.prompt(`${nom} est chiffré. Phrase de passe :`);
      if (phrase === null) return;
      try {
        donnees = await dechiffre(donnees, phrase);
      } catch (e) {
        setMessageStructure({
          ton: 'alerte',
          texte: e instanceof Error ? e.message : String(e),
        });
        return;
      }
    }

    const resultat = valideStructure(donnees);
    const erreurs = resultat.problemes.filter((p) => p.gravite === 'erreur');
    if (!estChargeable(resultat)) {
      setMessageStructure({
        ton: 'alerte',
        texte: `${nom} ne respecte pas la forme attendue (${erreurs.length} erreur(s)) — rien n’a été chargé.`,
        problemes: resultat.problemes,
      });
      return;
    }
    /* Refus d'une version antérieure, avec possibilité de forcer : c'est la
       règle d'usage de la spécification, et c'est le seul garde-fou contre
       deux personnes qui travaillent sur deux versions différentes. */
    if (structure && donnees.meta.version < structure.meta.version) {
      const forcer = window.confirm(
        `Ce fichier est en v${donnees.meta.version}, or la structure chargée est en v${structure.meta.version}.\n\n` +
          'Charger quand même ? La version en place sera remplacée.',
      );
      if (!forcer) {
        setMessageStructure({ ton: 'info', texte: 'Chargement annulé : version antérieure.' });
        return;
      }
    }
    chargerStructure(donnees);
    setMessageStructure({
      ton: erreurs.length > 0 ? 'alerte' : 'succes',
      texte:
        erreurs.length > 0
          ? `${nom} chargé (v${donnees.meta.version}) avec ${erreurs.length} erreur(s) à corriger.`
          : `${nom} chargé (v${donnees.meta.version}).`,
      problemes: resultat.problemes,
    });
  };

  const deposerPeriode = (texte, nom) => {
    let donnees;
    try {
      donnees = JSON.parse(texte);
    } catch (e) {
      setMessagePeriode({ ton: 'alerte', texte: `${nom} n’est pas du JSON valide : ${e.message}` });
      return;
    }
    const resultat = validePeriode(referentiel, donnees);
    if (!resultat.valide) {
      setMessagePeriode({
        ton: 'alerte',
        texte: `${nom} n’est pas exploitable avec la structure chargée.`,
        problemes: resultat.problemes,
      });
      return;
    }
    chargerPeriode(donnees);
    setMessagePeriode({ ton: 'succes', texte: `${nom} chargé.`, problemes: resultat.problemes });
  };

  const prochaineVersion = () => {
    const version = window.prompt(
      'Numéro de version pour l’export.\n\n' +
        'Il s’incrémente à chaque envoi : c’est ce qui permet de refuser un fichier périmé à la réception.',
      String(structure.meta.version + 1),
    );
    if (version === null) return null;
    const n = Number(version);
    if (!Number.isInteger(n) || n < 1) {
      window.alert('Version invalide : un entier positif est attendu.');
      return null;
    }
    return { ...structure, meta: { ...structure.meta, version: n, dateModification: aujourdhui() } };
  };

  const exporterStructure = () => {
    const sortie = prochaineVersion();
    if (!sortie) return;
    telecharger(`structure-v${sortie.meta.version}.json`, `${JSON.stringify(sortie, null, 2)}\n`);
  };

  const exporterStructureChiffree = async () => {
    const sortie = prochaineVersion();
    if (!sortie) return;
    const phrase = window.prompt(
      'Phrase de passe pour ce fichier.\n\n' +
        'Elle protège le fichier en transit, mais elle n’anonymise rien : qui la connaît lit les prénoms. ' +
        'À transmettre par un autre canal que le fichier lui-même.',
    );
    if (!phrase) return;
    const confirmation = window.prompt('Retapez la même phrase de passe, pour confirmer :');
    if (confirmation !== phrase) {
      window.alert('Les deux phrases ne correspondent pas : rien n’a été exporté.');
      return;
    }
    const enveloppe = await chiffre(sortie, phrase);
    telecharger(`structure-v${sortie.meta.version}.chiffre.json`, `${JSON.stringify(enveloppe, null, 2)}\n`);
  };

  return (
    <div className="space-y-4">
      {erreurStockage && (
        <Bandeau ton="alerte" icone={AlertTriangle} titre="Rien n’est conservé sur ce poste">
          L’écriture dans le stockage du navigateur a échoué (navigation privée, quota, stockage désactivé).
          L’application fonctionne, mais tout sera perdu à la fermeture de l’onglet : exportez avant de partir.
        </Bandeau>
      )}

      {/* Sans structure, partir d'une grille vide est une entrée à part
          entière — pas un repli. Une fois quelque chose de chargé, la carte
          disparaît : « commencer » écraserait le travail en cours, et c'est
          « Vider ce poste » (écran Réglages) qui sert à repartir de zéro. */}
      {!structure && <CarteDepartVierge onCommencer={chargerStructure} />}

      <Carte
        titre="structure.json"
        sousTitre="Le fichier qui circule par mail — celui qui définit tout ce que le moteur sait faire"
        actions={
          structure && (
            <>
              <Bouton icone={Download} onClick={exporterStructure}>
                Exporter
              </Bouton>
              <Bouton icone={Lock} onClick={exporterStructureChiffree}>
                Exporter (chiffré)
              </Bouton>
            </>
          )
        }
      >
        {structure ? (
          <div className="mb-4">
            <Table
              colonnes={['version', 'modifié le', 'auteur', 'contenu']}
              lignes={[
                [
                  `v${structure.meta.version}`,
                  structure.meta.dateModification,
                  structure.meta.auteur,
                  `${structure.jeunes.length} jeunes · ${structure.educateurs.length} éducateurs · ${structure.planningType.length} créneaux · ${structure.regles.length} règles`,
                ],
              ]}
            />
          </div>
        ) : (
          <div className="mb-4">
            <Bandeau ton="info" icone={Info} titre="Aucun planning chargé">
              L’application est livrée vide : elle ne connaît ni vos jeunes, ni vos éducateurs, ni vos
              salles tant que vous ne lui avez rien donné. Trois façons d’entrer : déposer un{' '}
              <code style={{ fontFamily: F_MONO }}>structure.json</code>, coller un planning de tableur plus bas,
              ou partir d’une grille vide et tout saisir à la main.
            </Bandeau>
          </div>
        )}

        <ZoneDepot
          libelle="Déposer un structure.json"
          aide="Le fichier est validé avant d’être chargé : en cas d’erreur, rien n’est remplacé. Un fichier chiffré est reconnu automatiquement."
          onFichier={deposerStructure}
        />

        {messageStructure && (
          <div className="mt-3 space-y-3">
            <Bandeau
              ton={messageStructure.ton}
              icone={messageStructure.ton === 'alerte' ? AlertTriangle : messageStructure.ton === 'succes' ? Check : Info}
            >
              {messageStructure.texte}
            </Bandeau>
            {messageStructure.problemes?.length > 0 && <ListeProblemes problemes={messageStructure.problemes} />}
          </div>
        )}
      </Carte>

      {structure && (
        <Carte
          titre="periode.json"
          sousTitre="La situation en cours — absences, renforts, épingles. Ne circule pas."
          actions={
            <Bouton
              icone={Download}
              onClick={() => telecharger(`periode-${periode.du}.json`, `${JSON.stringify(periode, null, 2)}\n`)}
            >
              Exporter
            </Bouton>
          }
        >
          <ZoneDepot
            libelle="Déposer un periode.json"
            aide="Refusé s’il a été construit sur une autre version de la structure."
            onFichier={deposerPeriode}
          />
          {messagePeriode && (
            <div className="mt-3 space-y-3">
              <Bandeau
                ton={messagePeriode.ton}
                icone={messagePeriode.ton === 'alerte' ? AlertTriangle : Check}
              >
                {messagePeriode.texte}
              </Bandeau>
              {messagePeriode.problemes?.length > 0 && <ListeProblemes problemes={messagePeriode.problemes} />}
            </div>
          )}
        </Carte>
      )}

      {structure && validation && (
        <Carte
          titre="Contrôle de la structure chargée"
          sousTitre="Les erreurs bloquent, les avertissements non"
        >
          <ListeProblemes problemes={validation.problemes} />
        </Carte>
      )}

      <ImportTableur referentiel={referentiel} structure={structure} onCharge={chargerStructure} />

      <Carte titre="Ce qu’un tableur ne peut pas porter">
        <p className="text-sm" style={{ color: 'var(--ink)' }}>
          Les règles ne s’importent pas : <code style={{ fontFamily: F_MONO }}>cibles</code> et{' '}
          <code style={{ fontFamily: F_MONO }}>params</code> sont des objets imbriqués, un tableau à plat ne les
          rend pas sans devenir illisible. Elles se saisissent dans l’écran Règles. Les salles ne sont pas non plus
          détectées : un planning manuscrit ne les nomme généralement pas — elles se complètent à la main dans
          l’écran Structure si besoin.
        </p>
      </Carte>
    </div>
  );
}

/* ==================== Écran Réglages ==================== */

function CarteHorsLigne() {
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let vivant = true;
    navigator.serviceWorker.ready
      .then((registration) => {
        const actif = registration.active;
        if (!actif) return;
        const canal = new MessageChannel();
        canal.port1.onmessage = (e) => {
          if (vivant) setEtat(e.data);
        };
        actif.postMessage({ type: 'etat' }, [canal.port2]);
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <Carte titre="Hors connexion" sousTitre="Ce que le poste sait servir sans réseau">
      {!etat ? (
        <Vide>
          Aucun service worker actif. En développement, ou sans HTTPS, le mode hors connexion ne s’installe pas —
          l’application fonctionne quand même.
        </Vide>
      ) : (
        <p className="text-sm" style={{ color: 'var(--ink)' }}>
          Version <code style={{ fontFamily: F_MONO }}>{etat.version}</code> — {etat.presents} fichier(s) en cache
          sur {etat.attendus} attendus.
          {etat.presents < etat.attendus && (
            <span style={{ color: 'var(--crisis)' }}> Le cache est incomplet : rechargez la page en ligne.</span>
          )}
        </p>
      )}
    </Carte>
  );
}

function EcranReglages({ options, setOptions, theme, setTheme, accent, setAccent }) {
  const majCout = (cle, valeur) =>
    setOptions({ ...options, couts: { ...options.couts, [cle]: Number(valeur) } });

  return (
    <div className="space-y-4">
      <Carte
        titre="Arbitrages du moteur"
        sousTitre="Les trois points laissés ouverts par la spécification — ils se règlent ici, pas dans le code"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Champ
            libelle="Priorité de réparation"
            aide="Ce qu’on préfère préserver quand il faut choisir"
          >
            <Selecteur
              valeur={options.priorite}
              onChange={(priorite) => setOptions(optionsAvec({ ...options, priorite, couts: undefined }))}
              options={[
                { valeur: 'jeunes', libelle: 'Les jeunes d’abord' },
                { valeur: 'educateurs', libelle: 'L’équipe d’abord' },
              ]}
            />
          </Champ>

          <Champ libelle="Détachement" aide="Un éducateur détaché est-il rappelable ?">
            <Selecteur
              valeur={options.detachement}
              onChange={(detachement) => setOptions({ ...options, detachement })}
              options={[
                { valeur: 'mobilisable', libelle: 'Mobilisable, mais cher' },
                { valeur: 'indisponible', libelle: 'Retiré du terrain' },
                { valeur: 'libre', libelle: 'Sans effet' },
              ]}
            />
          </Champ>

          <Champ libelle="Encadrement" aide="Comment se calcule l’effectif requis">
            <Selecteur
              valeur={options.encadrement}
              onChange={(encadrement) => setOptions({ ...options, encadrement })}
              options={[
                { valeur: 'individuel', libelle: 'Somme des encadrements' },
                { valeur: 'ratioGroupe', libelle: 'Ratio par groupe' },
              ]}
            />
          </Champ>
        </div>

        <div className="mt-4">
          <Etiquette>Barème</Etiquette>
          <p className="mb-2 mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
            Le barème suit la priorité choisie ; ces champs l’ajustent au cas par cas. « Créneau non résolu » doit
            rester très au-dessus du reste : le moteur doit toujours préférer une journée bousculée à un groupe
            sans encadrement.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['jeuneImpacte', 'Jeune impacté'],
              ['educateurDeplace', 'Éducateur déplacé'],
              ['creneauModifie', 'Créneau modifié'],
              ['creneauNonResolu', 'Créneau non résolu'],
              ['mobilisationDetache', 'Rappel d’un détaché'],
              ['recoursRenfort', 'Recours au renfort'],
            ].map(([cle, libelle]) => (
              <Champ key={cle} libelle={libelle}>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={styleSaisie}
                  value={options.couts[cle]}
                  onChange={(e) => majCout(cle, e.target.value)}
                />
              </Champ>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <Bouton onClick={() => setOptions(optionsAvec())} icone={RefreshCw}>
            Revenir aux valeurs par défaut
          </Bouton>
        </div>
      </Carte>

      <Carte titre="Apparence" sousTitre="Le mode et la couleur sont deux réglages indépendants">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <Etiquette>Mode</Etiquette>
            <div className="mt-1.5 flex gap-2">
              {[
                { id: 'light', nom: 'Clair', icone: Sun },
                { id: 'dark', nom: 'Sombre', icone: Moon },
              ].map(({ id, nom, icone: Icone }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTheme(id)}
                  className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                  style={{
                    borderColor: theme === id ? 'var(--accent)' : 'var(--border)',
                    background: theme === id ? 'var(--accent-wash)' : 'transparent',
                    color: 'var(--ink)',
                  }}
                  aria-pressed={theme === id}
                >
                  <Icone size={16} />
                  {nom}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Etiquette>Couleur</Etiquette>
            <div className="mt-1.5 flex gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.nom}
                  type="button"
                  onClick={() => setAccent(a.id)}
                  title={a.nom}
                  aria-label={a.nom}
                  aria-pressed={accent === a.id}
                  className="h-9 w-9 rounded-xl border"
                  style={{
                    background: a.swatch,
                    borderColor: accent === a.id ? 'var(--ink)' : 'var(--border)',
                    borderWidth: accent === a.id ? 2 : 1,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="mt-3 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Ni le mode sombre ni la couleur ne partent à l’imprimante : un planning affiché au mur sort en neutre.
        </p>
      </Carte>

      <CarteHorsLigne />

      <Carte titre="Stockage" sousTitre="Ce que ce poste garde entre deux ouvertures">
        <p className="text-sm" style={{ color: 'var(--ink)' }}>
          La structure chargée, la situation en cours, les plannings enregistrés, les derniers fichiers
          importés et ces réglages, dans le stockage local du navigateur, sous le préfixe{' '}
          <code style={{ fontFamily: F_MONO }}>planning-ime:</code>. Rien ne quitte ce poste.
        </p>
        <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Ce préfixe n’est pas cosmétique : cette application, DatABA et DatABA Manager partagent la même adresse,
          donc le même stockage. Rien n’est effacé en dehors de ce préfixe.
        </p>
        <div className="mt-3">
          <Bouton
            variante="danger"
            icone={Trash2}
            onClick={() => {
              if (
                !window.confirm(
                  'Effacer la structure, la situation en cours, les plannings enregistrés, les fichiers ' +
                    'importés récemment et les réglages de ce poste ?',
                )
              ) {
                return;
              }
              [CLE_STRUCTURE, CLE_PERIODE, CLE_SCENARIOS, CLE_OPTIONS, CLE_IMPORTS].forEach(effacerStockage);
              window.location.reload();
            }}
          >
            Vider ce poste
          </Bouton>
        </div>
      </Carte>
    </div>
  );
}

/* ==================== Application ==================== */
/* ==================== Écran Plannings ====================
   Les situations enregistrées, sous le nom qu'on leur a donné : « absence
   Lucas semaine ». Chacune garde DEUX choses — la situation (ce qui a été
   saisi) et le gel (ce qui a été produit et affiché). Le gel ne bouge plus :
   c'est ce qui a été imprimé et annoncé à l'équipe. Un bouton recalcule à
   côté, et la comparaison dit ce qui aurait changé. */

function ResumeSituation({ referentiel, periode }) {
  if (periode.absences.length === 0) return <span>aucune absence</span>;
  return (
    <span>
      {periode.absences
        .map((a) => {
          const nom = a.type === 'jeune' ? referentiel.libelleJeune(a.id) : referentiel.libelleEducateur(a.id);
          return `${nom} ${a.du}${a.au ? ` → ${a.au}` : ' → sans terme'}`;
        })
        .join(' · ')}
    </span>
  );
}

function Comparaison({ referentiel, differences }) {
  if (differences.length === 0) {
    return (
      <Bandeau ton="succes" icone={Check} titre="Rien n’a changé">
        Le recalcul redonne exactement le planning enregistré.
      </Bandeau>
    );
  }
  return (
    <div className="space-y-1.5">
      <Bandeau ton="alerte" icone={AlertTriangle} titre={`${differences.length} journée(s) différeraient aujourd’hui`}>
        Le planning enregistré reste tel qu’il a été produit. Voici ce qu’un nouveau calcul donnerait.
      </Bandeau>
      {differences.map((d) => (
        <div key={d.date} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
          <span style={{ fontFamily: F_MONO, color: 'var(--ink-soft)' }}>{d.date}</span>{' '}
          {!d.dansAvant && <Badge couleur={CAT_TEAL}>journée nouvelle</Badge>}
          {!d.dansApres && <Badge couleur={CAT_ARDOISE}>journée disparue</Badge>}
          {d.dansAvant && d.dansApres && (
            <span style={{ color: 'var(--ink)' }}>
              {d.creneauxModifies.length > 0 && `${d.creneauxModifies.length} créneau(x) modifié(s)`}
              {d.creneauxAjoutes.length > 0 && ` · ${d.creneauxAjoutes.length} ajouté(s)`}
              {d.creneauxRetires.length > 0 && ` · ${d.creneauxRetires.length} retiré(s)`}
              {d.jeunesImpactes.length > 0 && (
                <span style={{ color: 'var(--ink-soft)' }}>
                  {' '}
                  — {d.jeunesImpactes.map((id) => referentiel.libelleJeune(id)).join(', ')}
                </span>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function CartePlanning({ referentiel, structure, scenario, onOuvrir, onRenommer, onSupprimer, options }) {
  const [comparaison, setComparaison] = useState(null);
  const perime = scenario.structureVersion !== structure.meta.version;

  const recalculer = () => {
    try {
      const neuf = reparePeriode(referentiel, scenario.periode, options);
      setComparaison(comparePeriodes(scenario.gel, neuf));
    } catch (e) {
      window.alert(`Le recalcul n’a pas abouti : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const journees = scenario.gel?.journees ?? [];
  const reparees = journees.filter((j) => !j.nominale).length;

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base" style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: 'var(--ink)' }}>
            {scenario.nom}
          </h3>
          <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-soft)' }}>
            <ResumeSituation referentiel={referentiel} periode={scenario.periode} />
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)', fontFamily: F_MONO }}>
            enregistré le {scenario.cree} · structure v{scenario.structureVersion} · {journees.length} journée(s),{' '}
            {reparees} réorganisée(s)
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Bouton onClick={onOuvrir}>Ouvrir</Bouton>
          <Bouton icone={GitCompare} onClick={recalculer}>
            Recalculer
          </Bouton>
          <Bouton onClick={onRenommer}>Renommer</Bouton>
          <Bouton variante="danger" icone={Trash2} onClick={onSupprimer}>
            Supprimer
          </Bouton>
        </div>
      </div>

      {perime && (
        <div className="mt-3">
          <Bandeau ton="alerte" icone={AlertTriangle} titre="Calculé sur une autre structure">
            Ce planning a été produit sur la structure v{scenario.structureVersion}, or la structure chargée est en
            v{structure.meta.version}. La comparaison n’est pas fiable : les identifiants ont pu changer de sens.
          </Bandeau>
        </div>
      )}

      {comparaison && (
        <div className="mt-3">
          <Comparaison referentiel={referentiel} differences={comparaison} />
        </div>
      )}
    </div>
  );
}

function EcranPlannings({ referentiel, structure, scenarios, setScenarios, onOuvrir, options }) {
  const renommer = (id) => {
    const scenario = scenarios.find((s) => s.id === id);
    const nom = window.prompt('Nouveau nom', scenario?.nom ?? '');
    if (nom === null || !nom.trim()) return;
    setScenarios(scenarios.map((s) => (s.id === id ? { ...s, nom: nom.trim() } : s)));
  };

  const supprimer = (id) => {
    const scenario = scenarios.find((s) => s.id === id);
    if (!window.confirm(`Supprimer « ${scenario?.nom} » ?`)) return;
    setScenarios(scenarios.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-4">
      <Carte titre={`${scenarios.length} planning(s) enregistré(s)`}>
        <Bandeau ton="info" icone={Info} titre="Ce qui est gardé, et ce qui ne bouge plus">
          Chaque planning conserve la situation saisie <em>et</em> le résultat tel qu’il a été produit. Le résultat
          est figé : c’est ce qui a été imprimé et annoncé à l’équipe. « Recalculer » relance le moteur à côté et
          montre ce qui aurait changé, sans rien écraser.
        </Bandeau>
      </Carte>

      {scenarios.length === 0 ? (
        <Carte>
          <Vide>
            Aucun planning enregistré. Analysez une période, puis enregistrez-la sous un nom — « absence Lucas
            semaine », par exemple.
          </Vide>
        </Carte>
      ) : (
        <div className="space-y-3">
          {scenarios.map((scenario) => (
            <CartePlanning
              key={scenario.id}
              referentiel={referentiel}
              structure={structure}
              scenario={scenario}
              options={options}
              onOuvrir={() => onOuvrir(scenario)}
              onRenommer={() => renommer(scenario.id)}
              onSupprimer={() => supprimer(scenario.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ==================== Application ==================== */

function periodeVide(version) {
  return {
    structureVersion: version ?? 1,
    du: aujourdhui(),
    absences: [],
    renforts: [],
    epingles: [],
  };
}

export default function App() {
  const [structure, setStructureEtat] = useState(() => lireStockage(CLE_STRUCTURE));
  const [periode, setPeriodeEtat] = useState(() => lireStockage(CLE_PERIODE) ?? periodeVide());
  const [scenarios, setScenariosEtat] = useState(() => lireStockage(CLE_SCENARIOS) ?? []);
  const [options, setOptionsEtat] = useState(() => optionsAvec(lireStockage(CLE_OPTIONS) ?? {}));
  const [erreurStockage, setErreurStockage] = useState(false);

  const [destination, setDestination] = useState(() => (lireStockage(CLE_STRUCTURE) ? 'planning' : 'fichiers'));
  const [replie, setReplie] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'light');
  const [accent, setAccent] = useState(() => document.documentElement.getAttribute('data-accent'));

  const [resultat, setResultat] = useState(null);
  const [jourAffiche, setJourAffiche] = useState(null);
  const [dateAffichee, setDateAffichee] = useState(null);
  /* La vue par activité est celle du document d'origine : c'est elle qu'on
     ouvre par défaut. */
  const [axe, setAxe] = useState('activite');
  const [personneSuivie, setPersonneSuivie] = useState(null);
  /* `null` = les deux semaines ensemble : ce n'est le planning réel d'aucune
     semaine, mais c'est la bonne réponse tant que personne n'a choisi. */
  const [quinzaine, setQuinzaine] = useState(null);
  /* Le créneau ouvert vit ici, pas dans l'écran Planning : une erreur de
     validation cliquée depuis n'importe quel écran doit pouvoir l'ouvrir. */
  const [creneauOuvert, setCreneauOuvert] = useState(null);
  const [sourcePlanning, setSourcePlanning] = useState('type');

  /* Toute écriture est relue avant d'être annoncée réussie : un setItem qui ne
     lève pas ne prouve rien (leçon de DatABA Manager). Un échec remonte à
     l'écran plutôt que d'être avalé — sinon le poste rouvre vide sans que
     personne n'ait rien vu passer. */
  const persister = useCallback((cle, valeur) => {
    if (!ecrireStockage(cle, valeur)) setErreurStockage(true);
  }, []);

  const setStructure = useCallback(
    (valeur) => {
      setStructureEtat(valeur);
      persister(CLE_STRUCTURE, valeur);
    },
    [persister],
  );

  const setPeriode = useCallback(
    (valeur) => {
      setPeriodeEtat(valeur);
      persister(CLE_PERIODE, valeur);
    },
    [persister],
  );

  const setScenarios = useCallback(
    (valeur) => {
      setScenariosEtat(valeur);
      persister(CLE_SCENARIOS, valeur);
    },
    [persister],
  );

  const setOptions = useCallback(
    (valeur) => {
      const completes = optionsAvec(valeur);
      setOptionsEtat(completes);
      persister(CLE_OPTIONS, completes);
    },
    [persister],
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    ecrireStockage(CLE_THEME, theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0A1120' : '#F3F6FB');
  }, [theme]);

  useEffect(() => {
    if (accent) {
      document.documentElement.setAttribute('data-accent', accent);
      ecrireStockage(CLE_ACCENT, accent);
    } else {
      document.documentElement.removeAttribute('data-accent');
      effacerStockage(CLE_ACCENT);
    }
  }, [accent]);

  /* Le référentiel est reconstruit à chaque changement de structure : c'est
     lui qui porte les index. La structure a déjà été validée à l'import, mais
     une structure venue du stockage d'une version antérieure de l'application
     pourrait ne plus l'être — d'où le filet. */
  const { referentiel, erreurReferentiel } = useMemo(() => {
    if (!structure) return { referentiel: null, erreurReferentiel: null };
    try {
      return { referentiel: new Referentiel(structure), erreurReferentiel: null };
    } catch (e) {
      return { referentiel: null, erreurReferentiel: e instanceof Error ? e.message : String(e) };
    }
  }, [structure]);

  const validation = useMemo(() => (structure ? valideStructure(structure) : null), [structure]);
  const validationPeriode = useMemo(
    () => (referentiel ? validePeriode(referentiel, periode) : null),
    [referentiel, periode],
  );

  /* Le jour affiché doit toujours être un jour d'accueil de la structure
     chargée : sans ce recadrage, changer de structure laissait la grille sur
     un jour absent et affichait une page blanche sans rien dire. */
  useEffect(() => {
    if (!referentiel) return;
    const jours = referentiel.structure.grille.jours;
    setJourAffiche((actuel) => (actuel && jours.includes(actuel) ? actuel : (jours[0] ?? null)));
  }, [referentiel]);

  /* « par salle » ne dessine rien tant qu'aucune salle n'est saisie, et un
     planning importé d'un tableur n'en nomme jamais. On retombe sur la vue par
     activité plutôt que d'ouvrir sur une grille vide. */
  useEffect(() => {
    if (!referentiel) return;
    if (referentiel.structure.salles.length === 0) {
      setAxe((actuel) => (actuel === 'salle' ? 'activite' : actuel));
    }
  }, [referentiel]);

  /* Une analyse porte sur une structure, une situation et un barème donnés :
     dès que l'un des trois bouge, le résultat affiché ne décrit plus rien.
     Mieux vaut le retirer que laisser lire un planning périmé. */
  useEffect(() => {
    setResultat(null);
    setDateAffichee(null);
    setSourcePlanning('type');
  }, [structure, periode, options]);

  const chargerStructure = useCallback(
    (donnees) => {
      setStructure(donnees);
      setPeriode({ ...periodeVide(donnees.meta.version), du: periode.du });
      setDestination('planning');
    },
    [setStructure, setPeriode, periode.du],
  );

  /* D'une erreur de validation au créneau fautif, ouvert dans l'éditeur. Il
     faut recadrer l'écran avec : le créneau peut être un autre jour que celui
     affiché, et une journée réparée ne se modifie pas. */
  const ouvrirProbleme = useCallback(
    (probleme) => {
      const index = creneauDuChemin(probleme.chemin);
      const creneau = index === null ? null : structure?.planningType[index];
      if (!creneau) return;
      setJourAffiche(creneau.jour);
      setSourcePlanning('type');
      setDestination('planning');
      setCreneauOuvert(creneau.id);
    },
    [structure],
  );

  const lancerAnalyse = useCallback(() => {
    if (!referentiel) return;
    try {
      const calcul = reparePeriode(referentiel, periode, options);
      setResultat(calcul);
      setDateAffichee(calcul.journees[0]?.date ?? null);
      setSourcePlanning(calcul.journees.length > 0 ? 'reparation' : 'type');
    } catch (e) {
      window.alert(`L’analyse n’a pas abouti : ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [referentiel, periode, options]);

  const enregistrer = useCallback(() => {
    if (!resultat || !structure) return;
    const propose = periode.absences[0]
      ? `absence ${periode.absences[0].id} — ${periode.du}`
      : `planning ${periode.du}`;
    const nom = window.prompt('Nom de ce planning', propose);
    if (nom === null || !nom.trim()) return;
    setScenarios([
      {
        id: `s${Date.now().toString(36)}`,
        nom: nom.trim(),
        cree: aujourdhui(),
        structureVersion: structure.meta.version,
        periode,
        gel: resultat,
      },
      ...scenarios,
    ]);
    setDestination('plannings');
  }, [resultat, structure, periode, scenarios, setScenarios]);

  const ouvrirScenario = useCallback(
    (scenario) => {
      setPeriode(scenario.periode);
      // Le gel s'affiche tel quel : rouvrir un planning enregistré ne relance
      // pas le moteur, sinon ce ne serait plus le planning enregistré.
      setResultat(scenario.gel);
      setDateAffichee(scenario.gel?.journees[0]?.date ?? null);
      setSourcePlanning('reparation');
      setDestination('periode');
    },
    [setPeriode],
  );

  const enTete = (
    <header
      className="no-print flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3"
      style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
    >
      <div>
        <h1 className="text-lg" style={{ fontFamily: F_DISPLAY, fontWeight: 600, color: 'var(--ink)' }}>
          {DESTINATIONS.find((d) => d.id === destination)?.nom ?? 'Planning IME'}
        </h1>
        {structure && (
          <p className="text-xs" style={{ color: 'var(--ink-soft)', fontFamily: F_MONO }}>
            {structure.meta.etablissement} · v{structure.meta.version} · {structure.meta.libelle ?? ''}
          </p>
        )}
      </div>
      {validation && (
        <div className="flex items-center gap-2">
          {validation.problemes.filter((p) => p.gravite === 'erreur').length > 0 ? (
            <Badge couleur={CAT_CORAL}>
              {validation.problemes.filter((p) => p.gravite === 'erreur').length} erreur(s)
            </Badge>
          ) : validation.problemes.length > 0 ? (
            <Badge couleur={CAT_AMBER}>{validation.problemes.length} avertissement(s)</Badge>
          ) : (
            <Badge couleur={CAT_TEAL}>fichier propre</Badge>
          )}
        </div>
      )}
    </header>
  );

  const ecranFichiers = (
    <EcranFichiers
      structure={structure}
      referentiel={referentiel}
      validation={validation}
      periode={periode}
      chargerStructure={chargerStructure}
      chargerPeriode={setPeriode}
      erreurStockage={erreurStockage}
    />
  );

  let contenu;
  if (erreurReferentiel) {
    contenu = (
      <Bandeau ton="alerte" icone={AlertTriangle} titre="La structure enregistrée est illisible">
        {erreurReferentiel}. Rien n’a été effacé : rechargez un fichier valide depuis l’écran Fichiers, ou videz ce
        poste depuis les Réglages.
      </Bandeau>
    );
  } else if (!structure || !referentiel) {
    contenu = ecranFichiers;
  } else if (destination === 'planning') {
    contenu = jourAffiche ? (
      <EcranPlanning
        referentiel={referentiel}
        structure={structure}
        setStructure={setStructure}
        jourAffiche={jourAffiche}
        setJourAffiche={setJourAffiche}
        axe={axe}
        setAxe={setAxe}
        source={sourcePlanning}
        setSource={setSourcePlanning}
        resultat={resultat}
        dateAffichee={dateAffichee}
        setDateAffichee={setDateAffichee}
        options={options}
        creneauOuvert={creneauOuvert}
        setCreneauOuvert={setCreneauOuvert}
        validation={validation}
        onProbleme={ouvrirProbleme}
        personneSuivie={personneSuivie}
        setPersonneSuivie={setPersonneSuivie}
        quinzaine={quinzaine}
        setQuinzaine={setQuinzaine}
      />
    ) : (
      <Vide>La grille de cette structure ne déclare aucun jour d’accueil.</Vide>
    );
  } else if (destination === 'periode') {
    contenu = (
      <EcranPeriode
        referentiel={referentiel}
        periode={periode}
        setPeriode={setPeriode}
        resultat={resultat}
        lancerAnalyse={lancerAnalyse}
        validationPeriode={validationPeriode}
        onEnregistrer={enregistrer}
      />
    );
  } else if (destination === 'plannings') {
    contenu = (
      <EcranPlannings
        referentiel={referentiel}
        structure={structure}
        scenarios={scenarios}
        setScenarios={setScenarios}
        onOuvrir={ouvrirScenario}
        options={options}
      />
    );
  } else if (destination === 'regles') {
    contenu = (
      <EcranRegles
        referentiel={referentiel}
        structure={structure}
        setStructure={setStructure}
        validation={validation}
      />
    );
  } else if (destination === 'structure') {
    contenu = <EcranStructure referentiel={referentiel} structure={structure} setStructure={setStructure} />;
  } else if (destination === 'fichiers') {
    contenu = ecranFichiers;
  } else {
    contenu = (
      <EcranReglages
        options={options}
        setOptions={setOptions}
        theme={theme}
        setTheme={setTheme}
        accent={accent}
        setAccent={setAccent}
      />
    );
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ background: 'var(--paper)', color: 'var(--ink)', fontFamily: F_BODY }}
    >
      <NavigationLaterale
        destination={destination}
        setDestination={setDestination}
        replie={replie}
        setReplie={setReplie}
        theme={theme}
        basculerTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <main className="chemin-impression min-w-0 flex-1">
        {enTete}
        <div className="chemin-impression p-6">{contenu}</div>
      </main>
    </div>
  );
}
