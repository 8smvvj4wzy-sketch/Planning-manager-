/**
 * Validation de coherence : tout ce qu'un JSON Schema ne sait pas dire.
 * Ids uniques, references croisees, alignement sur la grille, chevauchements,
 * capacites, et configuration des regles.
 */

import { Referentiel } from '../referentiel.ts';
import { evaluateurDe, typesConnus } from '../regles/registre.ts';
import { jourDeLaDate } from '../moteur/etatJour.ts';
import { heureEnMinutes } from '../temps.ts';
import type { FichierJour, Structure } from '../types.ts';
import { avertissement, erreur, type Probleme } from './resultat.ts';

function doublons(ids: readonly string[]): string[] {
  const vus = new Set<string>();
  const doubles = new Set<string>();
  for (const id of ids) {
    if (vus.has(id)) doubles.add(id);
    vus.add(id);
  }
  return [...doubles];
}

function verifieIdsUniques(structure: Structure): Probleme[] {
  const collections = [
    ['salles', structure.salles],
    ['groupes', structure.groupes],
    ['jeunes', structure.jeunes],
    ['educateurs', structure.educateurs],
    ['activites', structure.activites],
    ['planningType', structure.planningType],
    ['regles', structure.regles],
  ] as const;

  return collections.flatMap(([nom, liste]) =>
    doublons(liste.map((e) => e.id)).map((id) =>
      erreur('id.doublon', `/${nom}`, `identifiant en double : "${id}"`),
    ),
  );
}

function verifieGrille(ref: Referentiel): Probleme[] {
  const problemes: Probleme[] = [];
  const { grille } = ref.structure;

  if ((heureEnMinutes(grille.fin) - heureEnMinutes(grille.debut)) % grille.pasMinutes !== 0) {
    problemes.push(
      avertissement(
        'grille.alignement',
        '/grille',
        `la journee (${grille.debut}–${grille.fin}) n'est pas un multiple entier de ${grille.pasMinutes} min : le dernier fragment est ignore`,
      ),
    );
  }
  (grille.pauses ?? []).forEach((pause, i) => {
    if (!ref.grille.estAlignee(pause.debut)) {
      problemes.push(
        erreur('grille.pause', `/grille/pauses/${i}/debut`, `${pause.debut} ne tombe pas sur une frontiere de pas`),
      );
    }
  });
  return problemes;
}

function verifieReferences(ref: Referentiel): Probleme[] {
  const problemes: Probleme[] = [];
  const { structure } = ref;

  structure.jeunes.forEach((jeune, i) => {
    if (jeune.groupeId && !ref.groupes.has(jeune.groupeId)) {
      problemes.push(erreur('reference', `/jeunes/${i}/groupeId`, `groupe inconnu : "${jeune.groupeId}"`));
    }
    for (const [jour, plage] of Object.entries(jeune.presence)) {
      if (!structure.grille.jours.includes(jour as never)) {
        problemes.push(
          avertissement('presence.jour', `/jeunes/${i}/presence/${jour}`, `${jour} n'est pas un jour de la grille`),
        );
      }
      if (plage && heureEnMinutes(plage.fin) <= heureEnMinutes(plage.debut)) {
        problemes.push(erreur('presence.plage', `/jeunes/${i}/presence/${jour}`, 'fin anterieure ou egale au debut'));
      }
    }
  });

  structure.groupes.forEach((groupe, i) => {
    (groupe.refEducateurs ?? []).forEach((id, k) => {
      if (!ref.educateurs.has(id)) {
        problemes.push(erreur('reference', `/groupes/${i}/refEducateurs/${k}`, `educateur inconnu : "${id}"`));
      }
    });
  });

  structure.educateurs.forEach((educateur, i) => {
    for (const [jour, plage] of Object.entries(educateur.disponibilites)) {
      if (plage && heureEnMinutes(plage.fin) <= heureEnMinutes(plage.debut)) {
        problemes.push(
          erreur('disponibilite.plage', `/educateurs/${i}/disponibilites/${jour}`, 'fin anterieure ou egale au debut'),
        );
      }
    }
  });

  structure.activites.forEach((activite, i) => {
    (activite.sallesPossibles ?? []).forEach((id, k) => {
      if (!ref.salles.has(id)) {
        problemes.push(erreur('reference', `/activites/${i}/sallesPossibles/${k}`, `salle inconnue : "${id}"`));
      }
    });
    if (activite.tagSalleRequis && ref.sallesAvecTag(activite.tagSalleRequis).length === 0) {
      problemes.push(
        avertissement(
          'tag.inconnu',
          `/activites/${i}/tagSalleRequis`,
          `aucune salle ne porte le tag "${activite.tagSalleRequis}"`,
        ),
      );
    }
  });

  return problemes;
}

