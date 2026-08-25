// Chantier "8 sous-classes déjà à ≥1 mécanique" (2026-08-23) — cadrage au cas par cas avec
// l'utilisateur (ANOMALIES_ACTIVES.md). Couvre les 6 mécaniques neuves de ce chantier (Fiend
// était déjà complète, Sorts de cercle laissé en texte) :
// - Disciple de la vie (Life, Clerc) : bonus de soin automatique.
// - Résilience draconique (Draconic, Ensorceleur) : CA sans armure + choix + résistance aux
//   dégâts (première résistance modélisée dans ce système).
// - Tueur de géants (Hunter, Rôdeur) : rappel de réaction (même schéma que Sentinelle).
// - Rage sans esprit (Berserker, Barbare) : immunité Charmé/Effrayé en Rage (première immunité
//   à une condition modélisée dans ce système).
// - Aura de dévotion (Devotion, Paladin) : même immunité, en zone (3 m).
// - Technique de la Main Ouverte (Open Hand, Moine) : choix d'effet + jet de sauvegarde.
// - Tactiques défensives (Hunter, Rôdeur) : choix ponctuel enregistré, bonus PAS appliqué
//   automatiquement (limite d'architecture assumée, cf. sa description) — seul l'enregistrement
//   du choix est testé ici.
//
// Tout géré en session MJ de bout en bout (même convention que sentinel-mounted-combat.cy.js) :
// aucune de ces mécaniques ne dépend d'une session Joueur spécifique. Actors créés directement
// (`Actor.create`, jamais l'assistant de création) avec juste les champs system.* nécessaires —
// plus léger, pas besoin d'un personnage "prêt" complet pour ces tests ciblés. Les 3 Items de
// Capacité touchés par un champ neuf ce chantier (grantsChoice sur Résilience draconique/
// Tactiques défensives, offersOpenHandTechnique sur Technique de la Main Ouverte) sont créés
// DIRECTEMENT plutôt que depuis le compendium, qui resterait périmé pour eux (piège déjà
// documenté, cf. deferred-rider-spells.cy.js). Les 3 autres (Disciple de la vie/Tueur de géants/
// Rage sans esprit) n'ont reçu aucun champ neuf : accessibles via le compendium réel.

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

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
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
      return { content: message.content, flavor: message.flavor, formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, "") };
    });
}
function expectMessageContaining(expectedText) {
  return cy.window({ timeout: 10000 }).should((win) => {
    const messages = win.game.messages.contents.slice(knownMessageCount);
    const found = messages.some((message) => (message.content ?? "").includes(expectedText) || (message.flavor ?? "").includes(expectedText));
    expect(found, `un message contenant "${expectedText}" doit apparaître parmi ${messages.length} nouveau(x) message(s)`).to.be.true;
  });
}

let originalGrid;

before(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    originalGrid = { distance: win.canvas.scene.grid.distance, units: win.canvas.scene.grid.units, size: win.canvas.scene.grid.size };
    return win.canvas.scene.update(win.JSON.parse(win.JSON.stringify({ grid: { distance: 1.5, units: "m", size: 100 } })));
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [
      win.Actor.deleteDocuments(createdActorIds),
      win.canvas.scene.update(win.JSON.parse(win.JSON.stringify({ grid: originalGrid })))
    ];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Disciple de la vie (Life, Clerc) — bonus de soin automatique", () => {
  beforeEach(() => cy.loginAsGM());

  it("sort de niveau 1 : +2 PV de soin ajoutés à la formule (T-LIFE-001)", () => {
    let actorId;
    cy.window()
      .then((win) => createActor(win, { name: "Life Cleric", type: "character", system: { class: "cleric", abilities: { wis: { value: 10 } } } }))
      .then((actor) => {
        actorId = actor.id;
        return cy.window().then((win) =>
          Promise.all([
            grantCompendiumItem(win, actorId, "capacites", "Disciple de la vie"),
            createItem(win, actorId, { name: "Test Heal Spell", type: "spell", system: { classes: ["cleric"], level: 1, heal: { dice: "1d4" } } })
          ])
        );
      })
      .then(() => {
        // `spells.slots.<n>.max` est dérivé automatiquement (classe/niveau), mais `.value` (charges
        // restantes) reste à son initial (0) tant qu'aucun repos ne l'a réglé — sans ce réglage,
        // #onCastSpell annule silencieusement (aucun emplacement disponible), aucun message posté.
        cy.window().then((win) => updateActor(win, win.game.actors.get(actorId), { "system.spells.slots.1.value": 1 }, { dndCustomWizard: true }));
        cy.openActorSheet(actorId);
        goToTab("abilities");
        withItemId(actorId, "Test Heal Spell", (itemId) => {
          resetMessageBaseline();
          cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
          lastMessage().then((roll) => {
            expect(roll.formula, "1d4 + 2 (Disciple de la vie, palier 1) + 0 (Sagesse neutralisée)").to.equal("1d4+2");
          });
        });
      });
  });
});

