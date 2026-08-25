// Chantier "types de dégâts" — Phase 1 (physique, 2026-08-24, cadré avec l'utilisateur avant
// implémentation) : résistance/immunité/vulnérabilité GÉNÉRIQUES aux dégâts (nouveau champ
// damageAffinitySchema, shared-schema.js, partagé NpcData/CharacterData) réglables librement par
// le MJ, pour les 3 types physiques (bludgeoning/piercing/slashing). Nuance SRD "contre les
// attaques non magiques" propre à ces 3 types : une arme/attaque de PNJ magique (nouveau champ
// WeaponData#magic/NpcData#attack.magic) contourne UNIQUEMENT ce champ générique — les
// résistances déjà câblées en dur ailleurs (Rage notamment) n'ont pas cette nuance au SRD et
// restent donc toujours actives, testé explicitement ci-dessous (non-régression).
// cf. damageTypeMultiplier (dnd-custom-ai.js) pour la résolution complète.

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

function createNpcTarget(win, { name, hp = 100, extraSystem = {} }) {
  return createActor(win, {
    name,
    type: "npc",
    system: { attributes: { hp: { value: hp, max: hp } }, ...extraSystem }
  }).then((actor) => createToken(win, actor.id, 1000, 1000).then((tokenId) => ({ actorId: actor.id, tokenId })));
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

describe("Résistance/immunité/vulnérabilité génériques — dégâts physiques, arme du PJ", () => {
  let casterId;
  let weaponId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Damage Types Fighter", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, {
            name: "Test Physical Weapon",
            type: "weapon",
            system: { equipped: true, weaponType: "meleeMartial", damage: { dice: "10", type: "slashing" }, magic: false }
          })
        );
      })
      .then((items) => {
        weaponId = items[0].id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  function setWeaponMagic(magic) {
    return cy.window().then((win) =>
      win.game.actors
        .get(casterId)
        .items.get(weaponId)
        .update(win.JSON.parse(win.JSON.stringify({ "system.magic": magic })))
    );
  }

  function rollWeaponDamageAndApply(targetTokenId) {
    targetToken(targetTokenId);
    cy.openActorSheet(casterId);
    goToTab("equipment");
    resetMessageBaseline();
    cy.get(".equipment-slot").eq(0).find(".equipment-roll-btn-damage").click();
    return lastMessage().then((roll) => {
      cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
      applyDamageFromMessage(roll.id);
      return cy.wrap(roll);
    });
  }

  it("cible résistante au tranchant, arme non magique : moitié des dégâts (T-DMGTYPE-001)", () => {
    setWeaponMagic(false);
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Resist Slashing Target", extraSystem: { damageResistances: ["slashing"] } }))
      .then(({ tokenId }) => {
        rollWeaponDamageAndApply(tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "résistant, non magique : moitié").to.equal(
              100 - Math.floor(roll.total / 2)
            );
          });
        });
      });
  });

  it("cible résistante au tranchant, arme MAGIQUE : dégâts pleins (contourne le champ générique) (T-DMGTYPE-002)", () => {
    setWeaponMagic(true);
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Resist Slashing Magic Target", extraSystem: { damageResistances: ["slashing"] } }))
      .then(({ tokenId }) => {
        rollWeaponDamageAndApply(tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "résistant mais arme magique : plein").to.equal(
              100 - roll.total
            );
          });
        });
      });
  });

  it("cible immunisée au tranchant, arme non magique : aucun dégât (T-DMGTYPE-003)", () => {
    setWeaponMagic(false);
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Immune Slashing Target", extraSystem: { damageImmunities: ["slashing"] } }))
      .then(({ tokenId }) => {
        rollWeaponDamageAndApply(tokenId).then(() => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "immunisé, non magique : aucun dégât").to.equal(100);
          });
        });
      });
  });

  it("cible immunisée au tranchant, arme MAGIQUE : dégâts pleins (contourne l'immunité générique) (T-DMGTYPE-004)", () => {
    setWeaponMagic(true);
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Immune Slashing Magic Target", extraSystem: { damageImmunities: ["slashing"] } }))
      .then(({ tokenId }) => {
        rollWeaponDamageAndApply(tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "immunisé mais arme magique : plein").to.equal(
              100 - roll.total
            );
          });
        });
      });
  });

  it("cible vulnérable au tranchant, arme non magique : dégâts doublés (T-DMGTYPE-005)", () => {
    setWeaponMagic(false);
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Vulnerable Slashing Target", hp: 200, extraSystem: { damageVulnerabilities: ["slashing"] } }))
      .then(({ tokenId }) => {
        rollWeaponDamageAndApply(tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "vulnérable : dégâts doublés").to.equal(
              200 - roll.total * 2
            );
          });
        });
      });
  });

  it("cible à la fois résistante ET vulnérable au tranchant : dégâts normaux (s'annulent, règle SRD) (T-DMGTYPE-006)", () => {
    setWeaponMagic(false);
    cy.window()
      .then((win) =>
        createNpcTarget(win, {
          name: "Resist And Vulnerable Target",
          extraSystem: { damageResistances: ["slashing"], damageVulnerabilities: ["slashing"] }
        })
      )
      .then(({ tokenId }) => {
        rollWeaponDamageAndApply(tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "résistance + vulnérabilité sur le même type : s'annulent"
            ).to.equal(100 - roll.total);
          });
        });
      });
  });

  it("cible sans aucune affinité : dégâts normaux, comportement inchangé (T-DMGTYPE-007)", () => {
    setWeaponMagic(false);
    cy.window()
      .then((win) => createNpcTarget(win, { name: "No Affinity Target" }))
      .then(({ tokenId }) => {
        rollWeaponDamageAndApply(tokenId).then((roll) => {
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "aucune affinité : dégâts normaux").to.equal(
              100 - roll.total
            );
          });
        });
      });
  });
});

