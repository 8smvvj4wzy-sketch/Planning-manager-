/**
 * Assemble une lecture de tableur (`PlanningLu`) et des correspondances
 * validees en une `Structure` exploitable.
 *
 * Un seul chemin sert les deux usages demandes :
 *   - COMPLETER la semaine : `base` est la structure chargee, le jour importe
 *     vient s'y ajouter (ou remplacer ses propres creneaux, s'il y en avait
 *     deja pour ce jour) ;
 *   - REMPLACER le fichier : `base` est absent, tout repart de zero avec ce
 *     seul jour.
 *
 * Ce module ne decide de rien tout seul : il applique les correspondances que
 * l'ecran a fait confirmer, et it signale largement (`problemes`) tout ce
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
import type { PlanningLu } from './tableur.ts';

export interface MetaDepart {
  auteur: string;
  etablissement: string;
  libelle?: string;
}

export interface OptionsAssemblage {
  /** Structure a completer. Absente = on repart de zero avec ce seul jour. */
  base?: Structure;
  jour: Jour;
  correspondances: readonly Correspondance[];
  /** Utilise seulement quand `base` est absent : il faut bien un auteur. */
  metaDepart?: MetaDepart;
}

export interface ResultatAssemblage {
  structure: Structure;
  problemes: Probleme[];
}

function structureVide(meta: MetaDepart): Structure {
  return {
    meta: {
      version: 1,
      dateModification: new Date().toISOString().slice(0, 10),
      auteur: meta.auteur,
      etablissement: meta.etablissement,
      ...(meta.libelle ? { libelle: meta.libelle } : {}),
    },
    grille: { pasMinutes: 30, jours: [], debut: '09:00', fin: '17:00', pauses: [] },
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

/** Etend une grille pour couvrir de nouvelles bornes, sans jamais la retrecir. */
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

export function assemble(planningLu: PlanningLu, options: OptionsAssemblage): ResultatAssemblage {
  const problemes: Probleme[] = [];
  const { jour, correspondances } = options;

  const depart =
    options.base ?? structureVide(options.metaDepart ?? { auteur: '', etablissement: '' });
  if (!options.base && (!options.metaDepart?.auteur || !options.metaDepart.etablissement)) {
    problemes.push(
      avertissement(
        'import.meta',
        '/meta',
        'auteur et etablissement sont vides : a completer avant l’export, le schema les exige',
      ),
    );
  }

  // --- 1. la grille couvre-t-elle deja ce jour et ces heures ? -------------
  const { grille, elargie } = elargieGrille(depart.grille, jour, planningLu.debut, planningLu.fin);
  if (elargie) {
    problemes.push(
      avertissement(
        'import.grille',
        '/grille',
        `la grille a ete elargie pour couvrir ${jour} ${planningLu.debut}–${planningLu.fin}`,
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
  //        les autres sont crees avec des defauts prudents.
  const jeunes = new Map(depart.jeunes.map((j) => [j.id, { ...j, presence: { ...j.presence } }]));
  const educateurs = new Map(
    depart.educateurs.map((e) => [e.id, { ...e, disponibilites: { ...e.disponibilites } }]),
  );
  const plage = plageDuJour(planningLu.debut, planningLu.fin);
  const idParNom = new Map<string, { id: string; cible: 'jeune' | 'educateur' }>();

  for (const c of correspondances) {
    if (c.cible === 'ignorer') continue;
    idParNom.set(normaliseNom(c.nom), { id: c.id, cible: c.cible });

    if (c.cible === 'jeune') {
      const existant = jeunes.get(c.id);
      if (existant) {
        existant.presence[jour] = plage;
      } else {
        const nouveau: Jeune = {
          id: c.id,
          initiales: c.nom,
          encadrement: 1,
          presence: { [jour]: plage },
          actif: true,
        };
        jeunes.set(c.id, nouveau);
        problemes.push(
          avertissement('import.jeune', `/jeunes`, `nouveau jeune cree depuis le fichier : "${c.nom}"`),
        );
      }
    } else {
      const existant = educateurs.get(c.id);
      if (existant) {
        existant.disponibilites[jour] = plage;
      } else {
        const nouveau: Educateur = {
          id: c.id,
          nom: c.nom,
          statut: 'titulaire',
          disponibilites: { [jour]: plage },
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

  // --- 4. creneaux du jour : ceux qui existaient deja pour ce jour ---------
  //        sont remplaces, jamais fusionnes en douce.
  const creneauxAutresJours = depart.planningType.filter((c) => c.jour !== jour);
  const idsCreneauxConnus = new Set(depart.planningType.map((c) => c.id));
  const nouveauxCreneaux: CreneauType[] = [];

  for (const creneau of planningLu.creneaux) {
    const pas = Math.max(
      1,
      Math.round((heureEnMinutes(creneau.fin) - heureEnMinutes(creneau.debut)) / grille.pasMinutes),
    );
    const activiteId = activiteIdPour(creneau.activite, pas);

    const jeunesIds: string[] = [];
    const educateursIds: string[] = [];
    const affectations: Affectation[] = [];

    for (const binome of creneau.binomes) {
      const jeuneRef = idParNom.get(normaliseNom(binome.jeune));
      if (!jeuneRef || jeuneRef.cible !== 'jeune') continue; // ignore ou mal classe : on ne l'invente pas
      if (!jeunesIds.includes(jeuneRef.id)) jeunesIds.push(jeuneRef.id);
      for (const nomEducateur of binome.educateurs) {
        const educateurRef = idParNom.get(normaliseNom(nomEducateur));
        if (!educateurRef || educateurRef.cible !== 'educateur') continue;
        if (!educateursIds.includes(educateurRef.id)) educateursIds.push(educateurRef.id);
        affectations.push({ jeuneId: jeuneRef.id, educateurId: educateurRef.id });
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