describe("Résilience draconique (Draconic, Ensorceleur) — CA, choix, résistance", () => {
  let sorcererId;
  let sorcererTokenId;

  beforeEach(() => cy.loginAsGM());

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Draconic Sorcerer", type: "character", system: { class: "sorcerer" } }))
      .then((actor) => {
        sorcererId = actor.id;
        return cy.window().then((win) =>
          Promise.all([
            createItem(win, sorcererId, {
              name: "Résilience draconique",
              type: "feature",
              system: { class: "sorcerer", subclass: "draconic", level: 1, grantsChoice: "draconicResistanceType" }
            }),
            createToken(win, sorcererId, 500, 500)
          ])
        );
      })
      .then(([, tokenId]) => {
        sorcererTokenId = tokenId;
      });
  });

  it("CA sans armure = 13 + modificateur de Dextérité (T-DRACO-001)", () => {
    cy.window().should((win) => {
      const actor = win.game.actors.get(sorcererId);
      const dexMod = Math.floor((actor.system.abilities.dex.total - 10) / 2);
      expect(actor.system.attributes.ac.value, "CA = 13 + Dex").to.equal(13 + dexMod);
    });
  });

  it("choix du type résisté persisté, bouton verrouillé ensuite (T-DRACO-002)", () => {
    cy.openActorSheet(sorcererId);
    goToTab("abilities");
    withItemId(sorcererId, "Résilience draconique", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="chooseFeatureOption"]`).click();
      cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
      cy.get('dialog.application.dialog input[type="radio"][name="chosenOption"][value="fire"]').check();
      cy.get('dialog.application.dialog button[data-action="ok"]').click();

      cy.window().should((win) => {
        expect(win.game.actors.get(sorcererId).system.combat.draconicResistanceType).to.equal("fire");
      });
      cy.get(`li[data-item-id="${itemId}"] button[data-action="chooseFeatureOption"]`).should("not.exist");
    });
  });

  it("dégâts de feu (type résisté) : moitié appliquée (T-DRACO-003)", () => {
    cy.window()
      .then((win) => createActor(win, { name: "Fire Damage NPC", type: "npc", system: { attacks: [{ ability: "str", damage: { dice: "1d1", bonus: 3, type: "fire" } }] } }))
      .then((npc) => {
        cy.window().then((win) =>
          updateActor(win, win.game.actors.get(sorcererId), { "system.attributes.hp.value": win.game.actors.get(sorcererId).system.attributes.hp.max }, { dndCustomWizard: true })
        );
        cy.openActorSheet(npc.id);
        resetMessageBaseline();
        targetToken(sorcererTokenId);
        cy.get('button[data-action="rollAttackDamage"]').click();
        lastMessage();
        cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
        cy.get(".chat-message").last().find(".dnd-apply-damage-btn").click();

        cy.window().should((win) => {
          const actor = win.game.actors.get(sorcererId);
          expect(actor.system.attributes.hp.value, "4 dégâts de feu réduits à 2 (résistant)").to.equal(actor.system.attributes.hp.max - 2);
        });
      });
  });

  it("dégâts de froid (type non résisté) : totalité appliquée (T-DRACO-004)", () => {
    cy.window()
      .then((win) => createActor(win, { name: "Cold Damage NPC", type: "npc", system: { attacks: [{ ability: "str", damage: { dice: "1d1", bonus: 3, type: "cold" } }] } }))
      .then((npc) => {
        cy.window().then((win) =>
          updateActor(win, win.game.actors.get(sorcererId), { "system.attributes.hp.value": win.game.actors.get(sorcererId).system.attributes.hp.max }, { dndCustomWizard: true })
        );
        cy.openActorSheet(npc.id);
        resetMessageBaseline();
        targetToken(sorcererTokenId);
        cy.get('button[data-action="rollAttackDamage"]').click();
        lastMessage();
        cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
        cy.get(".chat-message").last().find(".dnd-apply-damage-btn").click();

        cy.window().should((win) => {
          const actor = win.game.actors.get(sorcererId);
          expect(actor.system.attributes.hp.value, "4 dégâts de froid appliqués intégralement (pas résistant)").to.equal(actor.system.attributes.hp.max - 4);
        });
      });
  });
});

describe("Tueur de géants (Hunter, Rôdeur) — rappel automatique de réaction", () => {
  let rangerId;
  let rangerTokenId;
  let enemyId;
  let enemyTokenId;

  beforeEach(() => cy.loginAsGM());

  it("un PNJ hostile de taille Grande touche le Rôdeur à 1,50 m : rappel posté (T-GIANTKILLER-001)", () => {
    cy.window().then((win) => (createdCombatIds.length ? win.Combat.deleteDocuments(createdCombatIds.splice(0)) : null));

    cy.window()
      .then((win) => createActor(win, { name: "Giant Killer Ranger", type: "character", system: { class: "ranger" } }))
      .then((actor) => {
        rangerId = actor.id;
      });
    cy.window().then((win) => grantCompendiumItem(win, rangerId, "capacites", "Tueur de géants"));
    cy.window()
      .then((win) => createToken(win, rangerId, 1000, 1000))
      .then((tokenId) => {
        rangerTokenId = tokenId;
      });
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(rangerId), { "system.combat.reactionAvailable": true }, { dndCustomWizard: true })
    );

    cy.window()
      .then((win) => createActor(win, { name: "Giant Enemy", type: "npc", system: { size: "g", attacks: [{ ability: "str", bonus: 5 }] } }))
      .then((actor) => {
        enemyId = actor.id;
      });
    cy.window()
      .then((win) => createToken(win, enemyId, 1060, 1000))
      .then((tokenId) => {
        enemyTokenId = tokenId;
      });
    cy.window().then((win) =>
      win.canvas.tokens
        .get(enemyTokenId)
        .document.update(win.JSON.parse(win.JSON.stringify({ disposition: win.CONST.TOKEN_DISPOSITIONS.HOSTILE })))
    );

    cy.window().then((win) =>
      win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
        createdCombatIds.push(combat.id);
        return combat.createEmbeddedDocuments(
          "Combatant",
          win.JSON.parse(win.JSON.stringify([{ actorId: rangerId, tokenId: rangerTokenId, initiative: 10 }, { actorId: enemyId, initiative: 5 }]))
        );
      })
    );

    cy.then(() => targetToken(rangerTokenId));
    cy.then(() => cy.window().then((win) => win.game.actors.get(enemyId).sheet.render(true)));
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Chat.GiantKillerAvailable", { reactor: "Giant Killer Ranger", attacker: "Giant Enemy" }))
      .then((expected) => expectMessageContaining(expected));
  });
});

describe("Rage sans esprit (Berserker, Barbare) — immunité Charmé/Effrayé en Rage", () => {
  let barbarianId;

  beforeEach(() => cy.loginAsGM());

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Mindless Rage Barbarian", type: "character", system: { class: "barbarian" } }))
      .then((actor) => {
        barbarianId = actor.id;
      });
    cy.window().then((win) => grantCompendiumItem(win, barbarianId, "capacites", "Rage sans esprit"));
  });

  it("bloque une nouvelle application de Charmé/Effrayé pendant la Rage (T-MINDLESS-001)", () => {
    cy.window().then((win) => win.game.actors.get(barbarianId).toggleStatusEffect("raging", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(barbarianId).statuses.has("raging"), "en Rage").to.be.true;
    });

    cy.window().then((win) => win.game.actors.get(barbarianId).toggleStatusEffect("frightened", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(barbarianId).statuses.has("frightened"), "Effrayé bloqué pendant la Rage").to.be.false;
    });

    cy.window().then((win) => win.game.actors.get(barbarianId).toggleStatusEffect("raging", { active: false }));
  });

  it("suspend Charmé déjà actif au moment où la Rage démarre (T-MINDLESS-002)", () => {
    cy.window().then((win) => win.game.actors.get(barbarianId).toggleStatusEffect("charmed", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(barbarianId).statuses.has("charmed"), "Charmé actif hors Rage").to.be.true;
    });

    cy.window().then((win) => win.game.actors.get(barbarianId).toggleStatusEffect("raging", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(barbarianId).statuses.has("charmed"), "Charmé retiré à l'entrée en Rage").to.be.false;
    });

    cy.window().then((win) => win.game.actors.get(barbarianId).toggleStatusEffect("raging", { active: false }));
  });
});

describe("Aura de dévotion (Devotion, Paladin) — immunité Charmé en zone (3 m)", () => {
  let paladinId;
  let allyId;
  let allyTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Devotion Paladin", type: "character", system: { class: "paladin" } }))
      .then((actor) => {
        paladinId = actor.id;
      });
    cy.window().then((win) => grantCompendiumItem(win, paladinId, "capacites", "Aura de dévotion"));
    cy.window()
      .then((win) => createToken(win, paladinId, 1000, 1000))
      .then(() => {});

    cy.window()
      .then((win) => createActor(win, { name: "Devotion Ally", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        allyId = actor.id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("un allié à 2,25 m d'un Paladin conscient est protégé (T-DEVOTION-001)", () => {
    cy.window()
      .then((win) => createToken(win, allyId, 1150, 1000)) // 150 px = 2,25 m
      .then((tokenId) => {
        allyTokenId = tokenId;
      });
    cy.window().then((win) => win.game.actors.get(allyId).toggleStatusEffect("charmed", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(allyId).statuses.has("charmed"), "Charmé bloqué, allié protégé par l'aura").to.be.false;
    });
    // Retiré aussi de createdSceneItemIds (pas seulement supprimé du canvas) : sinon le nettoyage
    // final (after() global) tenterait de le supprimer une 2e fois, "id introuvable" — piège déjà
    // documenté ailleurs (cf. createdCombatIds.splice(0) dans d'autres specs de cette suite).
    cy.window().then((win) => {
      const index = createdSceneItemIds.indexOf(allyTokenId);
      if (index !== -1) createdSceneItemIds.splice(index, 1);
      return win.canvas.scene.deleteEmbeddedDocuments("Token", [allyTokenId]);
    });
  });

  it("un allié à 4,50 m (hors zone) n'est pas protégé (T-DEVOTION-002)", () => {
    cy.window()
      .then((win) => createToken(win, allyId, 1300, 1000)) // 300 px = 4,50 m
      .then((tokenId) => {
        allyTokenId = tokenId;
      });
    cy.window().then((win) => win.game.actors.get(allyId).toggleStatusEffect("charmed", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(allyId).statuses.has("charmed"), "hors zone, aucune protection").to.be.true;
    });
    cy.window().then((win) => win.game.actors.get(allyId).toggleStatusEffect("charmed", { active: false }));
  });
});

describe("Technique de la Main Ouverte (Open Hand, Moine) — choix d'effet + jet de sauvegarde", () => {
  let monkId;
  let targetActorId;
  let targetTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Open Hand Monk", type: "character", system: { class: "monk" } }))
      .then((actor) => {
        monkId = actor.id;
      });
    cy.window().then((win) =>
      createItem(win, monkId, {
        name: "Technique de la Main Ouverte",
        type: "feature",
        system: { class: "monk", subclass: "openHand", level: 3, offersOpenHandTechnique: true }
      })
    );
    cy.window()
      .then((win) => createActor(win, { name: "Open Hand Target", type: "npc", system: {} }))
      .then((actor) => {
        targetActorId = actor.id;
      });
    cy.window()
      .then((win) => createToken(win, targetActorId, 1000, 1000))
      .then((tokenId) => {
        targetTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("échec du jet (1 naturel forcé) : l'effet 'à terre' choisi est appliqué (T-OPENHAND-001)", () => {
    cy.openActorSheet(monkId);
    goToTab("abilities");
    targetToken(targetTokenId);
    cy.forceD20(1);
    resetMessageBaseline();

    withItemId(monkId, "Technique de la Main Ouverte", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="useOpenHandTechnique"]`).click();
      cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
      cy.get('dialog.application.dialog input[type="radio"][name="openHandEffect"][value="prone"]').check();
      cy.get('dialog.application.dialog button[data-action="ok"]').click();
    });

    lastMessage().then((roll) => {
      expect(roll.flavor, "sauvegarde ratée (1 naturel forcé), effet 'à terre' choisi").to.include("Knocked prone");
    });
    // "Open Hand Target" est un PNJ (token NON lié à son Actor, cf. dnd-custom-ai.js >
    // preCreateActor — seuls les personnages joueurs sont liés) : `#onUseOpenHandTechnique`
    // applique l'état sur `token.actor` (l'Actor SYNTHÉTIQUE propre à CE token), jamais reflété
    // sur `game.actors.get(targetActorId)` (l'Actor "monde" jamais touché pour un token délié) —
    // vérifier via le token, pas l'Actor de la sidebar.
    cy.window().should((win) => {
      expect(win.canvas.tokens.get(targetTokenId).actor.statuses.has("prone"), "cible mise à terre").to.be.true;
    });
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).actor.toggleStatusEffect("prone", { active: false }));
  });

  it("échec du jet : l'effet 'pas de réaction' choisi vide la réaction d'une cible personnage (T-OPENHAND-002)", () => {
    let pcTargetId;
    let pcTargetTokenId;
    cy.window()
      .then((win) => createActor(win, { name: "Open Hand PC Target", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        pcTargetId = actor.id;
        return cy.window().then((win) =>
          Promise.all([
            createToken(win, actor.id, 1200, 1200),
            updateActor(win, win.game.actors.get(actor.id), { "system.combat.reactionAvailable": true }, { dndCustomWizard: true })
          ])
        );
      })
      .then(([tokenId]) => {
        pcTargetTokenId = tokenId;

        cy.openActorSheet(monkId);
        goToTab("abilities");
        targetToken(pcTargetTokenId);
        cy.forceD20(1);

        withItemId(monkId, "Technique de la Main Ouverte", (itemId) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="useOpenHandTechnique"]`).click();
          cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
          cy.get('dialog.application.dialog input[type="radio"][name="openHandEffect"][value="noReaction"]').check();
          cy.get('dialog.application.dialog button[data-action="ok"]').click();
        });

        cy.window().should((win) => {
          expect(win.game.actors.get(pcTargetId).system.combat.reactionAvailable, "réaction bloquée").to.be.false;
        });
      });
  });
});

describe("Tactiques défensives (Hunter, Rôdeur) — choix ponctuel enregistré", () => {
  it("choix persisté, bouton verrouillé ensuite (T-HUNTERDEF-001)", () => {
    cy.loginAsGM();
    let rangerId;
    cy.window()
      .then((win) => createActor(win, { name: "Defensive Tactics Ranger", type: "character", system: { class: "ranger" } }))
      .then((actor) => {
        rangerId = actor.id;
        return cy.window().then((win) =>
          createItem(win, rangerId, {
            name: "Tactiques défensives",
            type: "feature",
            system: { class: "ranger", subclass: "hunter", level: 7, grantsChoice: "huntersDefense" }
          })
        );
      })
      .then(() => {
        cy.openActorSheet(rangerId);
        goToTab("abilities");
        withItemId(rangerId, "Tactiques défensives", (itemId) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="chooseFeatureOption"]`).click();
          cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
          cy.get('dialog.application.dialog input[type="radio"][name="chosenOption"][value="steadfast"]').check();
          cy.get('dialog.application.dialog button[data-action="ok"]').click();

          cy.window().should((win) => {
            expect(win.game.actors.get(rangerId).system.combat.huntersDefense).to.equal("steadfast");
          });
          cy.get(`li[data-item-id="${itemId}"] button[data-action="chooseFeatureOption"]`).should("not.exist");
        });
      });
  });
});