describe("Résistance générique — attaque de PNJ contre un PJ (sens symétrique)", () => {
  let targetId;
  let targetTokenId;
  let attackerId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Resist Slashing PC",
          type: "character",
          system: { class: "fighter", combat: { damageResistances: ["slashing"] } }
        })
      )
      .then((actor) => {
        targetId = actor.id;
        return cy.window().then((win) => createToken(win, targetId, 1000, 1000));
      })
      .then((tokenId) => {
        targetTokenId = tokenId;
      });
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Physical Attacker",
          type: "npc",
          system: { attacks: [{ ability: "str", bonus: 5, damage: { dice: "10", bonus: 0, type: "slashing" }, magic: false }] }
        })
      )
      .then((actor) => {
        attackerId = actor.id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("champ générique aussi lu sur un PJ (system.combat.damageResistances) : moitié des dégâts (T-DMGTYPE-008)", () => {
    let hpBefore;
    cy.window().then((win) => {
      hpBefore = win.game.actors.get(targetId).system.attributes.hp.value;
      win.game.actors.get(attackerId).sheet.render(true);
    });
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    targetToken(targetTokenId);
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    cy.get('button[data-action="rollAttackDamage"]').click();
    lastMessage().then((roll) => {
      cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
      applyDamageFromMessage(roll.id);
      cy.window().should((win) => {
        expect(win.game.actors.get(targetId).system.attributes.hp.value, "PJ résistant : moitié des dégâts").to.equal(
          hpBefore - Math.floor(roll.total / 2)
        );
      });
    });
  });
});

