// Implémente la section 3 (T-STATS-001 à T-STATS-022) de tests/E2E_TEST_PLAN.md — onglet
// Statistiques (tab-stats.hbs) : jets de dés, repos, Initiative, états/Exhaustion, Agonie et
// jets de sauvegarde de la mort. Section la plus volumineuse du plan et la première à avoir
// besoin de contrôler un résultat de dé précis (jets de sauvegarde de la mort) — cf. cy.forceD20
// (cypress/support/e2e.js) plutôt que de répéter le clic jusqu'à observer chaque cas par hasard
// (les deux approches sont explicitement autorisées par le plan, la première est fiable, pas la
// seconde).
//
// Vérification des jets d'avantage/désavantage (T-STATS-002/003/005/006/017) : par la FORMULE du
// jet posté en chat (`2d20kh1`/`2d20kl1` vs `1d20`, cf. scripts/helpers/rolls.js), pas par son
// résultat — inutile de contrôler le dé pour ça, la formule suffit à prouver que le bon mécanisme
// s'est déclenché.
//
// Personnage partagé (fighter, comme dans character-sheet.cy.js) pour la plupart des scénarios ;
// personnages dédiés pour ceux qui ont besoin d'une classe précise (Barde pour T-STATS-007,
// Occultiste pour T-STATS-010, un lanceur de sorts quelconque pour T-STATS-011) ou d'un état de
// mort/agonie isolé (T-STATS-018 à 022, pour ne pas faire dépendre leurs préconditions HP/mort de
// l'ordre d'exécution des autres scénarios de ce fichier).

const createdActorIds = [];
const createdCombatIds = [];
let sharedActorId;

// Reproduit les formules de scripts/helpers/rules.js (déjà couvertes par tests/unit/rules.test.js)
// pour calculer côté spec le résultat ATTENDU d'un jet, plutôt que de dépendre d'un nombre en dur
// qui casserait si les caractéristiques du personnage de fixture changent.
function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}
function proficiencyBonusFor(level) {
  return Math.ceil(level / 4) + 1;
}
function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function sheetRoot() {
  return cy.get(".application.character");
}

function updateActor(win, actor, data) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)));
}

// Lit le dernier message de chat posté (le jet qui vient d'être déclenché) : `rolls[0]` porte la
// formule réellement évaluée par Foundry, la preuve la plus directe qu'avantage/désavantage a été
// appliqué — pas besoin de parser le rendu HTML de la carte de jet. `formula` est renvoyée sans
// espaces (Foundry sérialise "1d20+2" en "1d20 + 2") pour rester comparable telle quelle à une
// chaîne construite via formatModifier ci-dessus.
//
// `cy.window().should(...)` (pas un simple `.then()`) : le clic qui déclenche le jet ne fait que
// distribuer l'évènement DOM, la promesse du gestionnaire (rollCheck -> roll.evaluate() ->
// roll.toMessage()) continue de tourner après que la commande `.click()` de Cypress s'est
// terminée — lire `game.messages` immédiatement pouvait tomber avant que le message n'existe
// encore (formule vide, flake découvert au 5e run réel de cette spec, 2026-08-15).
//
// Vérifier juste "un message avec une formule existe" ne suffit PAS : lancé en tout début de
// fichier (T-STATS-001), ça peut retomber sur le tout DERNIER message d'une AUTRE spec exécutée
// juste avant dans la même session (`npm run test:e2e:run` partage le même monde entre toutes
// les specs, cf. tests/README.md) — flake découvert sur un run combiné, 2026-08-15.
// `knownMessageCount` (mis à jour par resetMessageBaseline() dans chaque beforeEach concerné,
// puis après chaque lecture ici) garantit qu'on attend un message réellement NOUVEAU.
let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function lastMessageRoll() {
  return cy
    .window()
    .should((win) => {
      expect(win.game.messages.size, "un nouveau message de jet doit être posté").to.be.greaterThan(knownMessageCount);
    })
    .then((win) => {
      knownMessageCount = win.game.messages.size;
      const message = win.game.messages.contents.at(-1);
      return {
        formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, ""),
        total: message.rolls[0]?.total,
        content: message.content
      };
    });
}

