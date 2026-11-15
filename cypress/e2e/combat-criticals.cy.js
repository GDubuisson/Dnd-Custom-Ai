// Critiques sur 1/20 naturel en combat actif (attaques, sauvegardes) : un 1 rate une CA de 1,
// un 20 touche une CA de 999.

const createdActorIds = [];
const createdCombatIds = [];
const createdSceneItemIds = [];

const MAIN_HAND = 0;

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function equipmentSlotEl(index) {
  return sheetRoot().find(".equipment-slot").eq(index);
}

function withItemId(actorId, itemName, callback) {
  return cy
    .window()
    .then((win) => {
      const item = win.game.actors.get(actorId).items.find((candidate) => candidate.name === itemName);
      expect(item, `Item '${itemName}' introuvable sur l'Actor`).to.exist;
      return item.id;
    })
    .then(callback);
}

function grantCompendiumItem(win, actorId, packName, itemName) {
  const pack = win.game.packs.get(`dnd-custom-ai.${packName}`);
  return pack.getIndex().then(() => {
    const entry = [...pack.index].find((candidate) => candidate.name === itemName);
    expect(entry, `Item '${itemName}' introuvable dans le compendium ${packName}`).to.exist;
    return pack.getDocument(entry._id).then((doc) =>
      win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(doc.toObject()))])
    );
  });
}

// Attend un message réellement nouveau.
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
        flavor: message.flavor
      };
    });
}

// Cible créée en session MJ (Actor et Token).
function createTarget(name, ac) {
  let tokenId;
  cy.loginAsGM();
  return cy
    .window()
    .then((win) =>
      win.Actor.create(win.JSON.parse(win.JSON.stringify({ name, type: "npc", system: { attributes: { ac: { value: ac } } } })))
    )
    .then((actor) => {
      createdActorIds.push(actor.id);
      return cy.window().then((win) =>
        win.canvas.scene
          .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify({ actorId: actor.id, x: 200, y: 200 }))])
          .then((tokens) => {
            tokenId = tokens[0].id;
            createdSceneItemIds.push(tokenId);
            return tokenId;
          })
      );
    });
}

function targetToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
}

// Rend l'Action avant chaque jet pour éviter le rappel d'économie d'action.
function resetActionEconomy(actorId) {
  return cy.window().then((win) =>
    win.game.actors
      .get(actorId)
      .update(
        win.JSON.parse(win.JSON.stringify({ "system.combat.actionAvailable": true, "system.combat.bonusActionAvailable": true })),
        { dndCustomWizard: true }
      )
  );
}

let fighterId;
let wizardId;

before(() => {
  // Création en session Joueur pour garder la propriété.
  cy.loginAsPlayer();

  cy.createReadyCharacter({
    name: "Crit Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    fighterId = id;
    createdActorIds.push(id);
  });

  cy.createReadyCharacter({
    name: "Crit Wizard",
    origin: "ashar",
    classKey: "wizard",
    skills: ["arcana", "history"]
  }).then((id) => {
    wizardId = id;
    createdActorIds.push(id);
    cy.window().then((win) => grantCompendiumItem(win, id, "sorts", "Trait de feu"));
  });

  // Combat et Combattants créés par le MJ.
  cy.loginAsGM();
  cy.window().then((win) =>
    win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
      createdCombatIds.push(combat.id);
      return combat.createEmbeddedDocuments(
        "Combatant",
        win.JSON.parse(win.JSON.stringify([{ actorId: fighterId, initiative: 10 }, { actorId: wizardId, initiative: 5 }]))
      );
    })
  );
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Critiques en combat — jet d'attaque d'arme", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("20 naturel touche automatiquement même une CA hors de portée, et double les dés de dégâts (T-CRIT-001)", () => {
    createTarget("Crit Target High AC", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetActionEconomy(fighterId);
      resetMessageBaseline();
      cy.forceD20(20);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => ({
          hit: i18n.format("DND_CUSTOM.Roll.AttackHit", { target: "Crit Target High AC", ac: 999 }),
          crit: i18n.localize("DND_CUSTOM.Roll.CriticalHit")
        }))
        .then(({ hit, crit }) => {
          lastMessageRoll().then((roll) => {
            expect(roll.flavor, "touché malgré une CA de 999").to.include(hit);
            expect(roll.flavor, "libellé Coup critique affiché").to.include(crit);
            // Seul le d20 naturel est affiché sur un critique.
            expect(roll.formula, "aucun modificateur affiché sur un coup critique").to.equal("1d20");
          });
        });

      // Dégâts doublés de l'Épée longue (1d10 à deux mains).
      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula, "dés doublés (2d10 au lieu de 1d10)").to.include("2d10");
      });
    });
  });

  it("1 naturel rate automatiquement même une CA très basse (T-CRIT-002)", () => {
    createTarget("Crit Target Low AC", 1).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetActionEconomy(fighterId);
      resetMessageBaseline();
      cy.forceD20(1);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => ({
          miss: i18n.format("DND_CUSTOM.Roll.AttackMiss", { target: "Crit Target Low AC", ac: 1 }),
          fumble: i18n.localize("DND_CUSTOM.Roll.CriticalFumble")
        }))
        .then(({ miss, fumble }) => {
          lastMessageRoll().then((roll) => {
            expect(roll.flavor, "raté malgré une CA de 1").to.include(miss);
            expect(roll.flavor, "libellé Échec critique affiché").to.include(fumble);
            expect(roll.formula, "aucun modificateur affiché sur un échec critique").to.equal("1d20");
          });
        });
    });
  });

  it("20 naturel HORS combat : pas de libellé critique, comparaison normale à la CA (T-CRIT-003)", () => {
    // Modification du Combattant par le MJ.
    cy.loginAsGM();
    cy.window().then((win) => win.game.combat?.combatants.find((c) => c.actor?.id === fighterId)?.delete());

    createTarget("Crit Target Out Of Combat", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetActionEconomy(fighterId);
      resetMessageBaseline();
      cy.forceD20(20);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => ({
          miss: i18n.format("DND_CUSTOM.Roll.AttackMiss", { target: "Crit Target Out Of Combat", ac: 999 }),
          crit: i18n.localize("DND_CUSTOM.Roll.CriticalHit")
        }))
        .then(({ miss, crit }) => {
          lastMessageRoll().then((roll) => {
            expect(roll.flavor, "comparaison normale : raté contre CA 999 hors combat").to.include(miss);
            expect(roll.flavor, "aucun libellé critique hors combat").not.to.include(crit);
          });
        });
    });

    // Remet le personnage en combat (MJ).
    cy.loginAsGM();
    cy.window().then((win) =>
      win.game.combat.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId: fighterId, initiative: 10 }])))
    );
  });
});

