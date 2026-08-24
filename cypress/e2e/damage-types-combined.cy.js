// Chantier "types de dégâts" — Phase 3 (armes/attaques à dégâts combinés, 2026-08-24, cadrée
// avec l'utilisateur après les Phases 1/2) : une arme (WeaponData#secondaryDamage, item-data.js)
// ou une attaque de PNJ (NpcData#attack.secondaryDamage, npc-data.js) peut désormais infliger un
// SECOND type de dégâts bonus (ex. épée de feu = tranchant + feu), résolu INDÉPENDAMMENT du
// premier contre les résistances de la cible — un seul clic sur "Dégâts" poste 2 messages de
// chat distincts, chacun avec son propre bouton "Appliquer les dégâts". Jamais de modificateur
// de caractéristique/bonus de Rage sur le composant secondaire (SRD 5e : dés fixes). Le critique
// double les dés des DEUX composants (SRD 5e : "roll all of the attack's damage dice twice").

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
      return { id: message.id, total: message.rolls?.[0]?.total, formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, "") };
    });
}
// Un seul clic sur "Dégâts" poste maintenant potentiellement 2 messages (principal + secondaire)
// dans cet ORDRE (le composant principal est toujours roulé/posté en premier, cf.
// #onRollWeaponDamage/#onRollAttackDamage) : les 2 DERNIERS messages, dans l'ordre chronologique.
function lastTwoMessages() {
  return cy
    .window()
    .should((win) => {
      expect(win.game.messages.size, "2 nouveaux messages doivent être postés").to.be.at.least(knownMessageCount + 2);
    })
    .then((win) => {
      const size = win.game.messages.size;
      const messages = win.game.messages.contents.slice(size - 2, size);
      knownMessageCount = size;
      return messages.map((message) => ({
        id: message.id,
        total: message.rolls?.[0]?.total,
        formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, "")
      }));
    });
}

