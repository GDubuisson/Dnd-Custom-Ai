// Chantier "types de dégâts" — Phase 4 (armures avec résistance/immunité/vulnérabilité PROPRE,
// 2026-08-25, cadré avec l'utilisateur avant implémentation) : ArmorData porte désormais le même
// damageAffinitySchema que Personnage/PNJ (Phase 1), mais réglé sur l'armure elle-même et actif
// UNIQUEMENT si elle est équipée (cf. hasArmorDamageAffinity, dnd-custom-ai.js). Contrairement au
// champ générique, la résistance/immunité/vulnérabilité d'armure N'A PAS la nuance SRD "contre les
// attaques non magiques" (une armure qui protège du feu protège du feu, source magique ou non) —
// testé explicitement ci-dessous (T-DMGTYPE-016). Se combine avec le champ générique déjà existant
// selon la même règle déjà en place (immunité prioritaire, résistance+vulnérabilité sur le même
// type s'annulent), testé en T-DMGTYPE-017.

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

function applyDamageFromMessage(messageId) {
  cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
  // .first() : Foundry affiche aussi une notification "toast" éphémère du même message, avec son
  // propre bouton (même data-message-id) — retour de test déjà documenté (tier-c-rage.cy.js).
  cy.get(`[data-message-id="${messageId}"]`, { timeout: 10000 }).first().find("button.dnd-apply-damage-btn").click();
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Résistance/immunité/vulnérabilité PROPRE à une armure équipée (attaque de PNJ contre un PJ)", () => {
  // PNJ (pas un second "character") : dnd-custom-ai.js > applyDamageToTargets bloque tout dégât
  // d'un "character" vers un AUTRE "character" (PvP bloqué), même contournement que
  // tier-c-rage.cy.js/damage-types-physical.cy.js.
  function createAttacker(win, { damageType, magic = false }) {
    return createActor(win, {
      name: `Armor Test Attacker (${damageType}${magic ? " magique" : ""})`,
      type: "npc",
      system: { attacks: [{ ability: "str", bonus: 5, damage: { dice: "10", bonus: 0, type: damageType }, magic }] }
    });
  }

  // Un PJ frais par test, sans PV forcés à la création (même piège déjà documenté dans
  // tier-c-rage.cy.js : `hp.max` est DÉRIVÉ classe/niveau et se recalcule à chaque update, un
  // override manuel se fait silencieusement écraser) — `hpBefore` relu juste avant l'attaque.
  function createArmoredPc(win, armorSystem) {
    return createActor(win, { name: "Armor Damage Types PC", type: "character", system: { class: "fighter" } }).then(
      (actor) =>
        createToken(win, actor.id, 100, 100).then((tokenId) =>
          createItem(win, actor.id, { name: "Test Armor", type: "armor", system: armorSystem }).then(() => ({
            actorId: actor.id,
            tokenId
          }))
        )
    );
  }

  function attackAndApply(attackerId, targetTokenId) {
    cy.window().then((win) => win.game.actors.get(attackerId).sheet.render(true));
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    targetToken(targetTokenId);
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    cy.get('button[data-action="rollAttackDamage"]').click();
    return lastMessage().then((roll) => {
      cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
      applyDamageFromMessage(roll.id);
      return cy.wrap(roll);
    });
  }

  beforeEach(() => cy.loginAsGM());

  it("armure équipée, résistance au feu : moitié des dégâts (T-DMGTYPE-013)", () => {
    let pcId;
    let hpBefore;
    cy.window()
      .then((win) => createArmoredPc(win, { equipped: true, damageResistances: ["fire"] }))
      .then(({ actorId, tokenId }) => {
        pcId = actorId;
        cy.window().then((win) => {
          hpBefore = win.game.actors.get(actorId).system.attributes.hp.value;
        });
        return cy.window().then((win) => createAttacker(win, { damageType: "fire" })).then((actor) => attackAndApply(actor.id, tokenId));
      })
      .then((roll) => {
        cy.window().should((win) => {
          expect(win.game.actors.get(pcId).system.attributes.hp.value, "résistance d'armure : moitié").to.equal(
            hpBefore - Math.floor(roll.total / 2)
          );
        });
      });
  });

  it("armure NON équipée, résistance au feu : dégâts pleins (résistance inactive) (T-DMGTYPE-014)", () => {
    let pcId;
    let hpBefore;
    cy.window()
      .then((win) => createArmoredPc(win, { equipped: false, damageResistances: ["fire"] }))
      .then(({ actorId, tokenId }) => {
        pcId = actorId;
        cy.window().then((win) => {
          hpBefore = win.game.actors.get(actorId).system.attributes.hp.value;
        });
        return cy.window().then((win) => createAttacker(win, { damageType: "fire" })).then((actor) => attackAndApply(actor.id, tokenId));
      })
      .then((roll) => {
        cy.window().should((win) => {
          expect(win.game.actors.get(pcId).system.attributes.hp.value, "armure non équipée : plein").to.equal(hpBefore - roll.total);
        });
      });
  });

  it("armure équipée, immunité au poison, attaquant MAGIQUE : aucun dégât (T-DMGTYPE-015)", () => {
    let pcId;
    let hpBefore;
    cy.window()
      .then((win) => createArmoredPc(win, { equipped: true, damageImmunities: ["poison"] }))
      .then(({ actorId, tokenId }) => {
        pcId = actorId;
        cy.window().then((win) => {
          hpBefore = win.game.actors.get(actorId).system.attributes.hp.value;
        });
        return cy
          .window()
          .then((win) => createAttacker(win, { damageType: "poison", magic: true }))
          .then((actor) => attackAndApply(actor.id, tokenId));
      })
      .then(() => {
        cy.window().should((win) => {
          expect(win.game.actors.get(pcId).system.attributes.hp.value, "immunité d'armure : aucun dégât").to.equal(hpBefore);
        });
      });
  });

  it("armure équipée, résistance au tranchant, attaquant MAGIQUE : résistance reste active (pas de nuance magique pour l'armure) (T-DMGTYPE-016)", () => {
    let pcId;
    let hpBefore;
    cy.window()
      .then((win) => createArmoredPc(win, { equipped: true, damageResistances: ["slashing"] }))
      .then(({ actorId, tokenId }) => {
        pcId = actorId;
        cy.window().then((win) => {
          hpBefore = win.game.actors.get(actorId).system.attributes.hp.value;
        });
        return cy
          .window()
          .then((win) => createAttacker(win, { damageType: "slashing", magic: true }))
          .then((actor) => attackAndApply(actor.id, tokenId));
      })
      .then((roll) => {
        cy.window().should((win) => {
          expect(
            win.game.actors.get(pcId).system.attributes.hp.value,
            "résistance d'armure jamais contournée par une source magique"
          ).to.equal(hpBefore - Math.floor(roll.total / 2));
        });
      });
  });

  it("armure résistance au feu + case générique vulnérabilité au feu (PJ) : s'annulent, dégâts normaux (T-DMGTYPE-017)", () => {
    let pcId;
    let pcTokenId;
    let hpBefore;
    cy.window()
      .then((win) => createArmoredPc(win, { equipped: true, damageResistances: ["fire"] }))
      .then(({ actorId, tokenId }) => {
        pcId = actorId;
        pcTokenId = tokenId;
      });
    cy.window().then((win) =>
      win.game.actors.get(pcId).update(win.JSON.parse(win.JSON.stringify({ "system.combat.damageVulnerabilities": ["fire"] })))
    );
    cy.window().then((win) => {
      hpBefore = win.game.actors.get(pcId).system.attributes.hp.value;
    });
    cy.window()
      .then((win) => createAttacker(win, { damageType: "fire" }))
      .then((actor) => attackAndApply(actor.id, pcTokenId))
      .then((roll) => {
        cy.window().should((win) => {
          expect(
            win.game.actors.get(pcId).system.attributes.hp.value,
            "résistance d'armure + vulnérabilité générique sur le même type : s'annulent"
          ).to.equal(hpBefore - roll.total);
        });
      });
  });

  it("armure vulnérabilité au froid : dégâts doublés (T-DMGTYPE-018)", () => {
    let pcId;
    let hpBefore;
    cy.window()
      .then((win) => createArmoredPc(win, { equipped: true, damageVulnerabilities: ["cold"] }))
      .then(({ actorId, tokenId }) => {
        pcId = actorId;
        cy.window().then((win) => {
          hpBefore = win.game.actors.get(actorId).system.attributes.hp.value;
        });
        return cy.window().then((win) => createAttacker(win, { damageType: "cold" })).then((actor) => attackAndApply(actor.id, tokenId));
      })
      .then((roll) => {
        cy.window().should((win) => {
          // Les PV sont plafonnés à 0 côté serveur (Math.max(0, ...), dnd-custom-ai.js) : un jet
          // doublé (d10×2, jusqu'à 20) peut dépasser les PV par défaut d'un Guerrier niveau 1,
          // d'où le Math.max ici aussi plutôt qu'une simple soustraction.
          expect(win.game.actors.get(pcId).system.attributes.hp.value, "vulnérabilité d'armure : dégâts doublés").to.equal(
            Math.max(0, hpBefore - roll.total * 2)
          );
        });
      });
  });
});

