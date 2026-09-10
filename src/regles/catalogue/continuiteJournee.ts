/**
 * `continuite_journee` — limite le nombre de ruptures dans la journee d'un jeune.
 *
 * params :
 *   - `maxChangements` : nombre de ruptures tolerees ;
 *   - `sur` : "educateurs" (defaut), "salle" ou "activite" ;
 *   - `porte` : "binome" (defaut, sur la dimension "educateurs") = on compte les
 *     changements d'accompagnant nomme ; "presence" = ceux de l'equipe entiere.
 *
 * Defaut `binome` : la rupture que vit le jeune, c'est le changement de
 * referent, pas l'arrivee d'un adulte de plus dans la piece.
 *
 * Souple par defaut : chaque rupture au-dela du seuil coute un poids.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { erreur } from '../../validation/resultat.ts';
import { educateursSelonPorte } from '../../affectations.ts';
import type { Creneau } from '../../planning/planning.ts';
import type { PorteRegle } from '../../types.ts';
import {
  champPorte,
  chemin,
  exigeCibles,
  exigeNombre,
  exigePorteValide,
  litPorte,
  exigeReferences,
  faitViolation,
  litNombre,
  litTexte,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';

type Dimension = 'educateurs' | 'salle' | 'activite';

function empreinte(creneau: Creneau, sur: Dimension, jeuneId: string, porte: PorteRegle): string {
  if (sur === 'salle') return creneau.salleId ?? '—';
  if (sur === 'activite') return creneau.activiteId;
  return [...educateursSelonPorte(creneau, jeuneId, porte)].sort().join('+');
}

export const continuiteJournee: EvaluateurRegle = {
  type: 'continuite_journee',
  dureParDefaut: false,
  libelle: 'Continuité de la journée',
  resume: 'Limite le nombre de ruptures que ce jeune subit dans sa journée.',
  cibles: { cles: ['jeunes'], minimum: 1 },
  champs: [
    {
      cle: 'maxChangements',
      libelle: 'Changements tolérés',
      forme: 'nombre',
      min: 0,
      defaut: 2,
      obligatoire: true,
    },
    {
      cle: 'sur',
      libelle: 'Ruptures comptées sur',
      forme: 'choix',
      options: ['educateurs', 'salle', 'activite'],
      defaut: 'educateurs',
    },
    champPorte('binome'),
  ],

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const problemes = [
      ...exigeCibles(regle, ref, 'jeunes'),
      ...exigeNombre(regle, ref, 'maxChangements'),
      ...exigeReferences(regle, ref, regle.cibles.jeunes ?? [], 'jeunes', '/cibles/jeunes'),
    ];
    problemes.push(...exigePorteValide(regle, ref));
    const sur = litTexte(regle, 'sur');
    if (sur && !['educateurs', 'salle', 'activite'].includes(sur)) {
      problemes.push(erreur('regle.params', chemin(regle, ref, '/params/sur'), `dimension inconnue : "${sur}"`));
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const maximum = litNombre(regle, 'maxChangements');
    if (maximum === undefined) return [];
    const sur = (litTexte(regle, 'sur') ?? 'educateurs') as Dimension;
    const porte = litPorte(regle, 'binome');
    const violations: Violation[] = [];

    for (const jeuneId of regle.cibles.jeunes ?? []) {
      const journee = ctx.planning.journeeDuJeune(jeuneId);
      let changements = 0;
      for (let i = 1; i < journee.length; i++) {
        const precedent = journee[i - 1];
        const courant = journee[i];
        if (
          precedent &&
          courant &&
          empreinte(precedent, sur, jeuneId, porte) !== empreinte(courant, sur, jeuneId, porte)
        ) {
          changements++;
        }
      }
      if (changements > maximum) {
        violations.push(
          faitViolation(
            regle,
            ctx.options,
            `${ctx.ref.libelleJeune(jeuneId)} : ${changements} changements de ${sur} dans la journee (maximum ${maximum})`,
            { creneaux: journee.map((c) => c.id), jeunes: [jeuneId] },
            changements - maximum,
          ),
        );
      }
    }
    return violations;
  },
};
