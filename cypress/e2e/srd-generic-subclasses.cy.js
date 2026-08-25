// Implémente 3 des "12 sous-classes SRD génériques" (les seules encore à zéro mécanique avant
// cette session, cf. ANOMALIES_ACTIVES.md) — revue de conception du 2026-08-23, choisi au cas
// par cas avec l'utilisateur (Champion/Lore/Evocation implémentés, Thief laissé texte pur faute
// de mécanisme trouvé — action économie/déplacement non trackés, comme Doigts agiles/Escalade
// experte le documentent désormais).
//
// - Champion (Guerrier) — Critique amélioré : nouveau `criticalThreshold` sur `rollCheck`
//   (rolls.js), calculé par `improvedCriticalThreshold` (actor-sheet.js, hasFeature) — critique
//   dès 19 au lieu de 20 seul, réutilise tout le pipeline critique existant (doublement des dés).
// - Lore (Barde) — Mots cinglants : même schéma que Disciplines élémentaires (chantier des 9
//   riders différés) — `requiresRoll`+`rollFormula` (1d6) et `costsResource: "Inspiration
//   bardique"`, deux boutons séparés.
// - Evocation (Magicien) — Sculpteur de sorts : nouveau helpers/sculpt-spells.js
//   (chooseSculptSpellsTarget), même convention Maj-clic que Sort Prudent (Métamagie) mais
//   gratuit — approximation assumée avec l'utilisateur (s'applique à TOUT sort à sauvegarde du
//   Magicien, pas seulement aux sorts d'évocation ; un seul allié protégé par lancer).

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

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

function createItem(win, actorId, data) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(data))]);
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
        formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, ""),
        flavor: message.flavor,
        content: message.content
      };
    });
}

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

let fighterId;
let bardId;
let wizardId;

before(() => {
  cy.loginAsPlayer();

  cy.createReadyCharacter({ name: "Champion Fighter", origin: "fleuraine", classKey: "fighter", skills: ["athletics", "intimidation"] }).then(
    (id) => {
      fighterId = id;
      createdActorIds.push(id);
      cy.window().then((win) => grantCompendiumItem(win, id, "capacites", "Critique amélioré"));
    }
  );
  cy.window().then((win) => win.game.actors.get(fighterId)?.sheet?.close());

  cy.createReadyCharacter({ name: "Lore Bard", origin: "ravenmoor", classKey: "bard", skills: ["performance", "persuasion", "deception"] }).then(
    (id) => {
      bardId = id;
      createdActorIds.push(id);
      cy.window().then((win) =>
        Promise.all([
          grantCompendiumItem(win, id, "capacites", "Inspiration bardique"),
          createItem(win, id, {
            name: "Mots cinglants",
            type: "feature",
            system: {
              class: "bard",
              level: 3,
              requiresRoll: true,
              rollFormula: "1d6",
              costsResource: "Inspiration bardique"
            }
          })
        ])
      );
    }
  );
  cy.window().then((win) => win.game.actors.get(bardId)?.sheet?.close());

  cy.createReadyCharacter({ name: "Evocation Wizard", origin: "ashar", classKey: "wizard", skills: ["arcana", "history"] }).then(
    (id) => {
      wizardId = id;
      createdActorIds.push(id);
      cy.window().then((win) =>
        Promise.all([
          grantCompendiumItem(win, id, "capacites", "Sculpteur de sorts"),
          win.game.actors.get(id).createEmbeddedDocuments("Item", [
            win.JSON.parse(
              win.JSON.stringify({
                name: "Test Sculpt Spell",
                type: "spell",
                system: { classes: ["wizard"], level: 1, save: { ability: "con", halfOnSave: false } }
              })
            )
          ])
        ])
      );
      // Emplacement de niveau 1 nécessaire pour lancer le sort de test ci-dessus (#onCastSpell
      // consomme un emplacement avant même d'atteindre la branche sauvegarde/Sculpteur de sorts).
      cy.window().then((win) => updateActor(win, win.game.actors.get(id), { "system.spells.slots.1.value": 10 }));
    }
  );
  cy.window().then((win) => win.game.actors.get(wizardId)?.sheet?.close());

  // Combat + Combattant pour le Guerrier (criticalRules n'agit qu'en combat actif, cf.
  // rolls.js > isActorInCombat) — même pattern que combat-criticals.cy.js.
  cy.loginAsGM();
  cy.window().then((win) =>
    win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
      createdCombatIds.push(combat.id);
      return combat.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId: fighterId, initiative: 10 }])));
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

describe("Champion — Critique amélioré (seuil de critique 19-20)", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("19 naturel touche automatiquement et double les dés de dégâts (sans la Capacité, 19 serait un jet normal)", () => {
    createTarget("Champion Target High AC", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      cy.forceD20(19);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.localize("DND_CUSTOM.Roll.CriticalHit"))
        .then((crit) => {
          lastMessage().then((message) => {
            expect(message.flavor, "19 naturel traité comme critique (Critique amélioré)").to.include(crit);
          });
        });

      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click();
      lastMessage().then((message) => {
        expect(message.formula, "dés doublés (2d10)").to.include("2d10");
      });
    });
  });
});

describe("Lore — Mots cinglants (dé d'Inspiration bardique + décompte séparé)", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("bouton de jet (1d6) + bouton Inspiration bardique décompte la réserve", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(bardId).items.find((i) => i.name === "Inspiration bardique"), { "system.uses.value": 3 }));
    cy.openActorSheet(bardId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(bardId, "Mots cinglants", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "1d6").to.equal("1d6");
      });

      cy.get(`li[data-item-id="${itemId}"] button[data-action="useResourceTechnique"]`).click();
      cy.window().should((win) => {
        const inspiration = win.game.actors.get(bardId).items.find((i) => i.name === "Inspiration bardique");
        expect(inspiration.system.uses.value, "1 point d'Inspiration bardique décompté").to.equal(2);
      });
    });
  });
});

describe("Evocation — Sculpteur de sorts (Maj-clic, réussite automatique gratuite)", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("Maj-clic sur Lancer : la cible ciblée réussit automatiquement, aucune réserve dépensée", () => {
    let targetActorId;
    let targetTokenId;
    cy.loginAsGM();
    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "Sculpt Target", type: "npc", system: {} }))))
      .then((actor) =>
        cy.window().then((win) =>
          actor
            .getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 350, y: 350 })))
            .then((tokenDoc) =>
              win.canvas.scene
                .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))])
                .then((tokens) => {
                  targetActorId = actor.id;
                  targetTokenId = tokens[0].id;
                  createdActorIds.push(actor.id);
                  createdSceneItemIds.push(tokens[0].id);
                })
            )
        )
      );

    cy.loginAsPlayer();
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    cy.window().should((win) => {
      const actor = win.game.actors.get(wizardId);
      expect(actor.items.find((i) => i.name === "Sculpteur de sorts"), "Capacité présente sur l'Actor").to.exist;
      expect(win.game.user.targets.size, "une seule cible ciblée").to.equal(1);
    });
    cy.forceD20(1); // si Sculpteur de sorts ne fonctionnait pas, un 1 naturel échouerait forcément
    resetMessageBaseline();
    withItemId(wizardId, "Test Sculpt Spell", (itemId) => {
      cy.get(`.application.character li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click({ shiftKey: true });
    });

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Roll.SculptSpellsSuccess", { name: "Sculpt Target", spell: "Test Sculpt Spell" }))
      .then((expected) => {
        lastMessage().then((message) => {
          expect(message.content).to.include(expected);
        });
      });
  });
});