describe("Non-régression — Rage (résistance câblée en dur) reste active même contre une arme magique", () => {
  let barbarianId;
  let attackerId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Rage Vs Magic Barbarian", type: "character", system: { class: "barbarian" } }))
      .then((actor) => {
        barbarianId = actor.id;
      });
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Magic Physical Attacker",
          type: "npc",
          system: { attacks: [{ ability: "str", bonus: 5, damage: { dice: "10", bonus: 0, type: "slashing" }, magic: true }] }
        })
      )
      .then((actor) => {
        attackerId = actor.id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("En Rage, attaque tranchante MAGIQUE : résistance de Rage s'applique quand même (T-DMGTYPE-009)", () => {
    cy.window().then((win) => win.game.actors.get(barbarianId).toggleStatusEffect("raging", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(barbarianId).statuses.has("raging"), "Rage activée").to.be.true;
    });

    let hpBefore;
    cy.window().then((win) => {
      hpBefore = win.game.actors.get(barbarianId).system.attributes.hp.value;
      win.game.actors.get(attackerId).sheet.render(true);
    });
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.window()
      .then((win) => createToken(win, barbarianId, 1200, 1000))
      .then((tokenId) => targetToken(tokenId));
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    cy.get('button[data-action="rollAttackDamage"]').click();
    lastMessage().then((roll) => {
      cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
      applyDamageFromMessage(roll.id);
      cy.window().should((win) => {
        expect(
          win.game.actors.get(barbarianId).system.attributes.hp.value,
          "Rage résiste même à une attaque magique (pas de nuance SRD pour Rage)"
        ).to.equal(hpBefore - Math.floor(roll.total / 2));
      });
    });

    cy.window().then((win) => win.game.actors.get(barbarianId).toggleStatusEffect("raging", { active: false }));
  });
});

describe("UI — les nouvelles cases à cocher soumettent réellement le formulaire natif Foundry", () => {
  // Vérifie le binding SetField (plusieurs cases partageant le même `name`) via un vrai clic,
  // pas seulement via une donnée posée directement — risque réel non couvert par les describes
  // ci-dessus (qui posent damageResistances/magic par données, jamais par clic).
  it("fiche PNJ : cocher une résistance/immunité/vulnérabilité met bien à jour l'Actor (T-DMGTYPE-010)", () => {
    cy.loginAsGM();
    let npcId;
    cy.window()
      .then((win) => createNpcTarget(win, { name: "UI Checkbox NPC" }))
      .then(({ actorId }) => {
        npcId = actorId;
        cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
      });
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.npc input[name=\"system.damageResistances\"][value=\"bludgeoning\"]").check();
    cy.get(".application.npc input[name=\"system.damageImmunities\"][value=\"poison\"]").check();
    cy.get(".application.npc input[name=\"system.damageVulnerabilities\"][value=\"fire\"]").check();
    cy.window().should((win) => {
      const npc = win.game.actors.get(npcId);
      expect([...npc.system.damageResistances], "résistance cochée persistée").to.include("bludgeoning");
      expect([...npc.system.damageImmunities], "immunité cochée persistée").to.include("poison");
      expect([...npc.system.damageVulnerabilities], "vulnérabilité cochée persistée").to.include("fire");
    });
    cy.window().then((win) => win.game.actors.get(npcId).sheet.close());
  });

  it("fiche d'arme : cocher 'Magique' met bien à jour l'Item (T-DMGTYPE-011)", () => {
    cy.loginAsGM();
    let casterId;
    let weaponId;
    cy.window()
      .then((win) => createActor(win, { name: "UI Checkbox Fighter", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, {
            name: "Test UI Weapon",
            type: "weapon",
            system: { damage: { dice: "1d6", type: "slashing" } }
          })
        );
      })
      .then((items) => {
        weaponId = items[0].id;
        cy.window().then((win) => win.game.actors.get(casterId).items.get(weaponId).sheet.render(true));
      });
    cy.get(".application.sheet.item", { timeout: 10000 }).find('input[name="system.magic"]').check();
    cy.window().should((win) => {
      expect(win.game.actors.get(casterId).items.get(weaponId).system.magic, "case Magique cochée persistée").to.be.true;
    });
  });

  it("fiche personnage : cocher une résistance (section MJ) met bien à jour l'Actor (T-DMGTYPE-012)", () => {
    cy.loginAsGM();
    let pcId;
    cy.window()
      .then((win) => createActor(win, { name: "UI Checkbox PC", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        pcId = actor.id;
      });
    cy.then(() => cy.openActorSheet(pcId));
    goToTab("stats");
    sheetRoot().find('input[name="system.combat.damageResistances"][value="piercing"]').check();
    cy.window().should((win) => {
      expect(
        [...win.game.actors.get(pcId).system.combat.damageResistances],
        "résistance cochée persistée (PJ)"
      ).to.include("piercing");
    });
  });
});
