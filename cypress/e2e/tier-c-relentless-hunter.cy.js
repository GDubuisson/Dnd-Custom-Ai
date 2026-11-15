// Traque implacable : désavantage aux attaques contre la cible « Traquée » pour toute créature
// autre que le Paladin. Sans flag propriétaire (état posé à la main), aucun désavantage.

const createdActorIds = [];
const createdSceneItemIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function createActor(win, data) {
  return win.Actor.create(win.JSON.parse(win.JSON.stringify(data))).then((actor) => {
    createdActorIds.push(actor.id);
    return actor;
  });
}

function createItem(win, actorId, data) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(data))]);
}

function createToken(win, actorId, x, y) {
  return win.game.actors
    .get(actorId)
    .getTokenDocument(win.JSON.parse(win.JSON.stringify({ x, y })))
    .then((tokenDoc) =>
      win.canvas.scene
        .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))])
        .then((tokens) => {
          createdSceneItemIds.push(tokens[0].id);
          return tokens[0].id;
        })
    );
}

function targetToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
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

let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function lastMessage() {
  return cy
    .window()
    .should((win) => {
      expect(win.game.messages.size, "un nouveau message doit être posté").to.be.greaterThan(knownMessageCount);
    })
    .then((win) => {
      knownMessageCount = win.game.messages.size;
      const message = win.game.messages.contents.at(-1);
      return {
        id: message.id,
        formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, "")
      };
    });
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Traque implacable — bouton dédié (FeatureData#grantsCondition)", () => {
  let paladinId;
  let quarryId;
  let quarryTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Relentless Hunter Paladin", type: "character", system: { class: "paladin", subclass: "vengeance" } }))
      .then((actor) => {
        paladinId = actor.id;
        return cy.window().then((win) =>
          Promise.all([
            createItem(win, paladinId, {
              name: "Canalisation divine (Paladin)",
              type: "feature",
              system: { class: "paladin", level: 3, activation: "action", uses: { max: 1, value: 1, recharge: "shortRest" } }
            }),
            createItem(win, paladinId, {
              name: "Traque implacable",
              type: "feature",
              system: { class: "paladin", subclass: "vengeance", level: 3, activation: "bonusAction", costsResource: "Canalisation divine (Paladin)", grantsCondition: "hunted" }
            })
          ])
        );
      });
    cy.window()
      .then((win) => createActor(win, { name: "Relentless Hunter Quarry", type: "npc", system: { attributes: { hp: { value: 50, max: 50 } } } }))
      .then((actor) => {
        quarryId = actor.id;
        return cy.window().then((win) => createToken(win, quarryId, 1000, 1000));
      })
      .then((tokenId) => {
        quarryTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  function rechargeChannelDivinity() {
    return cy.window().then((win) =>
      win.game.actors
        .get(paladinId)
        .items.find((i) => i.name === "Canalisation divine (Paladin)")
        .update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 1 })))
    );
  }

  function clickRelentlessHunterButton() {
    cy.window().then((win) => win.game.actors.get(paladinId).sheet.render(true));
    cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
    goToTab("abilities");
    withItemId(paladinId, "Traque implacable", (itemId) => {
      resetMessageBaseline();
      sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="grantFeatureCondition"]`).click();
    });
  }

  it("cible sélectionnée : \"Traqué\" posé + flag propriétaire, charge de Canalisation divine consommée (T-TIERC-HUNT-001)", () => {
    targetToken(quarryTokenId);
    clickRelentlessHunterButton();
    lastMessage();
    cy.window().should((win) => {
      const quarry = win.canvas.tokens.get(quarryTokenId).actor;
      expect(quarry.statuses.has("hunted"), "état Traqué posé").to.be.true;
      expect(quarry.getFlag("dnd-custom-ai", "huntedByActorId"), "flag propriétaire = ce Paladin").to.equal(paladinId);
      const resource = win.game.actors.get(paladinId).items.find((i) => i.name === "Canalisation divine (Paladin)");
      expect(resource.system.uses.value, "charge consommée").to.equal(0);
    });
    cy.window().then((win) => win.game.actors.get(paladinId).sheet.close());
  });

  it("aucune cible sélectionnée : avertissement, aucun état posé (T-TIERC-HUNT-002)", () => {
    rechargeChannelDivinity();
    cy.window().then((win) => win.canvas.tokens.get(quarryTokenId).actor.toggleStatusEffect("hunted", { active: false }));
    cy.window().then((win) => win.canvas.tokens.get(quarryTokenId).setTarget(false, { releaseOthers: true }));

    let warned = false;
    cy.window().then((win) => {
      const original = win.ui.notifications.warn.bind(win.ui.notifications);
      win.ui.notifications.warn = (message) => {
        warned = true;
        return original(message);
      };
    });

    cy.window().then((win) => win.game.actors.get(paladinId).sheet.render(true));
    cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
    goToTab("abilities");
    withItemId(paladinId, "Traque implacable", (itemId) => {
      sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="grantFeatureCondition"]`).click();
    });

    cy.window().should((win) => {
      expect(warned, "avertissement NoTarget attendu").to.be.true;
      expect(win.canvas.tokens.get(quarryTokenId).actor.statuses.has("hunted"), "aucun état posé sans cible").to.be.false;
    });
    cy.window().then((win) => win.game.actors.get(paladinId).sheet.close());
  });
});