function verifiePlanningType(ref: Referentiel): Probleme[] {
  const problemes: Probleme[] = [];
  const { structure } = ref;

  structure.planningType.forEach((creneau, i) => {
    const base = `/planningType/${i}`;
    if (!structure.grille.jours.includes(creneau.jour)) {
      problemes.push(erreur('creneau.jour', `${base}/jour`, `${creneau.jour} n'est pas un jour de la grille`));
    }
    if (!ref.grille.estAlignee(creneau.debut)) {
      problemes.push(
        erreur('creneau.alignement', `${base}/debut`, `${creneau.debut} ne tombe pas sur une frontiere de pas`),
      );
    }
    const premier = ref.grille.pasDeHeure(creneau.debut);
    if (premier < 0 || premier + creneau.pas > ref.grille.nbPas) {
      problemes.push(
        erreur('creneau.hors-grille', base, `le creneau deborde de la grille (${structure.grille.debut}–${structure.grille.fin})`),
      );
    }

    const activite = ref.activite(creneau.activiteId);
    if (!activite) {
      problemes.push(erreur('reference', `${base}/activiteId`, `activite inconnue : "${creneau.activiteId}"`));
    } else {
      if (activite.dureePas !== creneau.pas) {
        problemes.push(
          avertissement(
            'creneau.duree',
            `${base}/pas`,
            `${creneau.pas} pas alors que l'activite "${activite.nom}" en declare ${activite.dureePas}`,
          ),
        );
      }
      if (typeof activite.capaciteJeunes === 'number' && creneau.jeunes.length > activite.capaciteJeunes) {
        problemes.push(
          erreur(
            'creneau.capacite',
            `${base}/jeunes`,
            `${creneau.jeunes.length} jeunes pour une capacite d'activite de ${activite.capaciteJeunes}`,
          ),
        );
      }
      if (creneau.salleId && (activite.sallesPossibles ?? []).length > 0 && !activite.sallesPossibles!.includes(creneau.salleId)) {
        problemes.push(
          erreur('creneau.salle', `${base}/salleId`, `salle "${creneau.salleId}" non prevue pour "${activite.nom}"`),
        );
      }
    }

    if (creneau.salleId) {
      const salle = ref.salle(creneau.salleId);
      if (!salle) {
        problemes.push(erreur('reference', `${base}/salleId`, `salle inconnue : "${creneau.salleId}"`));
      } else if (creneau.jeunes.length > salle.capacite) {
        problemes.push(
          erreur('creneau.capacite', `${base}/jeunes`, `${creneau.jeunes.length} jeunes pour une salle de ${salle.capacite}`),
        );
      }
    }

    creneau.jeunes.forEach((id, k) => {
      const jeune = ref.jeune(id);
      if (!jeune) {
        problemes.push(erreur('reference', `${base}/jeunes/${k}`, `jeune inconnu : "${id}"`));
        return;
      }
      const plage = jeune.presence[creneau.jour];
      const pas = ref.grille.pasDeCreneau(creneau.debut, creneau.pas);
      if (!plage || !pas.every((p) => ref.grille.plageCouvre(plage, p))) {
        problemes.push(
          avertissement(
            'creneau.presence',
            `${base}/jeunes/${k}`,
            `${jeune.initiales} n'est pas accueilli sur toute la duree du creneau`,
          ),
        );
      }
    });

    creneau.educateurs.forEach((id, k) => {
      const educateur = ref.educateur(id);
      if (!educateur) {
        problemes.push(erreur('reference', `${base}/educateurs/${k}`, `educateur inconnu : "${id}"`));
        return;
      }
      const plage = educateur.disponibilites[creneau.jour];
      const pas = ref.grille.pasDeCreneau(creneau.debut, creneau.pas);
      if (!plage || !pas.every((p) => ref.grille.plageCouvre(plage, p))) {
        problemes.push(
          avertissement(
            'creneau.disponibilite',
            `${base}/educateurs/${k}`,
            `${ref.libelleEducateur(id)} n'est pas disponible sur toute la duree du creneau`,
          ),
        );
      }
    });
  });

  return [...problemes, ...verifieChevauchements(ref)];
}

