// Chantier "Niveau A" (2026-08-24, sur demande explicite de l'utilisateur suite à la revue des
// mécaniques encore en texte brut) : automatise 6 Capacités isolées, chacune réutilisant un
// mécanisme déjà en place ailleurs dans ce système —
// - Indomptable (Guerrier 9) : relance de sauvegarde, même famille que Chanceux/Chance du
//   Fiélon (flags luckRoll/luckActorId, rolls.js) mais réservée aux sauvegardes
//   (flag savingThrowRoll) et résultat obligatoirement conservé.
// - Critique brutal (Barbare 9) : dé de dégâts supplémentaire sur un critique à l'arme de corps
//   à corps (rollDamage#criticalMultiplier, 3 au lieu de 2).
// - Instinct sauvage (Barbare 7) : avantage à l'Initiative, via un nouveau
//   character-data.js#attributes.initiativeDice consommé par la formule d'initiative de
//   system.json (2 = avantage, 1 = normal — kh1 sur un seul dé étant un no-op).
// - Affinité de la tempête (Ensorceleur Tempête 1) : résistance passive foudre/tonnerre,
//   généralisation de isResistantToDamageType (dnd-custom-ai.js), même mécanisme que Résilience
//   draconique.
// - Affinité élémentaire (Ensorceleur Draconique 6) : modificateur de Charisme ajouté au jet de
//   dégâts d'un sort dont le type correspond au lignage choisi (#onRollSpellDamage).
// - Forme sauvage de combat (Cercle de la Lune, Druide 2) : PV temporaires (2×niveau) posés sur
//   la Forme à l'entrée en Forme sauvage — nouveau NpcData#attributes.hp.temp.

const createdActorIds = [];
const createdCombatIds = [];
const createdSceneItemIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

const MAIN_HAND = 0;
function equipmentSlotEl(index) {
  return sheetRoot().find(".equipment-slot").eq(index);
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

function createItem(win, actorId, data) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(data))]);
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
        content: message.content,
        flavor: message.flavor,
        formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, ""),
        total: message.rolls?.[0]?.total
      };
    });
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Indomptable — relance de jet de sauvegarde", () => {
  let fighterId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Indomitable Fighter", origin: "fleuraine", classKey: "fighter", skills: ["athletics", "intimidation"] }).then(
      (id) => {
        fighterId = id;
        createdActorIds.push(id);
      }
    );
    cy.window().then((win) => grantCompendiumItem(win, fighterId, "capacites", "Indomptable"));
  });

  beforeEach(() => cy.loginAsPlayer());

  it("le bouton de relance apparaît sur un jet de sauvegarde, consomme une charge (T-TIERA-INDOM-001)", () => {
    cy.openActorSheet(fighterId);
    goToTab("stats");
    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollSave"][data-key="wis"]').click();
    lastMessage();

    cy.window().then((win) => win.game.actors.get(fighterId).sheet.close());
    cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
    cy.get(".chat-message", { timeout: 10000 }).last().find(".dnd-spend-luck-btn").should("be.visible").click();
    cy.window().should((win) => {
      const feat = win.game.actors.get(fighterId).items.find((i) => i.name === "Indomptable");
      expect(feat.system.uses.value, "charge consommée").to.equal(0);
    });
    cy.window().then((win) => {
      const message = win.game.messages.contents.at(-1);
      expect(message.flavor, "message de relance posté").to.include(
        win.game.i18n.format("DND_CUSTOM.Chat.IndomitableReroll", { name: win.game.actors.get(fighterId).name })
      );
    });
  });
});

describe("Critique brutal — dé de dégâts supplémentaire sur un critique à l'arme de corps à corps", () => {
  let barbarianId;
  let weaponId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Brutal Critical Barbarian", origin: "fleuraine", classKey: "barbarian", skills: ["athletics", "intimidation"] }).then(
      (id) => {
        barbarianId = id;
        createdActorIds.push(id);
      }
    );
    cy.window().then((win) => grantCompendiumItem(win, barbarianId, "capacites", "Critique brutal"));
  });

  beforeEach(() => cy.loginAsPlayer());

  it("critique à l'arme de corps à corps équipée : 3× les dés au lieu de 2× (T-TIERA-BRUTAL-001)", () => {
    cy.window().then((win) => {
      const weapon = win.game.actors.get(barbarianId).items.find((i) => i.type === "weapon" && i.system.equipped);
      expect(weapon, "arme équipée en Main principale (contenu de départ du Guerrier/Barbare)").to.exist;
      expect(weapon.system.weaponType, "arme de corps à corps").to.match(/^melee/);
      weaponId = weapon.id;
      return weapon.setFlag("dnd-custom-ai", "pendingCritical", true);
    });
    cy.openActorSheet(barbarianId);
    goToTab("equipment");
    resetMessageBaseline();
    equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click();
    lastMessage().then((roll) => {
      expect(roll.formula, "3 dés (Critique brutal) plutôt que 2").to.match(/^3d\d+/);
    });
  });
});