function lastMessageCount() {
  return cy.window().then((win) => win.game.messages.size);
}

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Tab Stats Fighter",
    origin: "ravenmoor", // avantage d'Origine sur investigation/perception (T-STATS-005)
    classKey: "fighter", // maîtrise str/con (T-STATS-004), armure de départ à désavantage Discrétion (T-STATS-006),
    // possède "Second souffle" (uses.recharge "shortRest", T-STATS-012)
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdActorIds.length) cleanup.push(win.Actor.deleteDocuments(createdActorIds));
    return Promise.all(cleanup);
  });
});

describe("Onglet Statistiques — jets de dés", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    resetMessageBaseline();
  });

  it("jet de caractéristique simple (T-STATS-001)", () => {
    cy.window().then((win) => {
      const mod = abilityModifier(win.game.actors.get(sharedActorId).system.abilities.str.total);
      sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula).to.equal(`1d20${formatModifier(mod)}`);
        expect(roll.total).to.be.within(1 + mod, 20 + mod);
      });
    });
  });

  it("jet de caractéristique avec avantage, Maj-clic (T-STATS-002)", () => {
    sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click({ shiftKey: true });
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kh1"));
  });

  it("jet de caractéristique avec désavantage, Ctrl-clic (T-STATS-003)", () => {
    sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click({ ctrlKey: true });
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kl1"));
  });

  it("jet de sauvegarde — bonus de maîtrise appliqué seulement si maîtrisée (T-STATS-004)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const level = actor.system.attributes.level;
      const strMod = abilityModifier(actor.system.abilities.str.total);
      const prof = proficiencyBonusFor(level);
      expect(actor.system.saves.str.proficient, "prérequis : fighter maîtrise Force").to.be.true;

      sheetRoot().find('button[data-action="rollSave"][data-key="str"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula, "sauvegarde maîtrisée : mod + bonus de maîtrise").to.equal(
          `1d20${formatModifier(strMod + prof)}`
        );
      });
    });

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const dexMod = abilityModifier(actor.system.abilities.dex.total);
      expect(actor.system.saves.dex.proficient, "prérequis : fighter NE maîtrise PAS Dextérité").to.be.false;

      sheetRoot().find('button[data-action="rollSave"][data-key="dex"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula, "sauvegarde non maîtrisée : mod seul").to.equal(`1d20${formatModifier(dexMod)}`);
      });
    });
  });

  it("jet de compétence — avantage d'Origine automatique, sans Maj-clic (T-STATS-005)", () => {
    cy.window().then((win) => {
      expect(
        win.game.dndCustomAi.origins.ravenmoor.skillAdvantages,
        "prérequis : Ravenmoor avantage Investigation"
      ).to.include("investigation");
    });
    sheetRoot().find('button[data-action="rollSkill"][data-key="investigation"]').click();
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kh1"));
  });

  it("jet de compétence — désavantage d'armure automatique sur Discrétion (T-STATS-006)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      expect(actor.system.stealthDisadvantage, "prérequis : Cotte de mailles équipée (désavantage)").to.be.true;
    });
    sheetRoot().find('button[data-action="rollSkill"][data-key="stealth"]').click();
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kl1"));
  });

  it("Aptitudes multiples (Barde) — demi-bonus sur une compétence non maîtrisée (T-STATS-007)", () => {
    let bardActorId;
    // Ferme la fiche du personnage partagé (ouverte par le beforeEach de ce describe) avant d'en
    // créer un autre : sinon les deux fiches restent ouvertes en même temps et sheetRoot() (qui
    // matche `.application.character`) devient ambigu — piège rencontré au premier run réel.
    cy.window().then((win) => win.game.actors.get(sharedActorId).sheet.close());
    cy.createReadyCharacter({
      name: "Tab Stats Bard",
      origin: "fleuraine",
      classKey: "bard",
      skills: ["persuasion", "performance", "deception"] // athletics reste non maîtrisée
    }).then((id) => {
      bardActorId = id;
      createdActorIds.push(id);

      // "Aptitudes multiples" (Barde niveau 2) octroyée directement depuis le compendium plutôt
      // que via grantClassContent (monter le personnage au niveau 2 n'apporterait rien de plus
      // ici : seule la présence de la Capacité, pas le niveau, conditionne hasFeature côté code).
      return cy.window().then((win) => {
        const pack = win.game.packs.get("dnd-custom-ai.capacites");
        return pack.getIndex().then(() => {
          const entry = [...pack.index].find((candidate) => candidate.name === "Aptitudes multiples");
          expect(entry, "Capacité 'Aptitudes multiples' introuvable dans le compendium capacites").to.exist;
          return pack.getDocument(entry._id).then((doc) => {
            const actor = win.game.actors.get(bardActorId);
            return actor.createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(doc.toObject()))]);
          });
        });
      });
    });

    cy.window().then((win) => {
      const actor = win.game.actors.get(bardActorId);
      expect(actor.system.skills.athletics.proficient, "prérequis : Athlétisme non maîtrisée").to.be.false;
      const mod = abilityModifier(actor.system.abilities.str.total);
      const halfProf = Math.floor(proficiencyBonusFor(actor.system.attributes.level) / 2);

      sheetRoot().find('button[data-action="rollSkill"][data-key="athletics"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula).to.equal(`1d20${formatModifier(mod + halfProf)}`);
      });
    });
  });

  it("Exhaustion ≥ 1 — désavantage automatique sur les jets de caractéristique/compétence (T-STATS-017)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(sharedActorId), { "system.attributes.exhaustion": 1 }));
    sheetRoot().find('button[data-action="rollAbility"][data-key="wis"]').click();
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kl1"));

    // Remet l'Exhaustion à zéro pour ne pas fausser les tests suivants de cette spec.
    cy.window().then((win) => updateActor(win, win.game.actors.get(sharedActorId), { "system.attributes.exhaustion": 0 }));
  });
});