describe("Critiques en combat — jet d'attaque de sort", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("20 naturel touche automatiquement un sort d'attaque, et double ses dés de dégâts (T-CRIT-004)", () => {
    createTarget("Crit Spell Target", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(wizardId);
      goToTab("abilities");

      withItemId(wizardId, "Trait de feu", (itemId) => {
        resetActionEconomy(wizardId);
        resetMessageBaseline();
        cy.forceD20(20);
        targetToken(tokenId);
        cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();

        cy.window()
          .its("game.i18n")
          .then((i18n) => i18n.localize("DND_CUSTOM.Roll.CriticalHit"))
          .then((crit) => {
            lastMessageRoll().then((roll) => {
              expect(roll.flavor, "libellé Coup critique affiché").to.include(crit);
              expect(roll.formula, "aucun modificateur affiché sur un coup critique").to.equal("1d20");
            });
          });

        resetMessageBaseline();
        cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
        lastMessageRoll().then((roll) => {
          expect(roll.formula, "dés doublés (2d10 au lieu de 1d10, cf. Trait de feu)").to.equal("2d10");
        });
      });
    });
  });
});

describe("Critiques en combat — jet de sauvegarde", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("1 naturel EN combat : libellé Échec critique affiché (T-CRIT-005)", () => {
    cy.openActorSheet(fighterId);
    resetMessageBaseline();
    cy.forceD20(1);
    sheetRoot().find('button[data-action="rollSave"][data-key="str"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Roll.CriticalFumble"))
      .then((fumble) => {
        lastMessageRoll().then((roll) => {
          expect(roll.flavor, "libellé Échec critique affiché sur une sauvegarde en combat").to.include(fumble);
          expect(roll.formula, "aucun modificateur affiché sur un échec critique").to.equal("1d20");
        });
      });
  });

  it("20 naturel HORS combat : aucun libellé critique sur une sauvegarde (T-CRIT-006)", () => {
    cy.loginAsGM();
    cy.window().then((win) => win.game.combat?.combatants.find((c) => c.actor?.id === fighterId)?.delete());
    cy.loginAsPlayer();

    cy.openActorSheet(fighterId);
    resetMessageBaseline();
    cy.forceD20(20);
    sheetRoot().find('button[data-action="rollSave"][data-key="str"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Roll.CriticalHit"))
      .then((crit) => {
        lastMessageRoll().then((roll) => {
          expect(roll.flavor, "aucun libellé critique sur une sauvegarde hors combat").not.to.include(crit);
        });
      });

    cy.loginAsGM();
    cy.window().then((win) =>
      win.game.combat?.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId: fighterId, initiative: 10 }])))
    );
  });
});

// Effet visuel des critiques sur la carte de jet (bordure, halo, icône).
describe("Critiques en combat — effet visuel sur la carte de jet", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("coup critique : bordure et icône dédiées sur la carte de jet, dégâts doublés inclus (T-CRIT-007)", () => {
    createTarget("Crit Visual Target High AC", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetActionEconomy(fighterId);
      resetMessageBaseline();
      cy.forceD20(20);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      lastMessageRoll();

      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(".chat-message").last().within(() => {
        cy.get(".dice-roll").should("have.class", "dnd-critical-hit");
        cy.get(".dice-total .dnd-critical-icon.fa-burst").should("exist");
      });

      // Le jet de dégâts doublé porte le même effet.
      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click();
      lastMessageRoll();
      cy.get(".chat-message").last().within(() => {
        cy.get(".dice-roll").should("have.class", "dnd-critical-hit");
        cy.get(".dice-total .dnd-critical-icon.fa-burst").should("exist");
      });
    });
  });

  it("échec critique : bordure et icône dédiées, distinctes du coup critique (T-CRIT-008)", () => {
    createTarget("Crit Visual Target Low AC", 1).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetActionEconomy(fighterId);
      resetMessageBaseline();
      cy.forceD20(1);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      lastMessageRoll();

      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(".chat-message")
        .last()
        .within(() => {
          cy.get(".dice-roll").should("have.class", "dnd-critical-fumble").and("not.have.class", "dnd-critical-hit");
          cy.get(".dice-total .dnd-critical-icon.fa-skull-crossbones").should("exist");
        });
    });
  });

  it("jet normal (sans critique) : aucune des deux classes, aucune icône ajoutée (T-CRIT-009)", () => {
    createTarget("Crit Visual Target Normal", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetActionEconomy(fighterId);
      resetMessageBaseline();
      cy.forceD20(10);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      lastMessageRoll();

      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(".chat-message")
        .last()
        .within(() => {
          cy.get(".dice-roll").should("not.have.class", "dnd-critical-hit").and("not.have.class", "dnd-critical-fumble");
          cy.get(".dnd-critical-icon").should("not.exist");
        });
    });
  });
});