/** Un jeune, un educateur ou une salle ne peuvent pas etre a deux endroits a la fois. */
function verifieChevauchements(ref: Referentiel): Probleme[] {
  const problemes: Probleme[] = [];

  for (const jour of ref.structure.grille.jours) {
    const creneaux = ref.creneauxTypeDuJour(jour);
    const occupation = {
      jeunes: new Map<string, Map<number, string>>(),
      educateurs: new Map<string, Map<number, string>>(),
      salles: new Map<string, Map<number, string>>(),
    };

    for (const creneau of creneaux) {
      const index = ref.structure.planningType.indexOf(creneau);
      const pas = ref.grille.pasDeCreneau(creneau.debut, creneau.pas);
      const entrees: [keyof typeof occupation, string[], string][] = [
        ['jeunes', creneau.jeunes, 'jeune'],
        ['educateurs', creneau.educateurs, 'educateur'],
        ['salles', creneau.salleId ? [creneau.salleId] : [], 'salle'],
      ];

      for (const [table, ids, libelle] of entrees) {
        for (const id of ids) {
          const parPas = occupation[table].get(id) ?? new Map<number, string>();
          for (const p of pas) {
            const autre = parPas.get(p);
            if (autre && autre !== creneau.id) {
              problemes.push(
                erreur(
                  'creneau.chevauchement',
                  `/planningType/${index}`,
                  `${libelle} "${id}" est aussi sur "${autre}" a ${ref.grille.heureDePas(p)} (${jour})`,
                ),
              );
            } else {
              parPas.set(p, creneau.id);
            }
          }
          occupation[table].set(id, parPas);
        }
      }
    }
  }
  return problemes;
}

function verifieRegles(ref: Referentiel): Probleme[] {
  const problemes: Probleme[] = [];

  ref.structure.regles.forEach((regle, i) => {
    const evaluateur = evaluateurDe(regle.type);
    if (!evaluateur) {
      problemes.push(
        erreur(
          'regle.type',
          `/regles/${i}/type`,
          `type de regle inconnu : "${regle.type}" (connus : ${typesConnus().join(', ')})`,
        ),
      );
      return;
    }
    if (!regle.dure && regle.poids === undefined) {
      problemes.push(
        avertissement(
          'regle.poids',
          `/regles/${i}`,
          'regle souple sans "poids" : le poids par defaut du moteur sera applique',
        ),
      );
    }
    if (regle.dure && regle.poids !== undefined) {
      problemes.push(
        avertissement('regle.poids', `/regles/${i}/poids`, '"poids" est ignore sur une regle dure'),
      );
    }
    if (!regle.commentaire) {
      problemes.push(
        avertissement('regle.commentaire', `/regles/${i}`, 'regle sans commentaire : dans six mois, personne ne saura pourquoi'),
      );
    }
    problemes.push(...evaluateur.valide(regle, ref));
  });

  return problemes;
}

/** Toutes les verifications de coherence d'un `structure.json` deja valide en forme. */
export function verifieCoherenceStructure(structure: Structure): Probleme[] {
  const problemes = verifieIdsUniques(structure);
  let ref: Referentiel;
  try {
    ref = new Referentiel(structure);
  } catch (e) {
    problemes.push(erreur('grille', '/grille', e instanceof Error ? e.message : String(e)));
    return problemes;
  }
  return [
    ...problemes,
    ...verifieGrille(ref),
    ...verifieReferences(ref),
    ...verifiePlanningType(ref),
    ...verifieRegles(ref),
  ];
}

/** Coherence d'un `jour.json` face a la structure sur laquelle il est construit. */
export function verifieCoherenceJour(ref: Referentiel, fichier: FichierJour): Probleme[] {
  const problemes: Probleme[] = [];

  if (fichier.structureVersion !== ref.structure.meta.version) {
    problemes.push(
      erreur(
        'jour.version',
        '/structureVersion',
        `construit sur la structure v${fichier.structureVersion}, or la structure chargee est en v${ref.structure.meta.version}`,
      ),
    );
  }

  const jour = jourDeLaDate(fichier.date);
  if (!ref.structure.grille.jours.includes(jour)) {
    problemes.push(
      avertissement('jour.date', '/date', `${fichier.date} tombe un ${jour}, hors des jours de la grille`),
    );
  }

  fichier.absences.forEach((absence, i) => {
    const table = absence.type === 'jeune' ? ref.jeunes : ref.educateurs;
    if (!table.has(absence.id)) {
      problemes.push(erreur('reference', `/absences/${i}/id`, `${absence.type} inconnu : "${absence.id}"`));
    }
    if (absence.debut && absence.fin && heureEnMinutes(absence.fin) <= heureEnMinutes(absence.debut)) {
      problemes.push(erreur('absence.plage', `/absences/${i}`, 'fin anterieure ou egale au debut'));
    }
  });

  (fichier.renfortsDuJour ?? []).forEach((id, i) => {
    const educateur = ref.educateur(id);
    if (!educateur) {
      problemes.push(erreur('reference', `/renfortsDuJour/${i}`, `educateur inconnu : "${id}"`));
    } else if (educateur.statut !== 'renfort') {
      problemes.push(
        avertissement('renfort.statut', `/renfortsDuJour/${i}`, `${ref.libelleEducateur(id)} n'a pas le statut "renfort"`),
      );
    }
  });

  (fichier.epingles ?? []).forEach((id, i) => {
    if (!ref.creneauxType.has(id)) {
      problemes.push(erreur('reference', `/epingles/${i}`, `creneau inconnu dans le planning type : "${id}"`));
    }
  });

  return problemes;
}