describe("Onglet Statistiques — caractéristiques", () => {
  it("boutons +/- caractéristique réservés au MJ (T-STATS-008)", () => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    sheetRoot().find('button[data-action="abilityIncrease"]').should("not.exist");
    sheetRoot().find('button[data-action="abilityDecrease"]').should("not.exist");

    cy.loginAsGM();
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const before = win.game.actors.get(sharedActorId).system.abilities.str.value;

      sheetRoot().find('button[data-action="abilityIncrease"][data-key="str"]').click();
      cy.window().then((win2) => {
        expect(win2.game.actors.get(sharedActorId).system.abilities.str.value).to.equal(before + 1);
      });

      sheetRoot().find('button[data-action="abilityDecrease"][data-key="str"]').click();
      cy.window().then((win3) => {
        // Retombe exactement sur la valeur de départ : aucune trace laissée pour les tests suivants.
        expect(win3.game.actors.get(sharedActorId).system.abilities.str.value).to.equal(before);
      });
    });
  });
});

describe("Onglet Statistiques — repos", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("Repos court — soin de moitié des PV max (T-STATS-009)", () => {
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const max = actor.system.attributes.hp.max;
      return updateActor(win, actor, { "system.attributes.hp.value": 1 });
    });

    lastMessageCount().then((before) => {
      sheetRoot().find('button[data-action="restShort"]').click();
      // `.should()` (pas un `.then()` isolé) : le clic ne fait que distribuer l'évènement DOM,
      // le gestionnaire (#onRestShort, plusieurs `await` avant le ChatMessage.create final)
      // continue de tourner après — même piège/même fix que lastMessageRoll ci-dessus, découvert
      // ici sur un deuxième run réel de cette spec dans la même session que d'autres specs.
      cy.window().should((win) => {
        const actor = win.game.actors.get(sharedActorId);
        const expected = Math.min(1 + Math.floor(actor.system.attributes.hp.max / 2), actor.system.attributes.hp.max);
        expect(actor.system.attributes.hp.value).to.equal(expected);
        expect(win.game.messages.size, "message de chat posté").to.equal(before + 1);
        expect(win.game.messages.contents.at(-1).content).to.include(actor.name);
      });
    });

    // Pleine santé pour les tests suivants.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
  });

  it("Repos court — restaure les emplacements de sorts de l'Occultiste (T-STATS-010)", () => {
    let warlockId;
    cy.createReadyCharacter({
      name: "Tab Stats Warlock",
      origin: "valdera",
      classKey: "warlock",
      skills: ["arcana", "deception"]
    }).then((id) => {
      warlockId = id;
      createdActorIds.push(id);

      cy.window().then((win) => {
        const actor = win.game.actors.get(warlockId);
        expect(actor.system.spells.uses.max, "prérequis : Occultiste niveau 1 a des emplacements de sorts").to.be
          .greaterThan(0);
        return updateActor(win, actor, { "system.spells.uses.value": 0 });
      });

      sheetRoot().find('button[data-action="restShort"]').click();
      cy.window().then((win) => {
        const actor = win.game.actors.get(warlockId);
        expect(actor.system.spells.uses.value).to.equal(actor.system.spells.uses.max);
      });
    });
  });

  it("Repos long — soin complet et sorts restaurés (T-STATS-011)", () => {
    let casterId;
    cy.createReadyCharacter({
      name: "Tab Stats Wizard",
      origin: "ashar",
      classKey: "wizard",
      skills: ["arcana", "history"]
    }).then((id) => {
      casterId = id;
      createdActorIds.push(id);

      cy.window().then((win) => {
        const actor = win.game.actors.get(casterId);
        expect(actor.system.spells.uses.max, "prérequis : magicien niveau 1 a des emplacements de sorts").to.be
          .greaterThan(0);
        return updateActor(win, actor, {
          "system.attributes.hp.value": 1,
          "system.spells.uses.value": 0
        });
      });

      lastMessageCount().then((before) => {
        sheetRoot().find('button[data-action="restLong"]').click();
        // `.should()` : même piège/même fix que T-STATS-009 ci-dessus.
        cy.window().should((win) => {
          const actor = win.game.actors.get(casterId);
          expect(actor.system.attributes.hp.value).to.equal(actor.system.attributes.hp.max);
          expect(actor.system.spells.uses.value).to.equal(actor.system.spells.uses.max);
          expect(win.game.messages.size, "message de chat posté").to.equal(before + 1);
        });
      });
    });
  });

  // Historique : ce scénario a longtemps été volontairement rouge (découvert le 2026-08-15,
  // corrigé le 2026-08-16) — grantClassContent (scripts/helpers/class-content.js) comparait le
  // nom de classe français codé en dur dans world-items/features.json/spells.json (ex.
  // "Guerrier") au libellé de la classe LOCALISÉ dynamiquement (`game.i18n.localize`), ce qui ne
  // correspondait jamais sous une langue de monde autre que le français (ce monde de test tourne
  // en anglais). Corrigé en stockant une clé de classe STABLE (ex. "fighter", indépendante de la
  // langue) dans `system.class`/`system.subclass`/`system.classes` du contenu de référence —
  // cf. FeatureData/SpellData, scripts/data/item-data.js, et la migration de
  // world-items/features.json/spells.json. Ce test reste la preuve directe de la correction.
  it("recharge une Capacité à charges au repos, court comme long (T-STATS-012)", () => {
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const secondWind = actor.items.find((item) => item.name === "Second souffle");
      expect(secondWind, "prérequis : le fighter possède 'Second souffle' (uses.recharge shortRest)").to.exist;
      expect(secondWind.system.uses.recharge).to.equal("shortRest");
      return secondWind.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 0 })));
    });

    sheetRoot().find('button[data-action="restShort"]').click();
    cy.window().then((win) => {
      const secondWind = win.game.actors.get(sharedActorId).items.find((item) => item.name === "Second souffle");
      expect(secondWind.system.uses.value, "rechargée après un repos court").to.equal(secondWind.system.uses.max);
      return secondWind.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 0 })));
    });

    sheetRoot().find('button[data-action="restLong"]').click();
    cy.window().then((win) => {
      const secondWind = win.game.actors.get(sharedActorId).items.find((item) => item.name === "Second souffle");
      expect(secondWind.system.uses.value, "rechargée après un repos long aussi").to.equal(secondWind.system.uses.max);
    });
  });

  it("Repos bloqué si le personnage est mort — aucun effet (T-STATS-013)", () => {
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, {
        "system.attributes.hp.value": 1,
        "system.attributes.death.failures": 3
      });
    });

    lastMessageCount().then((before) => {
      // `{force: true}` : le bouton est déjà désactivé côté template quand le personnage est
      // mort (`dying.dead`, character-sheet.hbs) — un vrai clic ne passerait même pas l'étape
      // d'actionabilité de Cypress. Ce qui est testé ici est le garde-fou CÔTÉ DONNÉES
      // (`#isDead()`, actor-sheet.js), en complément de ce verrou visuel, pas ce dernier.
      sheetRoot().find('button[data-action="restShort"]').click({ force: true });
      cy.window().then((win) => {
        const actor = win.game.actors.get(sharedActorId);
        expect(actor.system.attributes.hp.value, "aucun soin appliqué").to.equal(1);
        expect(win.game.messages.size, "aucun message posté").to.equal(before);
      });
    });

    // Retire l'état "mort" posé pour ce test avant de rendre la main aux tests suivants.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, {
        "system.attributes.hp.value": actor.system.attributes.hp.max,
        "system.attributes.death.failures": 0
      });
    });
  });
});

