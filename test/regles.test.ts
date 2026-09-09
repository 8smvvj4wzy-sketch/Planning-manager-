import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  Referentiel,
  etatJourNominal,
  evalue,
  evalueSemaine,
  optionsAvec,
  planningInitial,
  typesConnus,
  valideStructure,
  verifieCoherenceStructure,
  type Bilan,
  type Regle,
  type Structure,
} from '../src/index.ts';
import { structureMinimale } from './aide.ts';

function bilan(structure: Structure): Bilan {
  const ref = new Referentiel(structure);
  const etat = etatJourNominal('lundi');
  return evalue({ ref, planning: planningInitial(ref, etat), etat, options: optionsAvec() });
}

function violationsDe(structure: Structure, regleId: string): string[] {
  return bilan(structure)
    .violations.filter((v) => v.regleId === regleId)
    .map((v) => v.message);
}

function regle(partiel: Partial<Regle> & Pick<Regle, 'type' | 'cibles'>): Regle {
  return {
    id: 'x1',
    dure: true,
    actif: true,
    commentaire: 'test',
    ...partiel,
  } as Regle;
}

/** Ajoute un second creneau a 10:00, qui ne chevauche pas le premier. */
function avecSecondCreneau(structure: Structure, jeunes: string[], educateurs: string[]): Structure {
  structure.planningType.push({
    id: 'c2',
    jour: 'lundi',
    debut: '10:00',
    pas: 2,
    activiteId: 'act',
    salleId: 'sb',
    jeunes,
    educateurs,
    verrouille: false,
  });
  return structure;
}

describe('catalogue de regles', () => {
  it('couvre les douze types de la specification', () => {
    assert.deepEqual(typesConnus().sort(), [
      'binome_jeunes',
      'continuite_journee',
      'educateurs_autorises',
      'educateurs_interdits',
      'indisponibilite_recurrente',
      'jeunes_incompatibles',
      'perimetre_renfort',
      'presence_minimale',
      'quota_detachement',
      'rotation_educateur',
      'salle_requise',
      'taux_encadrement',
    ]);
  });
});