describe("Instinct sauvage — avantage aux jets d'Initiative", () => {
  let barbarianId;
  let barbarianTokenId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Feral Instinct Barbarian", origin: "fleuraine", classKey: "barbarian", skills: ["athletics", "intimidation"] }).then(
      (id) => {
        barbarianId = id;
        createdActorIds.push(id);
      }
    );

    cy.loginAsGM();
    cy.window()
      .then((win) => createToken(win, barbarianId, 100, 100))
      .then((tokenId) => {
        barbarianTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  function rollInitiativeAndGetFormula() {
    resetMessageBaseline();
    cy.window()
      .then((win) =>
        win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
          createdCombatIds.push(combat.id);
          return combat
            .createEmbeddedDocuments(
              "Combatant",
              win.JSON.parse(win.JSON.stringify([{ actorId: barbarianId, tokenId: barbarianTokenId }]))
            )
            .then((combatants) => combat.rollInitiative([combatants[0].id]));
        })
      )
      .then(() => cy.window().then((win) => win.Combat.deleteDocuments(createdCombatIds.splice(0))));
    return lastMessage();
  }

  it("sans la Capacité : formule d'Initiative en (1)d20kh1 (normal) (T-TIERA-INSTINCT-001)", () => {
    rollInitiativeAndGetFormula().then((roll) => {
      expect(roll.formula, "aucun avantage sans la Capacité").to.not.include("(2)d20kh1");
      expect(roll.formula, "formule normale").to.include("(1)d20kh1");
    });
  });

  it("avec la Capacité : formule d'Initiative en (2)d20kh1 (avantage) (T-TIERA-INSTINCT-002)", () => {
    cy.window().then((win) => grantCompendiumItem(win, barbarianId, "capacites", "Instinct sauvage"));
    rollInitiativeAndGetFormula().then((roll) => {
      expect(roll.formula, "avantage : (2)d20kh1").to.include("(2)d20kh1");
    });
  });
});

describe("Affinité de la tempête — résistance passive foudre/tonnerre", () => {
  let attackerId;
  let sorcererId;
  let sorcererTokenId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Storm Affinity Sorcerer", origin: "fleuraine", classKey: "sorcerer", skills: ["arcana", "persuasion"] }).then(
      (id) => {
        sorcererId = id;
        createdActorIds.push(id);
      }
    );
    cy.window().then((win) => grantCompendiumItem(win, sorcererId, "capacites", "Affinité de la tempête"));

    // PNJ (pas un second "character") : dnd-custom-ai.js > applyDamageToTargets bloque
    // volontairement tout dégât d'un "character" vers un AUTRE "character" (PvP bloqué,
    // toujours actif, y compris pour le MJ) — piège rencontré en testant avec un attaquant
    // "character", les dégâts n'étaient jamais appliqués. Un PNJ n'est jamais concerné par ce
    // blocage.
    cy.loginAsGM();
    cy.window()
      .then((win) =>
        win.Actor.create(
          win.JSON.parse(
            win.JSON.stringify({ name: "Storm Attacker", type: "npc", system: { attack: { ability: "str", bonus: 5, damage: { dice: "10", bonus: 0, type: "lightning" } } } })
          )
        )
      )
      .then((actor) => {
        attackerId = actor.id;
        createdActorIds.push(attackerId);
      });
    cy.window()
      .then((win) => createToken(win, sorcererId, 100, 100))
      .then((tokenId) => {
        sorcererTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("dégâts de foudre reçus : réduits de moitié automatiquement (T-TIERA-STORM-001)", () => {
    let hpBefore;
    cy.window().then((win) => {
      hpBefore = win.game.actors.get(sorcererId).system.attributes.hp.value;
    });
    cy.window().then((win) => win.game.actors.get(attackerId).sheet.render(true));
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    targetToken(sorcererTokenId);
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    cy.get('button[data-action="rollAttackDamage"]').click();
    lastMessage().then((roll) => {
      const rolledTotal = roll.total;
      cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(".chat-message", { timeout: 10000 }).last().find("button.dnd-apply-damage-btn").click();
      cy.window().should((win) => {
        expect(win.game.actors.get(sorcererId).system.attributes.hp.value, "résistant : moitié des dégâts subie").to.equal(
          hpBefore - Math.floor(rolledTotal / 2)
        );
      });
    });
  });
});

describe("Affinité élémentaire — bonus de Charisme aux dégâts d'un sort du type du lignage", () => {
  let sorcererId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Elemental Affinity Sorcerer", origin: "fleuraine", classKey: "sorcerer", skills: ["arcana", "persuasion"] }).then(
      (id) => {
        sorcererId = id;
        createdActorIds.push(id);
      }
    );
    cy.window().then((win) =>
      Promise.all([
        grantCompendiumItem(win, sorcererId, "capacites", "Affinité élémentaire"),
        createItem(win, sorcererId, {
          name: "Test Fire Bolt",
          type: "spell",
          system: { classes: ["sorcerer"], level: 0, attack: true, damage: { dice: "10", type: "fire" } }
        })
      ])
    );
    cy.window().then((win) =>
      updateActor(
        win,
        win.game.actors.get(sorcererId),
        { "system.abilities.cha.value": 16, "system.combat.draconicResistanceType": "fire" },
        { dndCustomWizard: true }
      )
    );
  });

  beforeEach(() => cy.loginAsPlayer());

  it("sort de type feu (lignage choisi) : modificateur de Charisme ajouté aux dégâts (T-TIERA-ELEMENTAL-001)", () => {
    cy.openActorSheet(sorcererId);
    goToTab("abilities");
    withItemId(sorcererId, "Test Fire Bolt", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
    });
    withItemId(sorcererId, "Test Fire Bolt", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
    });
    cy.window().then((win) => {
      const chaMod = win.game.actors.get(sorcererId).system.abilities.cha.mod;
      lastMessage().then((roll) => {
        expect(roll.total, `10 + mod. de Charisme (${chaMod})`).to.equal(10 + chaMod);
      });
    });
  });
});