function applyDamageFromMessage(messageId) {
  cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
  // Foundry affiche aussi une notification "toast" éphémère du même message, avec son propre
  // bouton (même data-message-id) — retour de test déjà documenté (tier-c-rage.cy.js). Avec 2
  // messages postés coup sur coup (composant principal + secondaire), l'ordre DOM toast/log
  // n'est pas garanti et un `.first()` AVANT `.find()` peut sélectionner l'exemplaire encore
  // sans bouton monté : on cherche donc le bouton directement parmi TOUS les exemplaires.
  cy.get(`[data-message-id="${messageId}"]`, { timeout: 10000 }).find("button.dnd-apply-damage-btn").first().click();
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Arme à dégâts combinés (épée de feu = tranchant + feu)", () => {
  let casterId;
  let weaponId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Flaming Sword Fighter", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, {
            name: "Test Flaming Sword",
            type: "weapon",
            // Vrais dés (pas une valeur fixe "10") : nécessaire pour T-DMGTYPE-021 (critique) —
            // `Roll#alter` (rollDamage, rolls.js) ne double QUE les termes de dé, jamais un terme
            // numérique fixe. Les autres tests lisent toujours `roll.total` dynamiquement (jamais
            // une valeur codée en dur), donc indifférents à ce choix.
            system: {
              equipped: true,
              weaponType: "meleeMartial",
              damage: { dice: "1d10", type: "slashing" },
              secondaryDamage: { dice: "1d10", type: "fire" }
            }
          })
        );
      })
      .then((items) => {
        weaponId = items[0].id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  function rollWeaponDamage(targetTokenId) {
    targetToken(targetTokenId);
    cy.openActorSheet(casterId);
    goToTab("equipment");
    resetMessageBaseline();
    cy.get(".equipment-slot").eq(0).find(".equipment-roll-btn-damage").click();
    return lastTwoMessages().then((messages) => {
      cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
      return cy.wrap(messages);
    });
  }

  it("cible sans résistance : les 2 composants s'appliquent en plein, cumulés (T-DMGTYPE-019)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "No Resist Combined Target" }))
      .then(({ tokenId }) => {
        rollWeaponDamage(tokenId).then(([primary, secondary]) => {
          applyDamageFromMessage(primary.id);
          applyDamageFromMessage(secondary.id);
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "dégâts cumulés des 2 composants").to.equal(
              100 - primary.total - secondary.total
            );
          });
        });
      });
  });

  it("cible résistante au tranchant SEULEMENT : tranchant réduit de moitié, feu intégral (exemple de l'utilisateur) (T-DMGTYPE-020)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Slashing Only Resist Target", extraSystem: { damageResistances: ["slashing"] } }))
      .then(({ tokenId }) => {
        rollWeaponDamage(tokenId).then(([primary, secondary]) => {
          applyDamageFromMessage(primary.id);
          applyDamageFromMessage(secondary.id);
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "tranchant à moitié + feu intégral, résistance tranchante non contournée"
            ).to.equal(100 - Math.floor(primary.total / 2) - secondary.total);
          });
        });
      });
  });

  it("coup critique : les dés des 2 composants sont doublés (T-DMGTYPE-021)", () => {
    cy.window().then((win) => win.game.actors.get(casterId).items.get(weaponId).setFlag("dnd-custom-ai", "pendingCritical", true));
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Critical Combined Target" }))
      .then(({ tokenId }) => {
        rollWeaponDamage(tokenId).then(([primary, secondary]) => {
          // 2 dés au lieu d'1 (Roll#alter double les DiceTerm, jamais un terme numérique fixe —
          // même vérification par préfixe que Critique brutal, tier-a-mechanics.cy.js).
          expect(primary.formula, "composant principal : dés doublés").to.match(/^2d10/);
          expect(secondary.formula, "composant secondaire : dés doublés aussi").to.equal("2d10");
        });
      });
  });

  it("aucun composant secondaire configuré (arme normale) : un seul message posté, comportement inchangé (T-DMGTYPE-022)", () => {
    // Acteur DÉDIÉ (pas casterId, déjà équipé de "Test Flaming Sword" en Main principale) : une
    // arme équipée à la fois, même convention que le reste de ce système.
    let plainCasterId;
    cy.window()
      .then((win) => createActor(win, { name: "Plain Sword Fighter", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        plainCasterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, plainCasterId, {
            name: "Test Plain Sword",
            type: "weapon",
            system: { equipped: true, weaponType: "meleeMartial", damage: { dice: "10", type: "slashing" } }
          })
        );
      });
    cy.then(() => cy.openActorSheet(plainCasterId));
    goToTab("equipment");
    resetMessageBaseline();
    cy.get(".equipment-slot").eq(0).find(".equipment-roll-btn-damage").click();
    lastMessage().then(() => {
      // Attente réelle avant de revérifier l'absence de croissance : sans elle, un 2e jet
      // (bug hypothétique) posté de façon asynchrone pourrait ne pas encore être visible au
      // moment du check, donnant un faux positif.
      cy.wait(500);
      cy.window().should((win) => {
        expect(win.game.messages.size, "un seul message, pas de composant secondaire").to.equal(knownMessageCount);
      });
    });
  });
});