describe("Traque implacable — désavantage aux jets d'attaque contre la cible Traquée", () => {
  let paladinId;
  let otherCasterId;
  let attackerNpcId;
  let quarryId;
  let quarryTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Relentless Hunter Paladin 2", type: "character", system: { class: "paladin", subclass: "vengeance" } }))
      .then((actor) => {
        paladinId = actor.id;
        return cy.window().then((win) =>
          Promise.all([
            createItem(win, paladinId, {
              name: "Canalisation divine (Paladin)",
              type: "feature",
              system: { class: "paladin", level: 3, activation: "action", uses: { max: 1, value: 1, recharge: "shortRest" } }
            }),
            createItem(win, paladinId, {
              name: "Traque implacable",
              type: "feature",
              system: { class: "paladin", subclass: "vengeance", level: 3, activation: "bonusAction", costsResource: "Canalisation divine (Paladin)", grantsCondition: "hunted" }
            }),
            createItem(win, paladinId, {
              name: "Test Paladin Weapon",
              type: "weapon",
              system: { equipped: true, weaponType: "meleeMartial", damage: { dice: "8", type: "slashing" } }
            })
          ])
        );
      });
    cy.window()
      .then((win) => createActor(win, { name: "Non Paladin Caster", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        otherCasterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, otherCasterId, {
            name: "Test Attack Cantrip",
            type: "spell",
            system: { classes: ["wizard"], level: 0, attack: true, damage: { dice: "6", type: "force" } }
          })
        );
      });
    cy.window()
      .then((win) => createActor(win, { name: "Other Attacker NPC", type: "npc", system: { attacks: [{ ability: "str", bonus: 5, damage: { dice: "8", bonus: 0, type: "piercing" } }] } }))
      .then((actor) => {
        attackerNpcId = actor.id;
      });
    cy.window()
      .then((win) => createActor(win, { name: "Relentless Hunter Quarry 2", type: "npc", system: { attributes: { hp: { value: 50, max: 50 } } } }))
      .then((actor) => {
        quarryId = actor.id;
        return cy.window().then((win) => createToken(win, quarryId, 1200, 1000));
      })
      .then((tokenId) => {
        quarryTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  function markQuarryHunted() {
    // Vrai bouton, qui pose le flag propriétaire.
    targetToken(quarryTokenId);
    cy.window().then((win) => win.game.actors.get(paladinId).sheet.render(true));
    cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
    goToTab("abilities");
    withItemId(paladinId, "Traque implacable", (itemId) => {
      sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="grantFeatureCondition"]`).click();
    });
    cy.window().should((win) => {
      expect(win.canvas.tokens.get(quarryTokenId).actor.statuses.has("hunted"), "cible marquée Traquée").to.be.true;
    });
    cy.window().then((win) => win.game.actors.get(paladinId).sheet.close());
    cy.window().then((win) =>
      win.game.actors
        .get(paladinId)
        .items.find((i) => i.name === "Canalisation divine (Paladin)")
        .update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 1 })))
    );
  }

  it("attaquant tiers (PNJ) contre la cible Traquée : désavantage (2d20kl1) (T-TIERC-HUNT-003)", () => {
    markQuarryHunted();
    targetToken(quarryTokenId);
    cy.window().then((win) => win.game.actors.get(attackerNpcId).sheet.render(true));
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "désavantage : attaquant tiers contre la cible Traquée").to.include("2d20kl1");
    });
    cy.window().then((win) => win.game.actors.get(attackerNpcId).sheet.close());
  });

  it("le Paladin qui a désigné la cible l'attaque lui-même (arme) : PAS de désavantage (1d20) (T-TIERC-HUNT-004)", () => {
    markQuarryHunted();
    targetToken(quarryTokenId);
    cy.window().then((win) => win.game.actors.get(paladinId).sheet.render(true));
    cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
    goToTab("equipment");
    resetMessageBaseline();
    sheetRoot().find(".equipment-slot").eq(0).find(".equipment-roll-btn-attack").click();
    lastMessage().then((roll) => {
      expect(roll.formula, "aucun désavantage : le Paladin est exempté sur sa propre proie").to.match(/^1d20/);
    });
    cy.window().then((win) => win.game.actors.get(paladinId).sheet.close());
  });

  it("PJ tiers (sort à jet d'attaque) contre la cible Traquée : désavantage (2d20kl1) (T-TIERC-HUNT-005)", () => {
    markQuarryHunted();
    targetToken(quarryTokenId);
    cy.window().then((win) => win.game.actors.get(otherCasterId).sheet.render(true));
    cy.get(".application.character input.actor-name", { timeout: 15000 }).should("be.visible");
    goToTab("abilities");
    resetMessageBaseline();
    withItemId(otherCasterId, "Test Attack Cantrip", (itemId) => {
      sheetRoot().find(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
    });
    lastMessage().then((roll) => {
      expect(roll.formula, "désavantage : sort d'attaque d'un PJ tiers contre la cible Traquée").to.include("2d20kl1");
    });
    cy.window().then((win) => win.game.actors.get(otherCasterId).sheet.close());
  });

  it("état \"Traqué\" posé À LA MAIN (onglet États, sans le bouton) : aucun désavantage automatique (T-TIERC-HUNT-006)", () => {
    // Retire le flag laissé par les tests précédents.
    cy.window().then((win) => win.canvas.tokens.get(quarryTokenId).actor.unsetFlag("dnd-custom-ai", "huntedByActorId"));
    cy.window().then((win) => win.canvas.tokens.get(quarryTokenId).actor.toggleStatusEffect("hunted", { active: true }));
    cy.window().should((win) => {
      expect(win.canvas.tokens.get(quarryTokenId).actor.getFlag("dnd-custom-ai", "huntedByActorId"), "aucun flag posé manuellement").to.be.undefined;
    });
    targetToken(quarryTokenId);
    cy.window().then((win) => win.game.actors.get(attackerNpcId).sheet.render(true));
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "Traqué sans flag propriétaire : pas de désavantage automatique").to.match(/^1d20/);
    });
    cy.window().then((win) => win.game.actors.get(attackerNpcId).sheet.close());
    cy.window().then((win) => win.canvas.tokens.get(quarryTokenId).actor.toggleStatusEffect("hunted", { active: false }));
  });
});
