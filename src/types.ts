/**
 * Types du fichier `structure.json` (stable, transmissible par mail)
 * et du fichier `jour.json` (absences et retouches du jour, jamais transmis).
 *
 * Reference : docs/schema.md
 */

/** Heure au format "HH:MM" sur 24 h. */
export type Heure = string;

/** Date au format "AAAA-MM-JJ". */
export type DateIso = string;

export type Jour = 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche';

export const JOURS: readonly Jour[] = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
];

/** Intervalle horaire inclusif au debut, exclusif a la fin. */
export interface Plage {
  debut: Heure;
  fin: Heure;
}

export type Semaine<T> = Partial<Record<Jour, T>>;

// --------------------------------------------------------------------------
// 1. meta
// --------------------------------------------------------------------------

export interface Meta {
  version: number;
  dateModification: DateIso;
  auteur: string;
  etablissement: string;
  libelle?: string;
}

// --------------------------------------------------------------------------
// 2. grille
// --------------------------------------------------------------------------

export interface Pause {
  debut: Heure;
  /** Duree de la pause en nombre de pas. */
  pas: number;
  libelle: string;
}

export interface Grille {
  pasMinutes: number;
  jours: Jour[];
  debut: Heure;
  fin: Heure;
  pauses?: Pause[];
}

// --------------------------------------------------------------------------
// 3. salles
// --------------------------------------------------------------------------

export interface Salle {
  id: string;
  nom: string;
  capacite: number;
  tags?: string[];
}

// --------------------------------------------------------------------------
// 4. groupes
// --------------------------------------------------------------------------

export interface Groupe {
  id: string;
  nom: string;
  refEducateurs?: string[];
}

// --------------------------------------------------------------------------
// 5. jeunes
// --------------------------------------------------------------------------

export interface Jeune {
  id: string;
  /** Anonymisation : initiales uniquement, comme dans l'appli ABA. */
  initiales: string;
  groupeId?: string;
  /**
   * Nombre d'educateurs requis pour ce jeune seul.
   * 1 = accompagnement individuel, 0.33 = compte pour un tiers d'educateur en collectif.
   */
  encadrement: number;
  /** Emploi du temps de presence hebdomadaire. Jour absent = non accueilli. */
  presence: Semaine<Plage>;
  actif: boolean;
}

// --------------------------------------------------------------------------
// 6. educateurs
// --------------------------------------------------------------------------

export type StatutEducateur = 'titulaire' | 'renfort' | 'autre-batiment' | 'stagiaire';

export interface Educateur {
  id: string;
  nom: string;
  prenom?: string;
  statut: StatutEducateur;
  fonctions?: string[];
  disponibilites: Semaine<Plage>;
  /** Peut etre detache de son groupe de reference vers un autre creneau. */
  detachable: boolean;
  actif: boolean;
}

// --------------------------------------------------------------------------
// 7. activites
// --------------------------------------------------------------------------

export interface Activite {
  id: string;
  nom: string;
  dureePas: number;
  sallesPossibles?: string[];
  tagSalleRequis?: string | null;
  capaciteJeunes?: number | null;
  /**
   * Nombre d'educateurs requis. `null` = deduit de la somme des `encadrement`
   * des jeunes affectes.
   */
  educateursRequis?: number | null;
}

// --------------------------------------------------------------------------
// 8. planningType
// --------------------------------------------------------------------------

/**
 * Qui accompagne qui, a l'interieur d'un creneau.
 *
 * Un planning reel ne dit pas seulement « ces jeunes et ces educateurs sont
 * ensemble » : il dit « Habib avec Agathe, Helena avec Sabrina ». Sans cette
 * paire, `educateurs_autorises` ne peut verifier que la co-presence dans la
 * salle, et `rotation_educateur` ne sait pas de quel educateur le jeune
 * change.
 *
 * Le tableau est facultatif et partiel : une activite collective sans
 * referent nomme n'en a pas, et un creneau peut n'en declarer que pour
 * certains de ses jeunes. Un jeune peut avoir plusieurs accompagnants, et un
 * educateur plusieurs jeunes.
 */
export interface Affectation {
  jeuneId: string;
  educateurId: string;
}

export interface CreneauType {
  id: string;
  jour: Jour;
  debut: Heure;
  /** Duree en nombre de pas. */
  pas: number;
  activiteId: string;
  salleId?: string | null;
  jeunes: string[];
  educateurs: string[];
  /** Binomes nommes. Chaque id doit figurer dans `jeunes` / `educateurs`. */
  affectations?: Affectation[];
  /** Creneau intouchable meme en cas d'absence : le moteur contourne. */
  verrouille: boolean;
}

// --------------------------------------------------------------------------
// 9. regles
// --------------------------------------------------------------------------

export type TypeRegle =
  | 'educateurs_autorises'
  | 'educateurs_interdits'
  | 'binome_jeunes'
  | 'jeunes_incompatibles'
  | 'rotation_educateur'
  | 'quota_detachement'
  | 'perimetre_renfort'
  | 'taux_encadrement'
  | 'salle_requise'
  | 'continuite_journee'
  | 'presence_minimale'
  | 'indisponibilite_recurrente';

export interface Cibles {
  jeunes?: string[];
  educateurs?: string[];
  groupes?: string[];
  activites?: string[];
  salles?: string[];
}

export interface Regle {
  id: string;
  type: TypeRegle | (string & {});
  /** `true` = jamais violee. Si aucune solution n'existe, le moteur signale le conflit. */
  dure: boolean;
  /** Arbitre entre regles souples concurrentes. Plus le poids est eleve, plus la violation coute. */
  poids?: number;
  actif: boolean;
  cibles: Cibles;
  params?: Record<string, unknown>;
  commentaire?: string;
}

// --------------------------------------------------------------------------
// Fichier complet
// --------------------------------------------------------------------------

export interface Structure {
  meta: Meta;
  grille: Grille;
  salles: Salle[];
  groupes: Groupe[];
  jeunes: Jeune[];
  educateurs: Educateur[];
  activites: Activite[];
  planningType: CreneauType[];
  regles: Regle[];
}

// --------------------------------------------------------------------------
// jour.json
// --------------------------------------------------------------------------

export interface Absence {
  type: 'educateur' | 'jeune';
  id: string;
  /** Absence sur la journee entiere. Exclusif avec `debut`/`fin`. */
  journee?: boolean;
  debut?: Heure;
  fin?: Heure;
  motif?: string;
}

export interface FichierJour {
  /** Version de `structure.json` sur laquelle ce fichier a ete construit. */
  structureVersion: number;
  date: DateIso;
  absences: Absence[];
  renfortsDuJour?: string[];
  /** Ids de creneaux du planningType a ne pas toucher aujourd'hui. */
  epingles?: string[];
  affectationsManuelles?: CreneauType[];
}
