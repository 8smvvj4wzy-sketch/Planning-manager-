/**
 * Un descripteur peut mentir sur son evaluateur.
 *
 * `EvaluateurRegle.champs` et `.cibles` disent ce qu'un type de regle attend ;
 * `valide()` le verifie vraiment. Les deux vivent dans le meme fichier, mais
 * rien n'empeche l'un de deriver de l'autre au fil des modifications — et
 * l'interface, qui ne lit QUE le descripteur, proposerait alors un formulaire
 * qui produit des regles refusees a la validation.
 *
 * Ce test les tient synchronises, dans les deux sens et pour les douze types :
 *  - une regle batie depuis le descripteur passe `valide()` sans erreur ;
 *  - retirer un champ declare obligatoire la fait echouer ;
 *  - retirer les cibles la fait echouer ;
 *  - vider un groupe `auMoinsUn` la fait echouer.
 *
 * Ce qu'il ne couvre PAS : les contraintes que `valide()` n'exprime qu'en
 * avertissement (`quota_detachement` sans quota, `perimetre_renfort` sans
 * perimetre). Un avertissement n'est pas une exigence, et le descripteur ne
 * doit pas pretendre le contraire — c'est dit dans l'aide des champs.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  Referentiel,
  catalogue,
  type ChampRegle,
  type EvaluateurRegle,
  type Cibles,
  type Regle,
  type Structure,
} from '../src/index.ts';
import { structureMinimale } from './aide.ts';

/**
 * Assez de monde dans chaque table pour satisfaire n'importe quel `minimum`.
 * `structureMinimale` a deux jeunes, deux educateurs, deux salles, un groupe
 * et une activite : suffisant pour tous les types actuels.
 */
function terrain(): Structure {
  return structureMinimale();
}

function idsDe(structure: Structure, table: string, combien: number): string[] {
  const source = (structure as unknown as Record<string, { id: string }[]>)[table] ?? [];
  assert.ok(
    source.length >= combien,
    `le terrain de test n'a que ${source.length} entree(s) dans "${table}", il en faut ${combien}`,
  );
  return source.slice(0, combien).map((x) => x.id);
}

/** Une valeur plausible pour ce champ, deduite de sa seule declaration. */
function valeurPour(champ: ChampRegle, structure: Structure): unknown {
  switch (champ.forme) {
    case 'nombre':
      return champ.defaut ?? Math.max(champ.min ?? 1, 1);
    case 'ids':
      return idsDe(structure, champ.table, 1);
    case 'choix':
      return champ.defaut ?? champ.options[0];
    case 'heure':
      return champ.defaut ?? '09:00';
    case 'texte':
      // Volontairement quelconque : un tag inexistant ne produit qu'un
      // avertissement, jamais une erreur. Deviner « classe » ici ferait du
      // test une troisieme source de verite.
      return 'quelconque';
  }
}

function ciblesPour(evaluateur: EvaluateurRegle, structure: Structure, combien: number): Cibles {
  const premiere = evaluateur.cibles.cles[0]!;
  return combien === 0 ? {} : { [premiere]: idsDe(structure, premiere, combien) };
}

function regleDepuis(evaluateur: EvaluateurRegle, structure: Structure): Regle {
  const params: Record<string, unknown> = {};
  for (const champ of evaluateur.champs) params[champ.cle] = valeurPour(champ, structure);
  return {
    id: 'r-test',
    type: evaluateur.type,
    dure: evaluateur.dureParDefaut,
    actif: true,
    cibles: ciblesPour(evaluateur, structure, evaluateur.cibles.minimum),
    params,
  };
}

/** Erreurs rendues par `valide()` — les avertissements ne comptent pas. */
function erreursDe(evaluateur: EvaluateurRegle, regle: Regle, structure: Structure): string[] {
  const avec: Structure = { ...structure, regles: [regle] };
  return evaluateur
    .valide(regle, new Referentiel(avec))
    .filter((p) => p.gravite === 'erreur')
    .map((p) => `${p.code} ${p.chemin} — ${p.message}`);
}

