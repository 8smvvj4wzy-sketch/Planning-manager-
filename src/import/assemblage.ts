/**
 * Assemble une lecture de tableur (`PlanningLu`) et des correspondances
 * validees en une `Structure` exploitable.
 *
 * Un seul chemin sert les deux usages demandes :
 *   - COMPLETER la semaine : `base` est la structure chargee, chaque jour
 *     importe vient s'y ajouter (ou remplacer ses propres creneaux, s'il y en
 *     avait deja pour ce jour) ;
 *   - REMPLACER le fichier : `base` est absent, tout repart de zero avec les
 *     jours que le fichier contient.
 *
 * Les jours ne sont plus imposes par l'appelant : ils viennent du fichier lui
 * meme (`planningLu.creneaux[].jour`, resolu par `litPlanning` a partir des
 * groupes de colonnes). Un groupe dont l'en-tete ne correspond a aucun jour
 * connu peut etre corrige via `resolutionsJours` (texte brut -> jour choisi) ;
 * sans correction, ses creneaux sont ignores et signales — jamais assignes au
 * hasard.
 *
 * Ce module ne decide de rien tout seul : il applique les correspondances que
 * l'ecran a fait confirmer, et il signale largement (`problemes`) tout ce
 * qu'il a du deduire ou n'a pas su lire, plutot que de l'inventer en
 * silence. Le resultat passe ensuite par la validation habituelle
 * (`valideStructure`) comme n'importe quel fichier.
 */

import { avertissement, type Probleme } from '../validation/resultat.ts';
import type {
  Affectation,
  CreneauType,
  Educateur,
  Jeune,
  Jour,
  Plage,
  Structure,
} from '../types.ts';
import type { Correspondance } from './correspondance.ts';
import { idUnique, normaliseNom } from './identifiants.ts';
import { groupePourColonne, type CreneauLu, type PlanningLu } from './tableur.ts';

export interface MetaDepart {
  auteur: string;
  etablissement: string;
  libelle?: string;
}

export interface OptionsAssemblage {
  /** Structure a completer. Absente = on repart de zero avec les jours du fichier. */
  base?: Structure;
  correspondances: readonly Correspondance[];
  /**
   * Corrige un en-tete de groupe non reconnu comme un jour : cle = texte brut
   * (`GroupeJour.brut`), valeur = jour choisi, ou `null` pour l'ignorer
   * explicitement. Un en-tete absent de cette table est ignore de la meme
   * facon (non resolu = non importe), et signale.
   */
  resolutionsJours?: Readonly<Record<string, Jour | null>>;
  /** Utilise seulement quand `base` est absent : il faut bien un auteur. */
  metaDepart?: MetaDepart;
}

export interface ResultatAssemblage {
  structure: Structure;
  problemes: Probleme[];
}

/**
 * `pasMinutes` vient du fichier importe, jamais d'un defaut fige : sur une
 * structure vierge, un pas de 30 code en dur desalignait tout createur ne
 * de 5 minutes des la premiere heure non ronde (11:15, 12:10...) — l'erreur
 * de validation resultante ("ne tombe pas sur une frontiere de pas") ne
 * pointait meme pas vers cette cause, elle se contentait de rejeter les
 * creneaux un par un.
 */
function structureVide(meta: MetaDepart, pasMinutes: number): Structure {
  return {
    meta: {
      version: 1,
      dateModification: new Date().toISOString().slice(0, 10),
      auteur: meta.auteur,
      etablissement: meta.etablissement,
      ...(meta.libelle ? { libelle: meta.libelle } : {}),
    },
    // Bornes placees aux extremes de la journee : le premier passage par
    // `elargieGrille`, juste apres, les ramene EXACTEMENT aux bornes reelles
    // du fichier importe (elle ne fait qu'elargir, jamais retrecir). Un
    // placeholder « raisonnable » comme 09:00 s'y serait substitue en
    // silence si le fichier commencait plus tard, sans jamais etre corrige —
    // fragile des que ce placeholder n'est pas un multiple exact du pas.
    grille: { pasMinutes, jours: [], debut: '23:59', fin: '00:00', pauses: [] },
    salles: [],
    groupes: [],
    jeunes: [],
    educateurs: [],
    activites: [],
    planningType: [],
    regles: [],
  };
}