describe('educateurs_autorises', () => {
  it('signale un educateur hors liste', () => {
    const s = structureMinimale();
    s.regles.push(regle({ type: 'educateurs_autorises', cibles: { jeunes: ['ja'] }, params: { educateurs: ['eb'] } }));
    assert.equal(violationsDe(s, 'x1').length, 1);
  });

  it('ne dit rien quand la liste est respectee', () => {
    const s = structureMinimale();
    s.regles.push(regle({ type: 'educateurs_autorises', cibles: { jeunes: ['ja'] }, params: { educateurs: ['ea'] } }));
    assert.equal(violationsDe(s, 'x1').length, 0);
  });

  it('en mode "au-moins-un", tolere un accompagnant supplementaire', () => {
    const s = structureMinimale();
    s.planningType[0]!.educateurs = ['ea', 'eb'];
    s.regles.push(
      regle({
        type: 'educateurs_autorises',
        cibles: { jeunes: ['ja'] },
        params: { educateurs: ['ea'], mode: 'au-moins-un' },
      }),
    );
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('educateurs_interdits', () => {
  it('signale un educateur de la liste noire', () => {
    const s = structureMinimale();
    s.regles.push(regle({ type: 'educateurs_interdits', cibles: { jeunes: ['ja'] }, params: { educateurs: ['ea'] } }));
    assert.equal(violationsDe(s, 'x1').length, 1);
  });
});

describe('binome_jeunes', () => {
  it('signale un binome separe', () => {
    const s = avecSecondCreneau(structureMinimale(), ['jb'], ['eb']);
    s.planningType[1]!.debut = '09:00';
    s.planningType[1]!.salleId = 'sb';
    s.regles.push(
      regle({ type: 'binome_jeunes', dure: false, poids: 60, cibles: { jeunes: ['ja', 'jb'] }, params: { educateursRequis: 1 } }),
    );
    assert.equal(violationsDe(s, 'x1').length, 2); // un par pas
  });

  it('ne dit rien quand le binome est ensemble', () => {
    const s = structureMinimale();
    s.planningType[0]!.jeunes = ['ja', 'jb'];
    s.regles.push(
      regle({ type: 'binome_jeunes', dure: false, poids: 60, cibles: { jeunes: ['ja', 'jb'] }, params: { educateursRequis: 1 } }),
    );
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('jeunes_incompatibles', () => {
  it('signale deux jeunes sur le meme creneau', () => {
    const s = structureMinimale();
    s.planningType[0]!.jeunes = ['ja', 'jb'];
    s.regles.push(regle({ type: 'jeunes_incompatibles', cibles: { jeunes: ['ja', 'jb'] } }));
    assert.equal(violationsDe(s, 'x1').length, 1);
  });
});

describe('rotation_educateur', () => {
  it('signale une sequence trop longue avec le meme educateur', () => {
    const s = structureMinimale();
    s.regles.push(
      regle({ type: 'rotation_educateur', dure: false, poids: 80, cibles: { jeunes: ['ja'] }, params: { tousLesPas: 1 } }),
    );
    assert.equal(violationsDe(s, 'x1').length, 1);
  });

  it('tolere une sequence a la limite', () => {
    const s = structureMinimale();
    s.regles.push(
      regle({ type: 'rotation_educateur', dure: false, poids: 80, cibles: { jeunes: ['ja'] }, params: { tousLesPas: 2 } }),
    );
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('quota_detachement', () => {
  function structureAvecDetachement(): Structure {
    const s = structureMinimale();
    s.groupes.push({ id: 'gb', nom: 'Groupe B', refEducateurs: ['eb'] });
    s.jeunes[1]!.groupeId = 'gb';
    return avecSecondCreneau(s, ['jb'], ['ea']); // ea sort de son groupe de reference
  }

  it('signale un depassement du quota journalier', () => {
    const s = structureAvecDetachement();
    s.regles.push(regle({ type: 'quota_detachement', cibles: { educateurs: ['ea'] }, params: { maxPasParJour: 1 } }));
    assert.equal(violationsDe(s, 'x1').length, 1);
  });

  it('ne dit rien sous le quota', () => {
    const s = structureAvecDetachement();
    s.regles.push(regle({ type: 'quota_detachement', cibles: { educateurs: ['ea'] }, params: { maxPasParJour: 2 } }));
    assert.equal(violationsDe(s, 'x1').length, 0);
  });

  it('verifie le quota hebdomadaire sur l ensemble de la semaine', () => {
    const s = structureAvecDetachement();
    s.regles.push(regle({ type: 'quota_detachement', cibles: { educateurs: ['ea'] }, params: { maxPasParSemaine: 1 } }));
    const ref = new Referentiel(s);
    const etat = etatJourNominal('lundi');
    const violations = evalueSemaine({ ref, etat, options: optionsAvec() }, [planningInitial(ref, etat)]);
    assert.equal(violations.length, 1);
    assert.match(violations[0]!.message, /semaine/);
  });
});

describe('perimetre_renfort', () => {
  it('signale une intervention hors perimetre', () => {
    const s = avecSecondCreneau(structureMinimale(), ['ja'], ['eb']);
    s.regles.push(
      regle({ type: 'perimetre_renfort', cibles: { educateurs: ['eb'] }, params: { jeunesAutorises: ['jb'] } }),
    );
    assert.equal(violationsDe(s, 'x1').length, 1);
  });

  it('restreint aussi par activite', () => {
    const s = avecSecondCreneau(structureMinimale(), ['jb'], ['eb']);
    s.regles.push(
      regle({
        type: 'perimetre_renfort',
        cibles: { educateurs: ['eb'] },
        params: { jeunesAutorises: ['jb'], activitesAutorisees: [] },
      }),
    );
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('taux_encadrement', () => {
  it('signale un ratio depasse', () => {
    const s = structureMinimale();
    s.planningType[0]!.jeunes = ['ja', 'jb'];
    s.regles.push(regle({ type: 'taux_encadrement', cibles: { groupes: ['ga'] }, params: { ratioJeunesParEduc: 1 } }));
    assert.equal(violationsDe(s, 'x1').length, 1);
  });
});

describe('salle_requise', () => {
  it('signale une salle sans le tag requis', () => {
    const s = structureMinimale();
    s.regles.push(regle({ type: 'salle_requise', cibles: { activites: ['act'] }, params: { tag: 'sensoriel' } }));
    assert.equal(violationsDe(s, 'x1').length, 1);
  });

  it('accepte une salle portant le tag', () => {
    const s = structureMinimale();
    s.planningType[0]!.salleId = 'sb';
    s.regles.push(regle({ type: 'salle_requise', cibles: { activites: ['act'] }, params: { tag: 'sensoriel' } }));
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('continuite_journee', () => {
  it('compte les changements d equipe dans la journee', () => {
    const s = avecSecondCreneau(structureMinimale(), ['ja'], ['eb']);
    s.regles.push(
      regle({ type: 'continuite_journee', dure: false, poids: 30, cibles: { jeunes: ['ja'] }, params: { maxChangements: 0 } }),
    );
    assert.equal(violationsDe(s, 'x1').length, 1);
  });
});

describe('presence_minimale', () => {
  it('signale un groupe sous-encadre a un instant donne', () => {
    const s = structureMinimale();
    s.regles.push(regle({ type: 'presence_minimale', cibles: { groupes: ['ga'] }, params: { educMin: 2 } }));
    // 6 pas dans la journee : 1 educateur sur les deux premiers, aucun ensuite.
    assert.equal(violationsDe(s, 'x1').length, 6);
  });
});

describe('indisponibilite_recurrente', () => {
  it('signale une affectation pendant une indisponibilite', () => {
    const s = structureMinimale();
    s.regles.push(
      regle({
        type: 'indisponibilite_recurrente',
        cibles: { educateurs: ['ea'] },
        params: { jour: 'lundi', debut: '09:00', fin: '10:00' },
      }),
    );
    assert.equal(violationsDe(s, 'x1').length, 1);
  });

  it('ignore un autre jour', () => {
    const s = structureMinimale();
    s.regles.push(
      regle({
        type: 'indisponibilite_recurrente',
        cibles: { educateurs: ['ea'] },
        params: { jour: 'mardi', debut: '09:00', fin: '10:00' },
      }),
    );
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('regles inactives', () => {
  it('ne sont pas evaluees', () => {
    const s = structureMinimale();
    s.regles.push(
      regle({ type: 'educateurs_interdits', actif: false, cibles: { jeunes: ['ja'] }, params: { educateurs: ['ea'] } }),
    );
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('cout des violations', () => {
  it('une regle dure coute infiniment plus qu une regle souple', () => {
    const s = structureMinimale();
    s.regles.push(regle({ type: 'educateurs_interdits', cibles: { jeunes: ['ja'] }, params: { educateurs: ['ea'] } }));
    const dur = bilan(s);
    assert.equal(dur.admissible, false);

    const s2 = structureMinimale();
    s2.regles.push(
      regle({ type: 'educateurs_interdits', dure: false, poids: 10, cibles: { jeunes: ['ja'] }, params: { educateurs: ['ea'] } }),
    );
    const souple = bilan(s2);
    assert.equal(souple.admissible, true);
    assert.ok(dur.cout > souple.cout * 1000);
  });
});

/* ==================== Portée des règles ====================
   `porte` décide si une règle se juge sur la présence dans le créneau ou sur le
   binôme nommé. Les défauts ne sont pas symétriques, et c'est le point : une
   autorisation gagne en justesse avec la paire, une interdiction ne se relâche
   pas parce que la donnée s'affine. */

/** Créneau `c1` où deux éducateurs sont présents mais un seul est le référent. */
function structureAppariee(): Structure {
  const s = structureMinimale();
  s.planningType[0]!.educateurs = ['ea', 'eb'];
  s.planningType[0]!.affectations = [{ jeuneId: 'ja', educateurId: 'ea' }];
  return s;
}

describe('porte : educateurs_autorises', () => {
  it('par défaut, ne regarde que le référent nommé', () => {
    const s = structureAppariee();
    s.regles.push(regle({ type: 'educateurs_autorises', cibles: { jeunes: ['ja'] }, params: { educateurs: ['ea'] } }));
    assert.equal(violationsDe(s, 'x1').length, 0, 'eb est présent mais n’accompagne pas ja');
  });

  it('en portée présence, l’éducateur non autorisé redevient un intrus', () => {
    const s = structureAppariee();
    s.regles.push(
      regle({
        type: 'educateurs_autorises',
        cibles: { jeunes: ['ja'] },
        params: { educateurs: ['ea'], porte: 'presence' },
      }),
    );
    assert.equal(violationsDe(s, 'x1').length, 1);
  });

  it('sans binôme nommé, les deux portées disent la même chose', () => {
    for (const porte of ['binome', 'presence'] as const) {
      const s = structureMinimale();
      s.planningType[0]!.educateurs = ['ea', 'eb'];
      s.regles.push(
        regle({ type: 'educateurs_autorises', cibles: { jeunes: ['ja'] }, params: { educateurs: ['ea'], porte } }),
      );
      assert.equal(violationsDe(s, 'x1').length, 1, `porte ${porte}`);
    }
  });
});

describe('porte : educateurs_interdits', () => {
  it('par défaut, mord sur la présence — même sans être le référent', () => {
    const s = structureAppariee();
    s.regles.push(regle({ type: 'educateurs_interdits', cibles: { jeunes: ['ja'] }, params: { educateurs: ['eb'] } }));
    assert.equal(violationsDe(s, 'x1').length, 1, 'eb est dans la pièce, l’interdiction tient');
  });

  it('en portée binôme, ne mord que sur le référent', () => {
    const s = structureAppariee();
    s.regles.push(
      regle({
        type: 'educateurs_interdits',
        cibles: { jeunes: ['ja'] },
        params: { educateurs: ['eb'], porte: 'binome' },
      }),
    );
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('porte : perimetre_renfort', () => {
  it('par défaut, compte tous les jeunes du créneau', () => {
    const s = structureAppariee();
    s.planningType[0]!.jeunes = ['ja', 'jb'];
    s.planningType[0]!.affectations = [
      { jeuneId: 'ja', educateurId: 'ea' },
      { jeuneId: 'jb', educateurId: 'eb' },
    ];
    s.regles.push(
      regle({ type: 'perimetre_renfort', cibles: { educateurs: ['eb'] }, params: { jeunesAutorises: ['jb'] } }),
    );
    assert.equal(violationsDe(s, 'x1').length, 1, 'ja est là, hors périmètre de eb');
  });

  it('en portée binôme, ne compte que les jeunes confiés', () => {
    const s = structureAppariee();
    s.planningType[0]!.jeunes = ['ja', 'jb'];
    s.planningType[0]!.affectations = [
      { jeuneId: 'ja', educateurId: 'ea' },
      { jeuneId: 'jb', educateurId: 'eb' },
    ];
    s.regles.push(
      regle({
        type: 'perimetre_renfort',
        cibles: { educateurs: ['eb'] },
        params: { jeunesAutorises: ['jb'], porte: 'binome' },
      }),
    );
    assert.equal(violationsDe(s, 'x1').length, 0);
  });
});

describe('porte : rotation_educateur', () => {
  it('suit l’accompagnant nommé, pas l’équipe entière', () => {
    const s = structureAppariee();
    // ea accompagne ja sur les deux pas du créneau : séquence de 2 > tousLesPas 1.
    s.regles.push(
      regle({ type: 'rotation_educateur', dure: false, poids: 80, cibles: { jeunes: ['ja'] }, params: { tousLesPas: 1 } }),
    );
    const messages = violationsDe(s, 'x1');
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /Aa/, 'la violation nomme le référent, pas l’éducateur en appui');
  });
});

describe('porte invalide', () => {
  function structureAvecPorteInvalide(): Structure {
    const s = structureAppariee();
    s.regles.push(
      regle({
        type: 'educateurs_autorises',
        cibles: { jeunes: ['ja'] },
        params: { educateurs: ['ea'], porte: 'peut-être' },
      }),
    );
    return s;
  }

  it('est refusée par le schéma, qui est la première barrière', () => {
    const resultat = valideStructure(structureAvecPorteInvalide());
    assert.equal(resultat.valide, false);
    assert.ok(resultat.problemes.some((p) => p.code === 'schema.enum'));
  });

  it('est aussi refusée par la cohérence, pour qui construit une structure sans passer par le schéma', () => {
    // La validation s'arrête au schéma quand il échoue : ce second filet ne se
    // voit qu'en appelant la couche de cohérence directement, ce que fait tout
    // code qui fabrique une structure en mémoire.
    const problemes = verifieCoherenceStructure(structureAvecPorteInvalide());
    assert.ok(problemes.some((p) => p.code === 'regle.porte'));
  });
});