describe('descripteurs de règles ↔ valide()', () => {
  for (const evaluateur of catalogue()) {
    describe(evaluateur.type, () => {
      it('accepte une règle bâtie depuis son descripteur', () => {
        const structure = terrain();
        const regle = regleDepuis(evaluateur, structure);
        assert.deepEqual(
          erreursDe(evaluateur, regle, structure),
          [],
          'le descripteur décrit une règle que la validation refuse',
        );
      });

      it('refuse une règle sans ses cibles', () => {
        const structure = terrain();
        const regle = { ...regleDepuis(evaluateur, structure), cibles: {} };
        assert.ok(
          erreursDe(evaluateur, regle, structure).length > 0,
          `cibles.minimum vaut ${evaluateur.cibles.minimum} mais valide() accepte une règle sans cible`,
        );
      });

      if (evaluateur.cibles.minimum > 1) {
        it(`refuse une règle avec moins de ${evaluateur.cibles.minimum} cibles`, () => {
          const structure = terrain();
          const regle = {
            ...regleDepuis(evaluateur, structure),
            cibles: ciblesPour(evaluateur, structure, evaluateur.cibles.minimum - 1),
          };
          assert.ok(erreursDe(evaluateur, regle, structure).length > 0);
        });
      }

      // Les deux sens. Sur-déclarer (obligatoire alors que `valide()` s'en
      // passe) fait tomber le premier ; sous-déclarer (facultatif alors que
      // `valide()` l'exige) fait tomber le second — et c'est le pire des deux :
      // le formulaire laisserait l'utilisateur produire une règle refusée.
      for (const champ of evaluateur.champs.filter((c) => c.obligatoire)) {
        it(`refuse une règle sans "${champ.cle}"`, () => {
          const structure = terrain();
          const regle = regleDepuis(evaluateur, structure);
          const params = { ...regle.params };
          delete params[champ.cle];
          assert.ok(
            erreursDe(evaluateur, { ...regle, params }, structure).length > 0,
            `"${champ.cle}" est déclaré obligatoire mais valide() s'en passe`,
          );
        });
      }

      for (const champ of evaluateur.champs.filter((c) => !c.obligatoire)) {
        it(`accepte une règle sans "${champ.cle}"`, () => {
          const structure = terrain();
          const regle = regleDepuis(evaluateur, structure);
          const params = { ...regle.params };
          delete params[champ.cle];
          assert.deepEqual(
            erreursDe(evaluateur, { ...regle, params }, structure),
            [],
            `"${champ.cle}" est déclaré facultatif mais valide() l'exige`,
          );
        });
      }

      if (evaluateur.auMoinsUn) {
        it(`refuse une règle sans aucun de ${evaluateur.auMoinsUn.join(', ')}`, () => {
          const structure = terrain();
          const regle = regleDepuis(evaluateur, structure);
          const params = { ...regle.params };
          for (const cle of evaluateur.auMoinsUn!) delete params[cle];
          assert.ok(erreursDe(evaluateur, { ...regle, params }, structure).length > 0);
        });
      }
    });
  }

  /**
   * Le trou que les tests ci-dessus ne voient pas.
   *
   * Un param FACULTATIF que `evalue()` lit mais que le descripteur ne declare
   * pas passe tout : `valide()` ne l'exige pas, donc « accepte une regle sans
   * lui » est vert — et l'interface ne l'expose jamais. Le parametre existe,
   * fonctionne, et reste inatteignable. C'est arrive a `fenetre`
   * (`rotation_educateur`), trouve a la main, pas par les tests.
   *
   * Ce controle-ci lit les sources. C'est un grep, avec ce que ca vaut : il ne
   * verrait pas une cle construite dynamiquement. Aucune ne l'est aujourd'hui,
   * et c'est le seul filet contre cette derive.
   */
  it('déclare tous les paramètres que le code lit vraiment', () => {
    const dossier = join(import.meta.dirname, '..', 'src', 'regles', 'catalogue');
    const lecture = /lit(?:Nombre|Texte|Liste)\(regle, '([a-zA-Z]+)'\)|regle\.params\?\.\['([a-zA-Z]+)'\]/g;

    for (const evaluateur of catalogue()) {
      const fichier = readdirSync(dossier).find((f) =>
        readFileSync(join(dossier, f), 'utf8').includes(`type: '${evaluateur.type}'`),
      );
      assert.ok(fichier, `aucun fichier de catalogue pour "${evaluateur.type}"`);
      const source = readFileSync(join(dossier, fichier), 'utf8');

      const lues = new Set<string>();
      for (const m of source.matchAll(lecture)) lues.add((m[1] ?? m[2])!);
      // `porte` ne se lit pas par sa clé mais par `litPorte`, et ne se déclare
      // pas par `cle:` mais par `champPorte` : les deux se répondent.
      if (source.includes('litPorte(')) {
        assert.ok(
          source.includes('champPorte('),
          `${evaluateur.type} lit "porte" sans déclarer champPorte()`,
        );
      }

      const declarees = new Set(evaluateur.champs.map((c) => c.cle));
      for (const cle of lues) {
        assert.ok(
          declarees.has(cle),
          `${evaluateur.type} lit le paramètre "${cle}" mais ne le déclare pas : l’interface ne l’exposera jamais`,
        );
      }
    }
  });

  it('décrit tous les types du registre, sans exception', () => {
    for (const evaluateur of catalogue()) {
      assert.ok(evaluateur.libelle.length > 0, `${evaluateur.type} : libellé vide`);
      assert.ok(evaluateur.resume.length > 0, `${evaluateur.type} : résumé vide`);
      assert.ok(evaluateur.cibles.cles.length > 0, `${evaluateur.type} : aucune clé de cible`);
      const cles = evaluateur.champs.map((c) => c.cle);
      assert.equal(new Set(cles).size, cles.length, `${evaluateur.type} : deux champs de même clé`);
      for (const cle of evaluateur.auMoinsUn ?? []) {
        assert.ok(cles.includes(cle), `${evaluateur.type} : "auMoinsUn" cite un champ absent`);
      }
    }
  });
});