function heureEnMinutes(h: string): number {
  const [heures, minutes] = h.split(':').map(Number);
  return (heures ?? 0) * 60 + (minutes ?? 0);
}

/** Etend une grille pour couvrir un jour et des bornes, sans jamais la retrecir. */
function elargieGrille(
  grille: Structure['grille'],
  jour: Jour,
  debut: string,
  fin: string,
): { grille: Structure['grille']; elargie: boolean } {
  const jours = grille.jours.includes(jour) ? grille.jours : [...grille.jours, jour];
  const nouveauDebut = heureEnMinutes(debut) < heureEnMinutes(grille.debut) ? debut : grille.debut;
  const nouveauFin = heureEnMinutes(fin) > heureEnMinutes(grille.fin) ? fin : grille.fin;
  const elargie =
    jours.length !== grille.jours.length || nouveauDebut !== grille.debut || nouveauFin !== grille.fin;
  return { grille: { ...grille, jours, debut: nouveauDebut, fin: nouveauFin }, elargie };
}

function plageDuJour(debut: string, fin: string): Plage {
  return { debut, fin };
}

/**
 * Jour final d'un creneau lu : celui deja resolu par `litPlanning`, sinon celui
 * choisi pour son groupe via `resolutionsJours`. `brut` est le texte de
 * l'en-tete du groupe (utile pour signaler), absent si aucune ligne de jours
 * n'a ete detectee du tout.
 */
function resoutJour(
  planningLu: PlanningLu,
  creneau: CreneauLu,
  resolutions: Readonly<Record<string, Jour | null>> | undefined,
): { jour: Jour | null; brut: string | undefined } {
  if (creneau.jour !== null) return { jour: creneau.jour, brut: undefined };
  const groupe = groupePourColonne(planningLu.jours, creneau.couloir);
  if (!groupe) return { jour: null, brut: undefined };
  return { jour: resolutions?.[groupe.brut] ?? null, brut: groupe.brut };
}

