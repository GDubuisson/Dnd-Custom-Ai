// Chantier "Niveau C" (2026-08-24, sur demande explicite après revue de
// ClaudeFiles/MECANIQUES_A_AUTOMATISER.md) : Voile des anciens (Paladin, Serment des Anciens) —
// résistance aux dégâts de SORTS (pas un type précis, contrairement à Rage/Affinité de la
// tempête) en zone de 3 m autour du Paladin qui l'a activée (bascule homebrew "ancientsVeil",
// config.js), tant qu'il ne s'agit pas d'un décompte de durée automatique (aucune conditions
// homebrew de ce système n'en a). Réutilise le mécanisme de zone déjà existant d'Aura de
// dévotion (isProtectedByDevotionAura, condition-immunity.js) — cf.
// isProtectedByAncientsVeil/isResistantToDamageType (dnd-custom-ai.js), rollDamage#isSpellDamage
// (rolls.js), #onRollSpellDamage (actor-sheet.js).

const createdActorIds = [];
const createdSceneItemIds = [];

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

function toggleVeil(actorId, active) {
  return cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("ancientsVeil", { active }));
}

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
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
      return { id: message.id, total: message.rolls?.[0]?.total };
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

describe("Voile des anciens — résistance aux dégâts de sorts, en zone", () => {
  let casterId;
  let warderId;
  let npcTargetId;
  let npcTargetTokenId;
  let warderTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Veil Spell Caster", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, {
            name: "Test Veil Firebolt",
            type: "spell",
            system: { classes: ["wizard"], level: 0, damage: { dice: "10", type: "fire" } }
          })
        );
      });
    cy.window()
      .then((win) => createActor(win, { name: "Veil Warder Paladin", type: "character", system: { class: "paladin" } }))
      .then((actor) => {
        warderId = actor.id;
      });
    // PNJ, PV élevés fixes (pas de PV dérivé classe/niveau côté NpcData, contrairement à
    // CharacterData — cf. le piège déjà documenté dans tier-c-rage.cy.js) : cible des dégâts,
    // jamais bloquée par le garde-fou PvP (réservé aux "character" des deux côtés).
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Veil Target",
          type: "npc",
          system: { attributes: { hp: { value: 100, max: 100 } } }
        })
      )
      .then((actor) => {
        npcTargetId = actor.id;
        return cy.window().then((win) => createToken(win, npcTargetId, 1000, 1000));
      })
      .then((tokenId) => {
        npcTargetTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  function castFireboltAndApply(targetTokenId) {
    targetToken(targetTokenId);
    cy.openActorSheet(casterId);
    goToTab("abilities");
    withItemId(casterId, "Test Veil Firebolt", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
    });
    return withItemId(casterId, "Test Veil Firebolt", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      return lastMessage().then((roll) => {
        cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
        cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
        cy.get(`[data-message-id="${roll.id}"]`, { timeout: 10000 }).first().find("button.dnd-apply-damage-btn").click();
        return cy.wrap(roll.total);
      });
    });
  }

  it("cible à 2 unités (dans la zone) d'un Voile actif : dégâts de sort réduits de moitié (T-TIERC-VEIL-001)", () => {
    cy.window()
      .then((win) => createToken(win, warderId, 1200, 1000)) // grille par défaut du monde de test : 100 px = 1 unité (pas 1,5 m comme la grille reconfigurée par hunter-subclasses-extra-mechanics.cy.js) — 200 px = 2 unités, dans la zone de 3.
      .then((tokenId) => {
        warderTokenId = tokenId;
      });
    toggleVeil(warderId, true);
    cy.window().should((win) => {
      expect(win.game.actors.get(warderId).statuses.has("ancientsVeil"), "Voile activé").to.be.true;
    });

    let hpBefore;
    cy.window().then((win) => {
      hpBefore = win.canvas.tokens.get(npcTargetTokenId).actor.system.attributes.hp.value;
    });
    castFireboltAndApply(npcTargetTokenId).then((rolledTotal) => {
      cy.window().should((win) => {
        const target = win.canvas.tokens.get(npcTargetTokenId).actor;
        expect(target.system.attributes.hp.value, "dans la zone : moitié des dégâts subie").to.equal(
          hpBefore - Math.floor(rolledTotal / 2)
        );
      });
    });

    cy.window().then((win) => {
      const index = createdSceneItemIds.indexOf(warderTokenId);
      if (index !== -1) createdSceneItemIds.splice(index, 1);
      return win.canvas.scene.deleteEmbeddedDocuments("Token", [warderTokenId]);
    });
    toggleVeil(warderId, false);
  });

  it("cible à 4 unités (hors zone) d'un Voile actif : dégâts de sort intégraux (T-TIERC-VEIL-002)", () => {
    cy.window()
      .then((win) => createToken(win, warderId, 1400, 1000)) // 400 px = 4 unités (hors zone de 3, cf. commentaire T-TIERC-VEIL-001)
      .then((tokenId) => {
        warderTokenId = tokenId;
      });
    toggleVeil(warderId, true);
    cy.window().should((win) => {
      expect(win.game.actors.get(warderId).statuses.has("ancientsVeil"), "Voile activé").to.be.true;
    });

    let hpBefore;
    cy.window().then((win) => {
      hpBefore = win.canvas.tokens.get(npcTargetTokenId).actor.system.attributes.hp.value;
    });
    castFireboltAndApply(npcTargetTokenId).then((rolledTotal) => {
      cy.window().should((win) => {
        const target = win.canvas.tokens.get(npcTargetTokenId).actor;
        expect(target.system.attributes.hp.value, "hors zone : dégâts intégraux").to.equal(hpBefore - rolledTotal);
      });
    });

    cy.window().then((win) => {
      const index = createdSceneItemIds.indexOf(warderTokenId);
      if (index !== -1) createdSceneItemIds.splice(index, 1);
      return win.canvas.scene.deleteEmbeddedDocuments("Token", [warderTokenId]);
    });
    toggleVeil(warderId, false);
  });

  it("cible à 2 unités MAIS Voile non activé : dégâts de sort intégraux (T-TIERC-VEIL-003)", () => {
    cy.window()
      .then((win) => createToken(win, warderId, 1200, 1000))
      .then((tokenId) => {
        warderTokenId = tokenId;
      });
    // toggleVeil jamais appelé ici : Voile explicitement inactif.

    let hpBefore;
    cy.window().then((win) => {
      hpBefore = win.canvas.tokens.get(npcTargetTokenId).actor.system.attributes.hp.value;
    });
    castFireboltAndApply(npcTargetTokenId).then((rolledTotal) => {
      cy.window().should((win) => {
        const target = win.canvas.tokens.get(npcTargetTokenId).actor;
        expect(target.system.attributes.hp.value, "Voile inactif : dégâts intégraux").to.equal(hpBefore - rolledTotal);
      });
    });

    cy.window().then((win) => {
      const index = createdSceneItemIds.indexOf(warderTokenId);
      if (index !== -1) createdSceneItemIds.splice(index, 1);
      return win.canvas.scene.deleteEmbeddedDocuments("Token", [warderTokenId]);
    });
  });

  it("cible à 2 unités d'un Voile actif MAIS dégâts NON issus d'un sort : dégâts intégraux (T-TIERC-VEIL-004)", () => {
    cy.window()
      .then((win) => createToken(win, warderId, 1200, 1000))
      .then((tokenId) => {
        warderTokenId = tokenId;
      });
    toggleVeil(warderId, true);
    cy.window().should((win) => {
      expect(win.game.actors.get(warderId).statuses.has("ancientsVeil"), "Voile activé").to.be.true;
    });

    let hpBefore;
    let attackerId;
    cy.window()
      .then((win) =>
        win.Actor.create(
          win.JSON.parse(
            win.JSON.stringify({
              name: "Veil Non-Spell Attacker",
              type: "npc",
              system: { attack: { ability: "str", bonus: 5, damage: { dice: "10", bonus: 0, type: "fire" } } }
            })
          )
        )
      )
      .then((actor) => {
        attackerId = actor.id;
        createdActorIds.push(actor.id);
      });
    cy.window().then((win) => {
      hpBefore = win.canvas.tokens.get(npcTargetTokenId).actor.system.attributes.hp.value;
      win.game.actors.get(attackerId).sheet.render(true);
    });
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    targetToken(npcTargetTokenId);
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    cy.get('button[data-action="rollAttackDamage"]').click();
    lastMessage().then((roll) => {
      cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(`[data-message-id="${roll.id}"]`, { timeout: 10000 }).first().find("button.dnd-apply-damage-btn").click();
      cy.window().should((win) => {
        const target = win.canvas.tokens.get(npcTargetTokenId).actor;
        expect(target.system.attributes.hp.value, "dégâts non issus d'un sort : jamais résistés").to.equal(
          hpBefore - roll.total
        );
      });
    });

    cy.window().then((win) => {
      const index = createdSceneItemIds.indexOf(warderTokenId);
      if (index !== -1) createdSceneItemIds.splice(index, 1);
      return win.canvas.scene.deleteEmbeddedDocuments("Token", [warderTokenId]);
    });
    toggleVeil(warderId, false);
  });
});
