/**
 * Fait le lien entre les noms lus dans un tableur et les identifiants du
 * moteur.
 *
 * Un CSV ne dit jamais `e1`, il dit un prenom. Cette couche ne devine rien de
 * definitif : elle propose une correspondance plausible pour chaque nom
 * rencontre, et c'est l'ecran qui la confirme ou la corrige avant que quoi que
 * ce soit ne soit charge.
 */

import type { Referentiel } from '../referentiel.ts';
import { idUnique, normaliseNom } from './identifiants.ts';

export type CibleCorrespondance = 'jeune' | 'educateur' | 'ignorer';

export interface Correspondance {
  /** Le nom exactement tel qu'il apparait dans le fichier source. */
  nom: string;
  cible: CibleCorrespondance;
  /** Id existant si `nom` correspond a quelqu'un de deja connu, sinon un id nouveau. */
  id: string;
  /** `true` si `id` designe quelqu'un deja present dans la structure. */
  existant: boolean;
}

/**
 * Cherche un jeune ou un educateur existant dont le nom affiche correspond,
 * a la casse et aux accents pres. Pour un educateur, compare au prenom seul
 * (le plus souvent ce que porte un planning manuscrit) puis a « prenom nom ».
 */
function cherche(ref: Referentiel, nom: string): { cible: CibleCorrespondance; id: string } | null {
  const cle = normaliseNom(nom);

  for (const jeune of ref.structure.jeunes) {
    if (normaliseNom(jeune.initiales) === cle) return { cible: 'jeune', id: jeune.id };
  }
  for (const educateur of ref.structure.educateurs) {
    if (educateur.prenom && normaliseNom(educateur.prenom) === cle) {
      return { cible: 'educateur', id: educateur.id };
    }
    if (normaliseNom(`${educateur.prenom ?? ''} ${educateur.nom}`.trim()) === cle) {
      return { cible: 'educateur', id: educateur.id };
    }
    if (normaliseNom(educateur.nom) === cle) return { cible: 'educateur', id: educateur.id };
  }
  return null;
}

/**
 * Propose une correspondance pour chaque nom. `ref` peut etre absent : sur la
 * toute premiere importation, rien n'existe encore et tout est propose comme
 * nouveau — en jeune pour les noms trouves cote jeunes du fichier, en
 * educateur pour l'autre liste. Ce sont des PROPOSITIONS ; rien n'est charge
 * tant que l'ecran ne les a pas validees.
 */
export function proposeCorrespondances(
  ref: Referentiel | null,
  noms: { jeunes: readonly string[]; educateurs: readonly string[] },
): Correspondance[] {
  const idsExistants = new Set<string>(
    ref ? [...ref.structure.jeunes, ...ref.structure.educateurs].map((p) => p.id) : [],
  );
  const idsProposes = new Set<string>();
  const resultat: Correspondance[] = [];

  const traite = (nom: string, defaut: CibleCorrespondance) => {
    if (resultat.some((c) => c.nom === nom)) return; // present dans les deux listes lues
    const trouve = ref ? cherche(ref, nom) : null;
    if (trouve) {
      resultat.push({ nom, cible: trouve.cible, id: trouve.id, existant: true });
      return;
    }
    const id = idUnique(nom, new Set([...idsExistants, ...idsProposes]));
    idsProposes.add(id);
    resultat.push({ nom, cible: defaut, id, existant: false });
  };

  for (const nom of noms.jeunes) traite(nom, 'jeune');
  for (const nom of noms.educateurs) traite(nom, 'educateur');

  return resultat;
}