describe("Onglet Statistiques — Initiative", () => {
  it("jet d'Initiative crée un Combattant sur le combat en cours (T-STATS-014)", () => {
    cy.loginAsGM();
    cy.window().then((win) => {
      if (win.game.combat) return null; // combat déjà en cours (run précédent interrompu) : on le réutilise.
      return win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then(
        (combat) => {
          createdCombatIds.push(combat.id);
        }
      );
    });

    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    sheetRoot().find('button[data-action="rollInitiative"]').click();

    cy.window({ timeout: 10000 }).should((win) => {
      const combatant = win.game.combat?.combatants.find((c) => c.actor?.id === sharedActorId);
      expect(combatant, "un Combattant doit exister pour ce personnage").to.exist;
      expect(combatant.initiative, "le Combat Tracker doit afficher un résultat").to.be.a("number");
    });
  });
});

describe("Onglet Statistiques — états et Exhaustion", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
  });

  it("bascule un état : l'ActiveEffect est créée puis retirée (T-STATS-015)", () => {
    // La liste des états est repliée par défaut (`<details>`, retour de test — cf.
    // styles/dnd-custom-ai.css > .conditions-dropdown) : un re-render complet de la fiche suit
    // chaque bascule (donnée modifiée), qui régénère le HTML et referme le `<details>` — il faut
    // donc le rouvrir avant chaque clic, pas seulement le premier.
    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).statuses.has("poisoned")).to.be.true;
    });

    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').should("have.class", "active");
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).statuses.has("poisoned")).to.be.false;
    });

    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').should("not.have.class", "active");
  });

  it("Exhaustion +/- reste bornée entre 0 et 6 (T-STATS-016)", () => {
    for (let i = 0; i < 7; i += 1) {
      sheetRoot().find('button[data-action="exhaustionIncrease"]').click();
    }
    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).system.attributes.exhaustion).to.equal(6);
    });

    for (let i = 0; i < 8; i += 1) {
      sheetRoot().find('button[data-action="exhaustionDecrease"]').click();
    }
    cy.window().should((win) => {
      // Revenu à 0 : aucune trace laissée pour les tests suivants de cette spec.
      expect(win.game.actors.get(sharedActorId).system.attributes.exhaustion).to.equal(0);
    });
  });
});

