// Chantier "types de dégâts" — Phase 2 (magique, 2026-08-24, cadrée avec l'utilisateur après la
// Phase 1) : PAS de nouveau mécanisme à coder — le champ générique damageResistances/Immunities/
// Vulnerabilities (damageAffinitySchema, shared-schema.js) et sa résolution (damageTypeMultiplier,
// dnd-custom-ai.js) fonctionnent DÉJÀ sans condition pour les 10 types magiques : la nuance
// "contourné par une source magique" (WeaponData#magic/NpcData#attack.magic) ne s'applique QU'aux
// 3 types physiques (cf. PHYSICAL_DAMAGE_TYPES.has(damageType) dans damageTypeMultiplier), fidèle
// au SRD (aucun monstre n'a de résistance "au feu sauf source non magique"). Cette spec couvre
// donc uniquement la VALIDATION E2E des cas magiques courants (immunité poison/psychique
// morts-vivants/constructs, vulnérabilité radiant...), jamais testés en Phase 1, plus la
// confirmation explicite que la case "Magique" reste sans effet sur un type magique, et qu'un
// sort à zone (plusieurs cibles) résout bien la résistance de CHAQUE cible indépendamment.

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

function createNpcTarget(win, { name, hp = 100, extraSystem = {}, x = 1000, y = 1000 }) {
  return createActor(win, {
    name,
    type: "npc",
    system: { attributes: { hp: { value: hp, max: hp } }, ...extraSystem }
  }).then((actor) => createToken(win, actor.id, x, y).then((tokenId) => ({ actorId: actor.id, tokenId })));
}

function targetToken(tokenId, { releaseOthers = true } = {}) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers }));
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

describe("Résistance/immunité/vulnérabilité génériques — dégâts magiques (sort du PJ)", () => {
  let casterId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Damage Types Wizard", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          Promise.all([
            createItem(win, casterId, {
              name: "Test Fire Cantrip",
              type: "spell",
              system: { classes: ["wizard"], level: 0, damage: { dice: "10", type: "fire" } }
            }),
            createItem(win, casterId, {
              name: "Test Poison Cantrip",
              type: "spell",
              system: { classes: ["wizard"], level: 0, damage: { dice: "10", type: "poison" } }
            }),
            createItem(win, casterId, {
              name: "Test Radiant Cantrip",
              type: "spell",
              system: { classes: ["wizard"], level: 0, damage: { dice: "10", type: "radiant" } }
            }),
            createItem(win, casterId, {
              name: "Test Necrotic Cantrip",
              type: "spell",
              system: { classes: ["wizard"], level: 0, damage: { dice: "10", type: "necrotic" } }
            })
          ])
        );
      });
  });

  beforeEach(() => cy.loginAsGM());

  function castCantripAndApply(itemName, targetTokenId) {
    targetToken(targetTokenId);
    cy.openActorSheet(casterId);
    goToTab("abilities");
    withItemId(casterId, itemName, (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
    });
    return withItemId(casterId, itemName, (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      return lastMessage().then((roll) => {
        cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
        applyDamageFromMessage(roll.id);
        return cy.wrap(roll);
      });
    });
  }

  it("cible résistante au feu : moitié des dégâts (T-DMGTYPE-013)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Fire Resist Target", extraSystem: { damageResistances: ["fire"] } }))
      .then(({ tokenId }) => {
        castCantripAndApply("Test Fire Cantrip", tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "résistant au feu : moitié").to.equal(
              100 - Math.floor(roll.total / 2)
            );
          });
        });
      });
  });

  it("cible immunisée au poison (mort-vivant/construct SRD) : aucun dégât (T-DMGTYPE-014)", () => {
    cy.window()
      .then((win) =>
        createNpcTarget(win, {
          name: "Poison Immune Undead",
          extraSystem: { creatureType: "undead", damageImmunities: ["poison"] }
        })
      )
      .then(({ tokenId }) => {
        castCantripAndApply("Test Poison Cantrip", tokenId).then(() => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "immunisé au poison : aucun dégât").to.equal(100);
          });
        });
      });
  });

  it("cible vulnérable au radiant (mort-vivant SRD) : dégâts doublés (T-DMGTYPE-015)", () => {
    cy.window()
      .then((win) =>
        createNpcTarget(win, {
          name: "Radiant Vulnerable Undead",
          hp: 200,
          extraSystem: { creatureType: "undead", damageVulnerabilities: ["radiant"] }
        })
      )
      .then(({ tokenId }) => {
        castCantripAndApply("Test Radiant Cantrip", tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "vulnérable au radiant : doublé").to.equal(
              200 - roll.total * 2
            );
          });
        });
      });
  });

  it("cible à la fois résistante ET vulnérable au nécrotique : dégâts normaux (s'annulent, règle SRD) (T-DMGTYPE-016)", () => {
    cy.window()
      .then((win) =>
        createNpcTarget(win, {
          name: "Necrotic Resist And Vulnerable",
          extraSystem: { damageResistances: ["necrotic"], damageVulnerabilities: ["necrotic"] }
        })
      )
      .then(({ tokenId }) => {
        castCantripAndApply("Test Necrotic Cantrip", tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "résistance + vulnérabilité sur le même type magique : s'annulent"
            ).to.equal(100 - roll.total);
          });
        });
      });
  });
});