describe("Forme sauvage de combat — PV temporaires à la transformation", () => {
  let druidId;
  let wolfFormId;
  let wolfFormTokenId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Combat Wild Shape Druid", origin: "fleuraine", classKey: "druid", skills: ["nature", "survival"] }).then((id) => {
      druidId = id;
      createdActorIds.push(id);
    });
    // "Forme sauvage"/"Forme sauvage de combat" requièrent le niveau 2 (grantClassContent) :
    // Items créés directement plutôt que de faire monter de niveau ce personnage de test level 1
    // (même pattern que wild-shape.cy.js).
    cy.window().then((win) =>
      Promise.all([
        createItem(win, druidId, {
          name: "Forme sauvage",
          type: "feature",
          system: { class: "druid", level: 2, activation: "bonusAction", entersWildShape: true, uses: { max: 2, value: 2, recharge: "shortRest" } }
        }),
        grantCompendiumItem(win, druidId, "capacites", "Forme sauvage de combat")
      ])
    );

    cy.loginAsGM();
    cy.window()
      .then((win) =>
        win.Actor.create(
          win.JSON.parse(win.JSON.stringify({ name: "Combat Wolf Form", type: "wildShapeForm", system: { size: "m", creatureType: "beast", attributes: { hp: { value: 11, max: 11 } } } }))
        )
      )
      .then((actor) => {
        wolfFormId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) => createToken(win, wolfFormId, 400, 400));
      })
      .then((tokenId) => {
        wolfFormTokenId = tokenId;
      });
  });

  // En session MJ (pas Joueur) : requestActorUpdate (helpers/actor-relay.js) relaie une mise à
  // jour non autorisée au MJ ACTIF via socket, qui suppose un vrai second client MJ connecté en
  // parallèle — impossible à simuler avec le navigateur Cypress unique de cette suite (cy.
  // loginAsPlayer()/loginAsGM() rechargent la page, une seule session à la fois). En session MJ,
  // requestActorUpdate emprunte son chemin direct (actor.isOwner toujours vrai) : valide la
  // logique/le calcul, pas le relais socket lui-même (déjà utilisé ailleurs dans ce système).
  beforeEach(() => cy.loginAsGM());

  it("prendre forme avec la Capacité : PV temporaires = 2×niveau posés sur la Forme (T-TIERA-MOONWILD-001)", () => {
    cy.openActorSheet(druidId);
    goToTab("abilities");
    targetToken(wolfFormTokenId);
    withItemId(druidId, "Forme sauvage", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="enterWildShape"]`).click();
    });
    // Token de Forme non lié (actorLink: false par défaut pour un type autre que "character") :
    // son Actor SYNTHÉTIQUE (canvas.tokens.get(id).actor) est distinct de game.actors.get(id),
    // même piège déjà documenté pour Repousser les morts-vivants/Tactiques défensives.
    cy.window().should((win) => {
      const level = win.game.actors.get(druidId).system.attributes.level;
      expect(win.canvas.tokens.get(wolfFormTokenId).actor.system.attributes.hp.temp, "PV temporaires = 2×niveau").to.equal(2 * level);
    });
  });
});