describe("UI — fiche armure : cocher une résistance/immunité/vulnérabilité met bien à jour l'Item", () => {
  it("cases cochées sur la fiche armure persistent (T-DMGTYPE-019)", () => {
    cy.loginAsGM();
    let pcId;
    let armorId;
    cy.window()
      .then((win) => createActor(win, { name: "Armor UI Checkbox PC", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        pcId = actor.id;
        return cy.window().then((win) => createItem(win, pcId, { name: "UI Test Armor", type: "armor", system: {} }));
      })
      .then((items) => {
        armorId = items[0].id;
        cy.window().then((win) => win.game.actors.get(pcId).items.get(armorId).sheet.render(true));
      });
    cy.get(".application.sheet.item", { timeout: 10000 }).find('input[name="system.damageResistances"][value="fire"]').check();
    cy.get(".application.sheet.item").find('input[name="system.damageImmunities"][value="poison"]').check();
    cy.get(".application.sheet.item").find('input[name="system.damageVulnerabilities"][value="cold"]').check();
    cy.window().should((win) => {
      const armor = win.game.actors.get(pcId).items.get(armorId);
      expect([...armor.system.damageResistances], "résistance cochée persistée").to.include("fire");
      expect([...armor.system.damageImmunities], "immunité cochée persistée").to.include("poison");
      expect([...armor.system.damageVulnerabilities], "vulnérabilité cochée persistée").to.include("cold");
    });
    cy.window().then((win) => win.game.actors.get(pcId).items.get(armorId).sheet.close());
  });
});