describe("La case 'Magique' reste sans effet sur un type de dégâts magique (attaque de PNJ)", () => {
  let attackerId;

  before(() => {
    cy.loginAsGM();
    // `attack.magic: true` délibérément — doit rester sans effet sur un type magique (feu), la
    // nuance "contourne la résistance générique" étant réservée aux 3 types PHYSIQUES.
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Magic Fire Breather",
          type: "npc",
          system: { attack: { ability: "str", bonus: 5, damage: { dice: "10", bonus: 0, type: "fire" }, magic: true } }
        })
      )
      .then((actor) => {
        attackerId = actor.id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("cible résistante au feu, attaque de PNJ MAGIQUE : moitié des dégâts quand même (T-DMGTYPE-017)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Fire Resist Vs Magic Target", extraSystem: { damageResistances: ["fire"] } }))
      .then(({ tokenId }) => {
        let hpBefore;
        cy.window().then((win) => {
          hpBefore = win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value;
          win.game.actors.get(attackerId).sheet.render(true);
        });
        cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
        targetToken(tokenId);
        resetMessageBaseline();
        cy.get('button[data-action="rollAttack"]').click();
        cy.get('button[data-action="rollAttackDamage"]').click();
        lastMessage().then((roll) => {
          cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "type magique : la case 'Magique' ne contourne rien, résistance toujours appliquée"
            ).to.equal(hpBefore - Math.floor(roll.total / 2));
          });
        });
      });
  });
});

describe("Sort à zone (plusieurs cibles) — résistance résolue indépendamment par cible", () => {
  let casterId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "AOE Wizard", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, {
            name: "Test AOE Fireball",
            type: "spell",
            system: { classes: ["wizard"], level: 0, damage: { dice: "10", type: "fire" } }
          })
        );
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("2 cibles simultanées, une seule résistante au feu : chacune reçoit le bon montant (T-DMGTYPE-018)", () => {
    let resistantTokenId;
    let normalTokenId;
    cy.window()
      .then((win) => createNpcTarget(win, { name: "AOE Resistant", extraSystem: { damageResistances: ["fire"] }, x: 900, y: 900 }))
      .then(({ tokenId }) => {
        resistantTokenId = tokenId;
      });
    cy.window()
      .then((win) => createNpcTarget(win, { name: "AOE Normal", x: 1100, y: 1100 }))
      .then(({ tokenId }) => {
        normalTokenId = tokenId;
      });

    cy.then(() => {
      targetToken(resistantTokenId, { releaseOthers: true });
      targetToken(normalTokenId, { releaseOthers: false });
    });
    cy.window().should((win) => {
      expect(win.game.user.targets.size, "2 cibles ciblées simultanément").to.equal(2);
    });

    cy.openActorSheet(casterId);
    goToTab("abilities");
    withItemId(casterId, "Test AOE Fireball", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
    });
    withItemId(casterId, "Test AOE Fireball", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
    });
    lastMessage().then((roll) => {
      cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
      applyDamageFromMessage(roll.id);
      cy.window().should((win) => {
        expect(
          win.canvas.tokens.get(resistantTokenId).actor.system.attributes.hp.value,
          "cible résistante : moitié des dégâts"
        ).to.equal(100 - Math.floor(roll.total / 2));
        expect(
          win.canvas.tokens.get(normalTokenId).actor.system.attributes.hp.value,
          "cible normale : dégâts pleins, même jet"
        ).to.equal(100 - roll.total);
      });
    });
  });
});
