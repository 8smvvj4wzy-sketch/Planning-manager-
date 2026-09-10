/**
 * `educateurs_autorises` — ce jeune ne peut etre encadre que par ces educateurs.
 *
 * params :
 *   - `educateurs` : liste blanche (obligatoire)
 *   - `mode` : "exclusif" (defaut) = tout educateur aupres du jeune doit figurer
 *              dans la liste ; "au-moins-un" = il suffit que l'un d'eux y soit.
 *   - `porte` : "binome" (defaut) = on ne regarde que les educateurs nommes
 *               aupres du jeune ; "presence" = tous ceux du creneau.
 *
 * Le defaut `binome` est deliberé : une autorisation gagne en justesse des
 * qu'on sait qui accompagne. En `presence`, « L.M. uniquement avec Marie ou
 * Karim » lui interdit toute activite collective a trois adultes.
 */

import type { Regle } from '../../types.ts';
import type { Referentiel } from '../../referentiel.ts';
import type { Probleme } from '../../validation/resultat.ts';
import { educateursSelonPorte } from '../../affectations.ts';
import {
  champPorte,
  chemin,
  exigeCibles,
  exigePorteValide,
  litPorte,
  exigeReferences,
  faitViolation,
  litListe,
  litTexte,
  type ContexteEvaluation,
  type EvaluateurRegle,
  type Violation,
} from '../base.ts';
import { erreur } from '../../validation/resultat.ts';

export const educateursAutorises: EvaluateurRegle = {
  type: 'educateurs_autorises',
  dureParDefaut: true,
  libelle: 'Éducateurs autorisés',
  resume: 'Ce jeune ne peut être encadré que par les éducateurs de cette liste.',
  cibles: { cles: ['jeunes'], minimum: 1 },
  champs: [
    {
      cle: 'educateurs',
      libelle: 'Éducateurs autorisés',
      forme: 'ids',
      table: 'educateurs',
      obligatoire: true,
    },
    {
      cle: 'mode',
      libelle: 'Mode',
      forme: 'choix',
      options: ['exclusif', 'au-moins-un'],
      defaut: 'exclusif',
      aide: '« exclusif » : aucun autre éducateur. « au-moins-un » : il suffit que l’un d’eux soit là.',
    },
    champPorte('binome'),
  ],

  valide(regle: Regle, ref: Referentiel): Probleme[] {
    const problemes = exigeCibles(regle, ref, 'jeunes');
    const educateurs = litListe(regle, 'educateurs');
    if (educateurs.length === 0) {
      problemes.push(
        erreur('regle.params', chemin(regle, ref, '/params/educateurs'), 'liste "educateurs" vide ou absente'),
      );
    }
    problemes.push(...exigeReferences(regle, ref, educateurs, 'educateurs', '/params/educateurs'));
    problemes.push(...exigeReferences(regle, ref, regle.cibles.jeunes ?? [], 'jeunes', '/cibles/jeunes'));
    problemes.push(...exigePorteValide(regle, ref));
    const mode = litTexte(regle, 'mode');
    if (mode && mode !== 'exclusif' && mode !== 'au-moins-un') {
      problemes.push(
        erreur('regle.params', chemin(regle, ref, '/params/mode'), `mode inconnu : "${mode}"`),
      );
    }
    return problemes;
  },

  evalue(regle: Regle, ctx: ContexteEvaluation): Violation[] {
    const autorises = new Set(litListe(regle, 'educateurs'));
    const exclusif = (litTexte(regle, 'mode') ?? 'exclusif') === 'exclusif';
    const porte = litPorte(regle, 'binome');
    const violations: Violation[] = [];

    for (const jeuneId of regle.cibles.jeunes ?? []) {
      for (const creneau of ctx.planning.creneauxDeJeune(jeuneId)) {
        const aupres = educateursSelonPorte(creneau, jeuneId, porte);
        if (exclusif) {
          const intrus = aupres.filter((e) => !autorises.has(e));
          if (intrus.length > 0) {
            violations.push(
              faitViolation(
                regle,
                ctx.options,
                `${ctx.ref.libelleJeune(jeuneId)} est encadre par ${intrus
                  .map((e) => ctx.ref.libelleEducateur(e))
                  .join(', ')}, hors liste autorisee`,
                { creneaux: [creneau.id], jeunes: [jeuneId], educateurs: intrus },
                intrus.length,
              ),
            );
          }
        } else if (aupres.length > 0 && !aupres.some((e) => autorises.has(e))) {
          violations.push(
            faitViolation(
              regle,
              ctx.options,
              `aucun educateur autorise aupres de ${ctx.ref.libelleJeune(jeuneId)}`,
              { creneaux: [creneau.id], jeunes: [jeuneId], educateurs: aupres },
            ),
          );
        }
      }
    }
    return violations;
  },
};