describe("Onglet Statistiques — Agonie et jets de sauvegarde de la mort", () => {
  // Personnage dédié : ces scénarios manipulent hp.value/system.attributes.death directement et
  // à répétition, isolé du personnage partagé pour ne dépendre d'aucun ordre d'exécution avec le
  // reste de cette spec (cf. mémoire projet, exigence de reproductibilité).
  let dyingActorId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Tab Stats Dying", origin: "altenmark", classKey: "cleric", skills: ["religion", "insight"] }).then(
      (id) => {
        dyingActorId = id;
        createdActorIds.push(id);
      }
    );
  });

  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(dyingActorId);
  });

  // Remet le personnage à 0 PV avec les compteurs de sauvegarde de la mort demandés, avant
  // chaque sous-scénario, plutôt que de compter sur l'état laissé par le précédent — chaque test
  // de ce describe reste indépendant. Repasse par une vraie transition max PV -> 0 PV (pas une
  // affectation directe à 0 si les PV y étaient déjà) pour déclencher le hook updateActor
  // (dnd-custom-ai.js) qui pose Inconscient, PUIS attend que ce hook ait fini de remettre les
  // compteurs à zéro avant d'imposer l'état voulu par-dessus dans un update SÉPARÉ qui ne touche
  // plus du tout hp.value. Piège rencontré au premier run réel (2026-08-15) : combiner hp.value
  // et les compteurs dans un seul update pendant que les PV étaient déjà à 0 déclenchait la
  // branche "dégâts subis en étant déjà à 0 PV" du même hook (échec automatique +1), qui
  // écrasait ensuite la valeur qu'on venait de poser — d'où des compteurs incrémentés d'un cran
  // au hasard d'un sous-cas à l'autre.
  function setDyingState(successes, failures) {
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
    cy.window().then((win) => updateActor(win, win.game.actors.get(dyingActorId), { "system.attributes.hp.value": 0 }));
    cy.window().should((win) => {
      const death = win.game.actors.get(dyingActorId).system.attributes.death;
      expect(death.successes).to.equal(0);
      expect(death.failures).to.equal(0);
    });
    return cy.window().then((win) =>
      updateActor(win, win.game.actors.get(dyingActorId), {
        "system.attributes.death.successes": successes,
        "system.attributes.death.failures": failures
      })
    );
  }

  it("le panneau Agonie apparaît à 0 PV, pastilles à zéro (T-STATS-018)", () => {
    // Part d'un PV > 0 pour retomber à 0 : c'est cette transition (pas une création directe à 0)
    // qui déclenche le statut Inconscient (hook updateActor, dnd-custom-ai.js).
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": Math.max(1, actor.system.attributes.hp.max) });
    });
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": 0 });
    });

    cy.get(".death-panel").should("be.visible");
    cy.get(".death-pips i.filled").should("have.length", 0);
    cy.get(".death-pips.failures i.filled").should("have.length", 0);
    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).statuses.has("unconscious")).to.be.true;
    });
  });

  it("jet de sauvegarde de la mort — réussite, échec, et cas critiques (T-STATS-019)", () => {
    // Nat 20 : régénère 1 PV, sort de l'Agonie (compteurs remis à zéro par le hook updateActor).
    setDyingState(0, 0);
    cy.forceD20(20);
    cy.get('button[data-action="rollDeathSave"]').click();
    cy.window().should((win) => {
      const actor = win.game.actors.get(dyingActorId);
      expect(actor.system.attributes.hp.value).to.equal(1);
      expect(actor.system.attributes.death.successes).to.equal(0);
      expect(actor.system.attributes.death.failures).to.equal(0);
    });
    cy.get(".death-panel").should("not.exist");

    // Nat 1 : compte comme deux échecs d'un coup.
    setDyingState(0, 0);
    cy.forceD20(1);
    cy.get('button[data-action="rollDeathSave"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).system.attributes.death.failures).to.equal(2);
    });

    // 10+ (hors nat 20) : une réussite simple.
    setDyingState(0, 0);
    cy.forceD20(15);
    cy.get('button[data-action="rollDeathSave"]').click();
    cy.window().should((win) => {
      const death = win.game.actors.get(dyingActorId).system.attributes.death;
      expect(death.successes).to.equal(1);
      expect(death.failures).to.equal(0);
    });

    // < 10 (hors nat 1) : un échec simple.
    setDyingState(0, 0);
    cy.forceD20(5);
    cy.get('button[data-action="rollDeathSave"]').click();
    cy.window().should((win) => {
      const death = win.game.actors.get(dyingActorId).system.attributes.death;
      expect(death.failures).to.equal(1);
      expect(death.successes).to.equal(0);
    });

    // Remet une santé normale pour ne pas laisser le personnage en Agonie entre les tests.
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
  });

  it("troisième échec — le personnage meurt, le Repos est ensuite bloqué (T-STATS-020)", () => {
    setDyingState(0, 2); // déjà deux échecs (ex. un nat 1 précédent, cf. T-STATS-019)
    cy.forceD20(5); // un échec simple suffit à atteindre 3
    cy.get('button[data-action="rollDeathSave"]').click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(dyingActorId);
      expect(actor.system.attributes.death.failures).to.equal(3);
      expect(actor.statuses.has("dead")).to.be.true;
    });

    // Pas de comparaison de compte de messages ici (contrairement à T-STATS-013, sur un
    // personnage stable) : le message "Death" de declareDeath() ci-dessus peut encore être en
    // train de se poster de façon asynchrone au moment de capturer un total "avant", rendant la
    // comparaison avant/après instable — un simple contrôle de non-effet sur les PV suffit, déjà
    // couvert de façon stable par T-STATS-013 pour la partie "aucun message posté".
    cy.get('[data-action="restShort"]').click({ force: true });
    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).system.attributes.hp.value, "Repos sans effet une fois mort").to.equal(
        0
      );
    });

    // Retire le statut "mort" et rend la santé pour les tests suivants.
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return actor.toggleStatusEffect("dead", { active: false }).then(() =>
        updateActor(win, actor, {
          "system.attributes.hp.value": actor.system.attributes.hp.max,
          "system.attributes.death.successes": 0,
          "system.attributes.death.failures": 0
        })
      );
    });
  });

  it("trois réussites — stabilisé, plus aucun jet proposé (T-STATS-021)", () => {
    setDyingState(2, 0); // déjà deux réussites
    cy.forceD20(15); // une réussite simple suffit à atteindre 3
    cy.get('button[data-action="rollDeathSave"]').click();

    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).system.attributes.death.successes).to.equal(3);
    });

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Actor.Stabilized"))
      .then((stabilizedLabel) => {
        cy.get(".death-status").should("contain.text", stabilizedLabel);
      });
    cy.get('button[data-action="rollDeathSave"]').should("not.exist");

    // Remet une santé normale pour les tests suivants.
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, {
        "system.attributes.hp.value": actor.system.attributes.hp.max,
        "system.attributes.death.successes": 0
      });
    });
  });

  it("remonter au-dessus de 0 PV réinitialise l'état de mort (T-STATS-022)", () => {
    setDyingState(1, 1); // 0 PV (Inconscient posé), quelques réussites/échecs déjà encaissés
    cy.get(".death-panel").should("be.visible");
    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).statuses.has("unconscious")).to.be.true;
    });

    cy.window().then((win) => updateActor(win, win.game.actors.get(dyingActorId), { "system.attributes.hp.value": 5 }));

    cy.get(".death-panel").should("not.exist");
    cy.window().should((win) => {
      const actor = win.game.actors.get(dyingActorId);
      expect(actor.system.attributes.death.successes).to.equal(0);
      expect(actor.system.attributes.death.failures).to.equal(0);
      expect(actor.statuses.has("unconscious")).to.be.false;
    });
  });
});