describe("Attaque de PNJ à dégâts combinés (morsure = perforant + poison)", () => {
  let attackerId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Venomous Biter",
          type: "npc",
          system: {
            attack: {
              ability: "str",
              bonus: 5,
              damage: { dice: "10", bonus: 0, type: "piercing" },
              secondaryDamage: { dice: "10", type: "poison" }
            }
          }
        })
      )
      .then((actor) => {
        attackerId = actor.id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("cible immunisée au poison : perforant plein, poison nul (T-DMGTYPE-023)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Poison Immune Bite Target", extraSystem: { damageImmunities: ["poison"] } }))
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
        // Remise à zéro APRÈS le jet de touche (message #1, sans bouton "Appliquer") : sinon
        // lastTwoMessages() peut se déclencher dès que 2 nouveaux messages existent (touche +
        // principal) et prendre le jet de touche pour le composant "primary" à tort — bug
        // constaté en test (bouton "Appliquer les dégâts" introuvable sur le jet de touche).
        cy.window().should((win) => {
          expect(win.game.messages.size, "jet de touche posté").to.be.greaterThan(knownMessageCount);
        });
        resetMessageBaseline();
        cy.get('button[data-action="rollAttackDamage"]').click();
        lastTwoMessages().then(([primary, secondary]) => {
          cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
          applyDamageFromMessage(primary.id);
          applyDamageFromMessage(secondary.id);
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "perforant plein, poison immunisé (aucun dégât de ce composant)"
            ).to.equal(hpBefore - primary.total);
          });
        });
      });
  });
});

describe("UI — les nouveaux champs 'Dégâts secondaires' soumettent réellement le formulaire natif", () => {
  it("fiche d'arme (T-DMGTYPE-024)", () => {
    cy.loginAsGM();
    let casterId;
    let weaponId;
    cy.window()
      .then((win) => createActor(win, { name: "UI Secondary Fighter", type: "character", system: { class: "fighter" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, { name: "Test UI Secondary Weapon", type: "weapon", system: { damage: { dice: "1d6", type: "slashing" } } })
        );
      })
      .then((items) => {
        weaponId = items[0].id;
        cy.window().then((win) => win.game.actors.get(casterId).items.get(weaponId).sheet.render(true));
      });
    // Le dé est soumis (blur) et RECONFIRMÉ persisté avant de toucher le select : sinon les 2
    // soumissions "change" quasi simultanées (blur du dé + change du select) peuvent partir en
    // parallèle contre le même Item et celle capturée en premier (dé seul, type encore vide)
    // peut résoudre APRÈS l'autre et écraser le type tout juste choisi — bug constaté en test.
    cy.get(".application.sheet.item", { timeout: 10000 }).find('input[name="system.secondaryDamage.dice"]').type("1d6").blur();
    cy.window().should((win) => {
      expect(win.game.actors.get(casterId).items.get(weaponId).system.secondaryDamage.dice, "dé secondaire persisté").to.equal("1d6");
    });
    cy.get(".application.sheet.item").find('select[name="system.secondaryDamage.type"]').select("fire");
    cy.window().should((win) => {
      const weapon = win.game.actors.get(casterId).items.get(weaponId);
      expect(weapon.system.secondaryDamage.dice, "dé secondaire toujours persisté").to.equal("1d6");
      expect(weapon.system.secondaryDamage.type, "type secondaire persisté").to.equal("fire");
    });
  });

  it("fiche PNJ (T-DMGTYPE-025)", () => {
    cy.loginAsGM();
    let npcId;
    cy.window()
      .then((win) => createNpcTarget(win, { name: "UI Secondary NPC" }))
      .then(({ actorId }) => {
        npcId = actorId;
        cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
      });
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    // Même précaution anti-race que T-DMGTYPE-024 (dé confirmé persisté avant le select).
    cy.get(".application.npc input[name=\"system.attack.secondaryDamage.dice\"]").type("1d4").blur();
    cy.window().should((win) => {
      expect(win.game.actors.get(npcId).system.attack.secondaryDamage.dice, "dé secondaire persisté (PNJ)").to.equal("1d4");
    });
    cy.get(".application.npc select[name=\"system.attack.secondaryDamage.type\"]").select("poison");
    cy.window().should((win) => {
      const npc = win.game.actors.get(npcId);
      expect(npc.system.attack.secondaryDamage.dice, "dé secondaire persisté (PNJ)").to.equal("1d4");
      expect(npc.system.attack.secondaryDamage.type, "type secondaire persisté (PNJ)").to.equal("poison");
    });
  });
});
