// Chantier "Suivi de l'action/action bonus dans le tour" (2026-08-23) — cadrage avec
// l'utilisateur (ANOMALIES_ACTIVES.md) : suivi NON-bloquant (rappel de chat, jamais de jet
// refusé, contrairement à la réaction), périmètre élargi aux jets d'attaque à l'arme (pas
// seulement Capacités/Sorts à activation explicite), et ACTIF UNIQUEMENT EN COMBAT (retour de
// l'utilisateur : même garde que criticalRules, cf. isActorInActiveCombat, helpers/
// action-economy.js) — les deux Actors de test sont donc Combattants d'un vrai Combat actif dès
// le before() ci-dessous, sans quoi aucune consommation/aucun rappel ne se déclenche jamais.
//
// La régénération au début du tour propre (hooks updateCombat/deleteCombat) est déjà couverte
// par combat-tracker.cy.js > T-COMBAT-002 (étendu à actionAvailable/bonusActionAvailable en
// même temps que reactionAvailable) — ce spec couvre le comportement propre à ce chantier :
// rappel non-bloquant EN combat, silence total HORS combat, exemption Attaque supplémentaire,
// libellé Action bonus.

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

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
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

// Un jet d'attaque poste son propre message, PUIS (chantier de ce spec) éventuellement le rappel
// non-bloquant : il faut chercher dans TOUS les nouveaux messages, pas juste le dernier (même
// piège que sentinel-mounted-combat.cy.js).
let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function newMessages() {
  return cy.window().then((win) => win.game.messages.contents.slice(knownMessageCount));
}
function expectMessageContaining(expectedText) {
  return cy.window({ timeout: 10000 }).should((win) => {
    const messages = win.game.messages.contents.slice(knownMessageCount);
    const found = messages.some((message) => (message.content ?? "").includes(expectedText) || (message.flavor ?? "").includes(expectedText));
    expect(found, `un message contenant "${expectedText}" doit apparaître parmi ${messages.length} nouveau(x) message(s)`).to.be.true;
  });
}
// Construit le texte de rappel attendu à partir du libellé RÉELLEMENT localisé de
// DND_CUSTOM.Item.ActivationTypes.<activation> (cf. helpers/action-economy.js/config.js) plutôt
// qu'une chaîne figée en dur dans ce spec — l'instance Docker de test peut tourner dans une
// locale différente du français (piège déjà rencontré sur d'autres specs, cf.
// project_docker_e2e_testing_setup.md), un libellé codé en dur y aurait échoué à tort.
function expectedActionEconomyReminder(name, activation) {
  return cy.window().then((win) =>
    win.game.i18n.format("DND_CUSTOM.Chat.ActionEconomyReminder", {
      name,
      action: win.game.i18n.localize(`DND_CUSTOM.Item.ActivationTypes.${activation}`)
    })
  );
}

function expectNoMessageContaining(unexpectedText) {
  return cy.wait(1000).then(() =>
    newMessages().then((messages) => {
      const found = messages.some((message) => (message.content ?? "").includes(unexpectedText) || (message.flavor ?? "").includes(unexpectedText));
      expect(found, `aucun message ne doit contenir "${unexpectedText}" (${messages.length} nouveau(x) message(s))`).to.be.false;
    })
  );
}

let fighterId;
let extraAttackFighterId;
let outOfCombatFighterId;

