/**
 * Ce qu'on peut FAIRE d'un probleme de validation.
 *
 * Un planning importe arrive avec de vraies collisions : deux activites au meme
 * moment, quelqu'un affecte deux fois. Les signaler ne suffit pas — il faut
 * encore savoir par quel bout les prendre, et un chevauchement se resout de
 * plusieurs facons qui ne se valent pas.
 *
 * Ce module ne decide rien : il ENUMERE les issues, du moins destructeur au
 * plus, en disant ce que chacune emporte avec elle. C'est l'utilisateur qui
 * tranche. Rien ici ne s'appelle « corriger automatiquement » : le moteur ne
 * sait pas laquelle des deux activites compte, seul l'etablissement le sait.
 *
 * Aucune manipulation de structure en propre : tout passe par `src/edition.ts`,
 * qui maintient deja les invariants (binomes, references croisees).
 */

import { retireDuCreneau, supprimeCreneau, modifieCreneau, termineCreneauA } from './edition.ts';
import type { Referentiel } from './referentiel.ts';
import type { CreneauType, Structure } from './types.ts';
import type { Probleme } from './validation/resultat.ts';

export interface Correctif {
  /** Stable pour un meme probleme : sert de cle de rendu. */
  id: string;
  /** Ce qui va se passer, a l'imperatif. */
  libelle: string;
  /** Ce que ca emporte avec soi, ou pourquoi c'est la bonne issue. */
  explication: string;
  applique: (structure: Structure) => Structure;
}

/**
 * Le constat derriere un `creneau.chevauchement`, relu depuis `Probleme.cle`.
 *
 * La cle est posee par `verifieChevauchements` sous la forme
 * `table|personne|creneau|autre`. Les identifiants ne peuvent pas contenir de
 * `|` (le schema les restreint a `[A-Za-z0-9_-]`), le decoupage est donc sur.
 * Analyser le MESSAGE a la place serait fragile : il est fait pour etre lu.
 */
interface Collision {
  type: 'jeunes' | 'educateurs' | 'salles';
  personneId: string;
  /** Le creneau sur lequel le probleme est pointe. */
  creneau: CreneauType;
  /** L'autre, celui qui occupait deja la place. */
  autre: CreneauType;
}

function litCollision(ref: Referentiel, probleme: Probleme): Collision | null {
  if (probleme.code !== 'creneau.chevauchement' || !probleme.cle) return null;

  const [type, personneId, creneauId, autreId] = probleme.cle.split('|');
  if (type !== 'jeunes' && type !== 'educateurs' && type !== 'salles') return null;

  const creneau = ref.structure.planningType.find((c) => c.id === creneauId);
  const autre = ref.structure.planningType.find((c) => c.id === autreId);
  // Un correctif deja applique a pu faire disparaitre l'un des deux : la liste
  // est alors simplement vide, sans lever.
  if (!creneau || !autre || !personneId) return null;

  return { type, personneId, creneau, autre };
}

function decrit(ref: Referentiel, creneau: CreneauType): string {
  const nom = ref.activite(creneau.activiteId)?.nom ?? creneau.activiteId;
  return `« ${nom} » ${creneau.debut}`;
}

function nomme(ref: Referentiel, type: Collision['type'], id: string): string {
  if (type === 'jeunes') return ref.libelleJeune(id);
  if (type === 'educateurs') return ref.libelleEducateur(id);
  return (ref.salle(id)?.nom ?? id);
}

/** Qui d'autre part avec ce creneau, pour le dire avant de le supprimer. */
function emporteAvec(creneau: CreneauType): string {
  const gens = creneau.jeunes.length + creneau.educateurs.length;
  if (gens === 0) return 'il ne nomme personne';
  return `${creneau.jeunes.length} jeune(s) et ${creneau.educateurs.length} educateur(s) y sont nommes`;
}

/**
 * Les issues d'un probleme, du moins destructeur au plus.
 *
 * Rend une liste vide pour tout ce qui n'est pas un chevauchement : les autres
 * problemes se corrigent dans l'editeur, sans qu'un raccourci ait de sens.
 */
export function correctifsPour(ref: Referentiel, probleme: Probleme): Correctif[] {
  const collision = litCollision(ref, probleme);
  if (!collision) return [];

  const { type, personneId, creneau, autre } = collision;
  const qui = nomme(ref, type, personneId);
  const correctifs: Correctif[] = [];

  const debutCreneau = ref.grille.pasDeHeure(creneau.debut);
  const debutAutre = ref.grille.pasDeHeure(autre.debut);
  const [premier, second] = debutAutre <= debutCreneau ? [autre, creneau] : [creneau, autre];
  const debutDuSecond = ref.grille.heureDePas(Math.max(debutCreneau, debutAutre));

  /* 1. Raccourcir celui qui commence le plus tot : il deborde sur le suivant.
        C'est la correction la plus frequente d'un chevauchement venu d'un
        import, ou une cellule fusionnee a ete lue trop large. Sans decalage
        entre les deux debuts, il n'y a rien a raccourcir. */
  if (ref.grille.pasDeHeure(premier.debut) < ref.grille.pasDeHeure(second.debut)) {
    correctifs.push({
      id: `raccourcir-${premier.id}`,
      libelle: `Arreter ${decrit(ref, premier)} a ${debutDuSecond}`,
      explication: `Le creneau deborde sur ${decrit(ref, second)}. Le raccourcir ne retire personne.`,
      applique: (structure) => termineCreneauA(structure, premier.id, debutDuSecond),
    });
  }

  /* 2. Retirer la personne de l'un ou de l'autre. Pour une salle, c'est la
        liberer — il n'y a personne a retirer. */
  for (const cible of [creneau, autre]) {
    correctifs.push(
      type === 'salles'
        ? {
            id: `liberer-${cible.id}`,
            libelle: `Liberer la salle sur ${decrit(ref, cible)}`,
            explication: `${qui} reste occupee par l'autre creneau. Celui-ci se retrouve sans salle.`,
            applique: (structure) => modifieCreneau(structure, cible.id, { salleId: null }),
          }
        : {
            id: `retirer-${cible.id}`,
            libelle: `Retirer ${qui} de ${decrit(ref, cible)}`,
            explication:
              `${qui} reste sur ${decrit(ref, cible === creneau ? autre : creneau)}. ` +
              'Les binomes qui le ou la nomment partent avec.',
            applique: (structure) =>
              retireDuCreneau(structure, cible.id, {
                type: type === 'jeunes' ? 'jeune' : 'educateur',
                id: personneId,
              }),
          },
    );
  }

  /* 3. Supprimer l'un des deux. Le plus destructeur : on dit ce qu'il emporte. */
  for (const cible of [creneau, autre]) {
    correctifs.push({
      id: `supprimer-${cible.id}`,
      libelle: `Supprimer ${decrit(ref, cible)}`,
      explication: `Tout le creneau disparait — ${emporteAvec(cible)}.`,
      applique: (structure) => supprimeCreneau(structure, cible.id),
    });
  }

  return correctifs;
}