export function assemble(planningLu: PlanningLu, options: OptionsAssemblage): ResultatAssemblage {
  const problemes: Probleme[] = [];
  const { correspondances, resolutionsJours } = options;

  const depart =
    options.base ??
    structureVide(options.metaDepart ?? { auteur: '', etablissement: '' }, planningLu.pasMinutes);
  if (!options.base && (!options.metaDepart?.auteur || !options.metaDepart.etablissement)) {
    problemes.push(
      avertissement(
        'import.meta',
        '/meta',
        'auteur et etablissement sont vides : a completer avant l’export, le schema les exige',
      ),
    );
  }

  // --- 0. jour final de chaque creneau, une fois pour toutes --------------
  const creneauxResolus = planningLu.creneaux.map((creneau) => ({
    creneau,
    ...resoutJour(planningLu, creneau, resolutionsJours),
  }));

  const brutsIgnores = new Set(
    creneauxResolus.filter((c) => c.jour === null).map((c) => c.brut ?? '(aucun jour detecte)'),
  );
  for (const brut of brutsIgnores) {
    problemes.push(
      avertissement(
        'import.jour-ignore',
        '/planningType',
        `groupe de colonnes "${brut}" : jour non resolu, ses creneaux sont ignores`,
      ),
    );
  }

  const joursPresents = new Set<Jour>(
    creneauxResolus.filter((c): c is typeof c & { jour: Jour } => c.jour !== null).map((c) => c.jour),
  );

  // --- 1. la grille couvre-t-elle deja ces jours et ces heures ? ----------
  let grille = depart.grille;
  const joursElargis: Jour[] = [];
  for (const jour of joursPresents) {
    const r = elargieGrille(grille, jour, planningLu.debut, planningLu.fin);
    grille = r.grille;
    if (r.elargie) joursElargis.push(jour);
  }
  if (joursElargis.length > 0) {
    problemes.push(
      avertissement(
        'import.grille',
        '/grille',
        `la grille a ete elargie pour couvrir ${joursElargis.join(', ')} ${planningLu.debut}–${planningLu.fin}`,
      ),
    );
  }
  if (options.base && grille.pasMinutes !== planningLu.pasMinutes) {
    problemes.push(
      avertissement(
        'import.pas',
        '/grille/pasMinutes',
        `le pas deduit de ce fichier (${planningLu.pasMinutes} min) differe de la grille chargee ` +
          `(${grille.pasMinutes} min) ; les creneaux importes sont alignes sur la grille existante`,
      ),
    );
  }

  // --- 2. jeunes et educateurs : ceux qui existent s'enrichissent, --------
  //        les autres sont crees avec des defauts prudents. La presence /
  //        disponibilite pour un jour donne se pose plus bas, uniquement pour
  //        les jours ou la personne apparait reellement dans un creneau.
  const jeunes = new Map(depart.jeunes.map((j) => [j.id, { ...j, presence: { ...j.presence } }]));
  const educateurs = new Map(
    depart.educateurs.map((e) => [e.id, { ...e, disponibilites: { ...e.disponibilites } }]),
  );
  const idParNom = new Map<string, { id: string; cible: 'jeune' | 'educateur' }>();

  for (const c of correspondances) {
    if (c.cible === 'ignorer') continue;
    idParNom.set(normaliseNom(c.nom), { id: c.id, cible: c.cible });

    if (c.cible === 'jeune') {
      if (!jeunes.has(c.id)) {
        const nouveau: Jeune = {
          id: c.id,
          initiales: c.nom,
          encadrement: 1,
          presence: {},
          actif: true,
        };
        jeunes.set(c.id, nouveau);
        problemes.push(
          avertissement('import.jeune', `/jeunes`, `nouveau jeune cree depuis le fichier : "${c.nom}"`),
        );
      }
    } else {
      if (!educateurs.has(c.id)) {
        const nouveau: Educateur = {
          id: c.id,
          nom: c.nom,
          statut: 'titulaire',
          disponibilites: {},
          detachable: true,
          actif: true,
        };
        educateurs.set(c.id, nouveau);
        problemes.push(
          avertissement(
            'import.educateur',
            `/educateurs`,
            `nouvel educateur cree depuis le fichier : "${c.nom}" (statut "titulaire" par defaut, a verifier)`,
          ),
        );
      }
    }
  }

  const plage = plageDuJour(planningLu.debut, planningLu.fin);

  // --- 3. activites : matchees par nom, sinon creees. -----------------------
  const activites = new Map(depart.activites.map((a) => [a.id, { ...a }]));
  const activiteIdParNom = new Map<string, string>(
    [...activites.values()].map((a) => [normaliseNom(a.nom), a.id]),
  );
  const idsActivitesConnus = new Set(activites.keys());

  function activiteIdPour(nomActivite: string, dureePas: number): string {
    const cle = normaliseNom(nomActivite || 'activite');
    const existant = activiteIdParNom.get(cle);
    if (existant) {
      const a = activites.get(existant)!;
      if (a.dureePas !== dureePas) {
        problemes.push(
          avertissement(
            'import.activite',
            `/activites`,
            `"${a.nom}" a des durees differentes selon les creneaux (${a.dureePas} et ${dureePas} pas) ; ` +
              'la premiere rencontree est conservee',
          ),
        );
      }
      return existant;
    }
    const id = idUnique(nomActivite || 'activite', idsActivitesConnus);
    idsActivitesConnus.add(id);
    activiteIdParNom.set(cle, id);
    activites.set(id, {
      id,
      nom: nomActivite || '(sans nom)',
      dureePas,
      sallesPossibles: [],
      tagSalleRequis: null,
      capaciteJeunes: null,
      educateursRequis: null,
    });
    return id;
  }

  // --- 4. creneaux : ceux des jours importes remplacent les creneaux -------
  //        existants de CES jours-la, jamais fusionnes en douce ; les autres
  //        jours de la structure de depart ne bougent pas.
  const creneauxAutresJours = depart.planningType.filter((c) => !joursPresents.has(c.jour));
  const idsCreneauxConnus = new Set(depart.planningType.map((c) => c.id));
  const nouveauxCreneaux: CreneauType[] = [];

  for (const { creneau, jour } of creneauxResolus) {
    if (jour === null) continue; // groupe non resolu : deja signale plus haut

    const pas = Math.max(
      1,
      Math.round((heureEnMinutes(creneau.fin) - heureEnMinutes(creneau.debut)) / grille.pasMinutes),
    );
    const activiteId = activiteIdPour(creneau.activite, pas);

    const jeunesIds: string[] = [];
    const educateursIds: string[] = [];
    const affectations: Affectation[] = [];

    for (const binome of creneau.binomes) {
      const jeuneRefs = binome.jeunes
        .map((nom) => idParNom.get(normaliseNom(nom)))
        .filter((r): r is { id: string; cible: 'jeune' | 'educateur' } => !!r && r.cible === 'jeune');
      const educateurRefs = binome.educateurs
        .map((nom) => idParNom.get(normaliseNom(nom)))
        .filter((r): r is { id: string; cible: 'jeune' | 'educateur' } => !!r && r.cible === 'educateur');

      for (const jeuneRef of jeuneRefs) {
        if (!jeunesIds.includes(jeuneRef.id)) jeunesIds.push(jeuneRef.id);
        jeunes.get(jeuneRef.id)!.presence[jour] = plage;
        for (const educateurRef of educateurRefs) {
          if (!educateursIds.includes(educateurRef.id)) educateursIds.push(educateurRef.id);
          educateurs.get(educateurRef.id)!.disponibilites[jour] = plage;
          affectations.push({ jeuneId: jeuneRef.id, educateurId: educateurRef.id });
        }
      }
    }

    const id = idUnique(`${jour}-${creneau.debut}-${creneau.activite}`, idsCreneauxConnus);
    idsCreneauxConnus.add(id);

    if (jeunesIds.length === 0 && educateursIds.length === 0) {
      problemes.push(
        avertissement(
          'import.creneau',
          `/planningType`,
          `"${creneau.activite}" ${creneau.debut}–${creneau.fin} (${jour}) : aucun binome nomme, ` +
            'jeunes et educateurs a completer a la main',
        ),
      );
    }
    if (creneau.restes.length > 0) {
      problemes.push(
        avertissement(
          'import.reste',
          `/planningType`,
          `"${creneau.activite}" ${creneau.debut}–${creneau.fin} (${jour}) : lignes non comprises — ` +
            creneau.restes.join(' · '),
        ),
      );
    }
    if (creneau.finDeduite) {
      problemes.push(
        avertissement(
          'import.duree-incertaine',
          `/planningType`,
          `"${creneau.activite}" ${creneau.debut}–${creneau.fin} (${jour}) : ce couloir ne comporte plus ` +
            'rien ensuite, la fin a ete repliee sur le prochain creneau de la grille — duree reelle ' +
            'peut-etre plus longue, a verifier',
        ),
      );
    }

    nouveauxCreneaux.push({
      id,
      jour,
      debut: creneau.debut,
      pas,
      activiteId,
      salleId: null,
      jeunes: jeunesIds,
      educateurs: educateursIds,
      affectations,
      verrouille: false,
    });
  }

  return {
    structure: {
      meta: depart.meta,
      grille,
      salles: depart.salles,
      groupes: depart.groupes,
      jeunes: [...jeunes.values()],
      educateurs: [...educateurs.values()],
      activites: [...activites.values()],
      planningType: [...creneauxAutresJours, ...nouveauxCreneaux],
      regles: depart.regles,
    },
    problemes,
  };
}