before(() => {
  cy.loginAsPlayer();

  cy.createReadyCharacter({
    name: "Action Economy Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    fighterId = id;
    createdActorIds.push(id);
  });

  cy.createReadyCharacter({
    name: "Action Economy Extra Attack Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    extraAttackFighterId = id;
    createdActorIds.push(id);
    cy.window().then((win) => grantCompendiumItem(win, id, "capacites", "Attaque supplémentaire (Guerrier)"));
  });

  cy.createReadyCharacter({
    name: "Action Economy Out Of Combat Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    outOfCombatFighterId = id;
    createdActorIds.push(id);
  });

  // Suivi actif UNIQUEMENT en combat (cf. isActorInActiveCombat, helpers/action-economy.js) :
  // seuls fighterId/extraAttackFighterId sont Combattants — outOfCombatFighterId reste en dehors
  // délibérément, pour le test "hors combat" ci-dessous.
  cy.loginAsGM();
  cy.window().then((win) =>
    win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
      createdCombatIds.push(combat.id);
      return combat.createEmbeddedDocuments(
        "Combatant",
        win.JSON.parse(
          win.JSON.stringify([
            { actorId: fighterId, initiative: 10 },
            { actorId: extraAttackFighterId, initiative: 5 }
          ])
        )
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

describe("Suivi de l'action du tour — jets d'attaque à l'arme", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("premier jet d'attaque du tour : aucun rappel, Action marquée consommée", () => {
    createTarget("Action Economy Target 1", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId), { "system.combat.actionAvailable": true }, { dndCustomWizard: true })
      );
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window({ timeout: 10000 })
        .should((win) => {
          expect(win.game.messages.size, "le jet d'attaque poste un message").to.be.greaterThan(knownMessageCount);
        })
        .then((win) => {
          expect(win.game.messages.size - knownMessageCount, "un seul message (le jet), aucun rappel").to.equal(1);
          expect(win.game.actors.get(fighterId).system.combat.actionAvailable, "Action désormais consommée").to.be.false;
        });
    });
  });

  it("second jet d'attaque du même tour : rappel de chat non-bloquant, le jet se fait quand même", () => {
    createTarget("Action Economy Target 2", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId), { "system.combat.actionAvailable": false }, { dndCustomWizard: true })
      );
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      expectedActionEconomyReminder("Action Economy Fighter", "action").then((expected) => expectMessageContaining(expected));
    });
  });

  it("Attaque supplémentaire : deux jets d'attaque consécutifs, aucun rappel", () => {
    createTarget("Action Economy Target 3", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(extraAttackFighterId), { "system.combat.actionAvailable": true }, { dndCustomWizard: true })
      );
      cy.openActorSheet(extraAttackFighterId);
      goToTab("equipment");
      targetToken(tokenId);

      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.game.messages.size).to.be.greaterThan(knownMessageCount);
        expect(win.game.actors.get(extraAttackFighterId).system.combat.actionAvailable, "Action consommée dès le 1er jet").to.be.false;
      });

      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.game.messages.size, "le 2e jet d'attaque poste bien son propre message").to.be.greaterThan(knownMessageCount);
      });
      expectedActionEconomyReminder("Action Economy Extra Attack Fighter", "action").then((unexpected) =>
        expectNoMessageContaining(unexpected)
      );
    });
  });
});

describe("Hors combat — aucun suivi, aucun rappel", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("jet d'attaque à l'arme hors combat : aucun rappel, Action jamais consommée", () => {
    createTarget("Action Economy Target Out Of Combat", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.window().then((win) =>
        updateActor(
          win,
          win.game.actors.get(outOfCombatFighterId),
          { "system.combat.actionAvailable": false },
          { dndCustomWizard: true }
        )
      );
      cy.openActorSheet(outOfCombatFighterId);
      goToTab("equipment");
      resetMessageBaseline();
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window({ timeout: 10000 })
        .should((win) => {
          expect(win.game.messages.size, "le jet d'attaque poste un message").to.be.greaterThan(knownMessageCount);
        })
        .then((win) => {
          expect(win.game.messages.size - knownMessageCount, "un seul message (le jet), aucun rappel hors combat").to.equal(1);
          expect(
            win.game.actors.get(outOfCombatFighterId).system.combat.actionAvailable,
            "hors combat, la valeur n'est jamais touchée par ce suivi"
          ).to.be.false;
        });
    });
  });
});

describe("Suivi de l'Action bonus du tour — Capacité 'Second souffle' (Guerrier)", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("Action bonus déjà consommée : rappel de chat au libellé 'Action bonus', la Capacité s'utilise quand même", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(fighterId), { "system.combat.bonusActionAvailable": false }, { dndCustomWizard: true })
    );
    cy.openActorSheet(fighterId);
    goToTab("abilities");

    withItemId(fighterId, "Second souffle", (itemId) => {
      // Second souffle est octroyé automatiquement à la création du personnage (grantClassContent)
      // DEPUIS le compendium persistant de cette instance Docker, jamais mis à jour rétroactivement
      // par un changement de world-items/features.json (piège déjà documenté, cf.
      // deferred-rider-spells.cy.js) — `system.activation: "bonusAction"` a été ajouté à cette
      // Capacité dans ce même chantier, donc réglé ici directement sur CET exemplaire pour tester
      // le comportement à jour sans dépendre d'un réimport de compendium. Recharge aussi la charge
      // au cas où un test précédent l'aurait consommée (reproductibilité isolée). `preUpdateItem`
      // (dnd-custom-ai.js) efface tout `system.*` d'une Capacité venant d'un non-MJ sauf
      // `uses.value` : cette correction doit donc passer par une session MJ, jamais Joueur.
      cy.loginAsGM();
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId).items.get(itemId), {
          "system.activation": "bonusAction",
          "system.uses.value": 1
        })
      );
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("abilities");

      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();

      expectedActionEconomyReminder("Action Economy Fighter", "bonusAction").then((expected) =>
        expectMessageContaining(expected)
      );
    });
  });
});
