// Chantier "prérequis Évasion/Tour de magie renforcé" (Niveau C, 2026-08-24, cadré avec
// l'utilisateur avant implémentation) : jusqu'ici, le bouton "Appliquer les dégâts" ignorait
// TOUJOURS le résultat du jet de sauvegarde d'un sort à `halfOnSave` — dégâts pleins appliqués
// quel que soit réussite/échec. Ce chantier corrige la règle SRD par défaut (réussite = moitié
// si `halfOnSave`, sinon 0 ; échec = plein) ET les 2 exceptions qui en dépendaient :
// - Évasion (Roublard 7) : réussite = AUCUN dégât, échec = moitié (au lieu de plein).
// - Tour de magie renforcé (Magicien Évocation 6) : réussite à un TOUR DE MAGIE sans
//   `halfOnSave` = moitié au lieu d'aucun.
// Mécanisme : #onCastSpell (actor-sheet.js) pose sur CHAQUE cible un flag
// `pendingSpellSaveOutcome` ({success, halfOnSave, ability, spellLevel, spellName}) ; rollDamage
// (rolls.js) transporte désormais `spellName` sur le message de dégâts ; applyDamageToTargets
// (dnd-custom-ai.js) ne réduit les dégâts QUE si `isSpellDamage` ET que le `spellName` du flag
// correspond EXACTEMENT à celui du jet de dégâts appliqué — sinon dégâts pleins, flag conservé
// pour le bon jet de dégâts s'il arrive plus tard (jamais consommé par erreur).

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
      return { id: message.id, total: message.rolls?.[0]?.total };
    });
}

// Cast (jet de sauvegarde forcé sur `forcedFace`) puis jet de dégâts séparé du même Sort — même
// séquencement que tier-c-ancients-veil.cy.js (castSpell, bouton "Dégâts" distinct).
function castSaveSpellAndRollDamage(casterId, itemName, targetTokenId, forcedFace) {
  targetToken(targetTokenId);
  cy.openActorSheet(casterId);
  goToTab("abilities");
  cy.forceD20(forcedFace);
  withItemId(casterId, itemName, (itemId) => {
    cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
  });
  // Attente réelle (pas seulement une frontière de commande Cypress) : #onCastSpell (branche
  // sauvegarde) est asynchrone (boucle par cible, chaque jet + setFlag + toMessage awaité) et
  // Cypress ne patiente PAS la fin de cette chaîne interne après un simple .click() — sans cette
  // pause, le clic suivant ("Dégâts") peut s'exécuter alors que le flag pendingSpellSaveOutcome
  // de CE cast n'est pas encore posé (retour de test : observé en instrumentant la production,
  // le flag lu juste après portait encore les données d'un cast précédent).
  cy.wait(1000);
  return withItemId(casterId, itemName, (itemId) => {
    resetMessageBaseline();
    cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
    return lastMessage().then((roll) => {
      cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
      return cy.wrap(roll);
    });
  });
}

function applyDamageFromMessage(messageId) {
  cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
  // .first() : Foundry affiche aussi une notification "toast" éphémère du même message, avec son
  // propre bouton (même data-message-id) — retour de test déjà documenté (tier-c-rage.cy.js).
  cy.get(`[data-message-id="${messageId}"]`, { timeout: 10000 }).first().find("button.dnd-apply-damage-btn").click();
}

function createNpcTarget(win, { name, extraItems = [] }) {
  return createActor(win, {
    name,
    type: "npc",
    system: { attributes: { hp: { value: 100, max: 100 } }, abilities: { dex: { mod: 0 } } }
  }).then((actor) =>
    (extraItems.length
      ? win.game.actors.get(actor.id).createEmbeddedDocuments("Item", win.JSON.parse(win.JSON.stringify(extraItems)))
      : Promise.resolve())
      .then(() => createToken(win, actor.id, 1000, 1000))
      .then((tokenId) => ({ actorId: actor.id, tokenId }))
  );
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("halfOnSave par défaut — réussite = moitié, échec = plein", () => {
  let casterId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "HalfOnSave Wizard", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, {
            name: "Test Baseline Bolt",
            type: "spell",
            system: { classes: ["wizard"], level: 0, save: { ability: "dex", halfOnSave: true }, damage: { dice: "10", type: "fire" } }
          })
        );
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("réussite (jet forcé à 20, DD 10) : dégâts réduits de moitié (T-TIERC-HALFSAVE-001)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Baseline Success Target" }))
      .then(({ actorId, tokenId }) => {
        castSaveSpellAndRollDamage(casterId, "Test Baseline Bolt", tokenId, 20).then((roll) => {
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "réussite : moitié des dégâts").to.equal(
              100 - Math.floor(roll.total / 2)
            );
          });
        });
      });
  });

  it("échec (jet forcé à 1, DD 10) : dégâts pleins (T-TIERC-HALFSAVE-002)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Baseline Fail Target" }))
      .then(({ actorId, tokenId }) => {
        castSaveSpellAndRollDamage(casterId, "Test Baseline Bolt", tokenId, 1).then((roll) => {
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "échec : dégâts pleins").to.equal(
              100 - roll.total
            );
          });
        });
      });
  });
});

describe("Évasion (Roublard 7) — réussite = aucun dégât, échec = moitié", () => {
  let casterId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Evasion Test Wizard", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          createItem(win, casterId, {
            name: "Test Evasion Bolt",
            type: "spell",
            system: { classes: ["wizard"], level: 0, save: { ability: "dex", halfOnSave: true }, damage: { dice: "10", type: "fire" } }
          })
        );
      });
  });

  beforeEach(() => cy.loginAsGM());

  // "Évasion" sur un PNJ (pas un Roublard PJ) : la cible réelle SRD serait un personnage joueur,
  // mais un lanceur "character" contre une cible "character" est bloqué par le garde-fou PvP
  // (dnd-custom-ai.js > applyDamageToTargets, aucun contournement MJ) — seul un PNJ évite ce
  // blocage. Le mécanisme testé (hasFeature("Évasion") sur la cible) est indifférent au type
  // d'Actor qui la porte.
  it("réussite (jet forcé à 20, DD 10) : aucun dégât (T-TIERC-EVASION-001)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Evasion Success Target", extraItems: [{ name: "Évasion", type: "feature", system: {} }] }))
      .then(({ actorId, tokenId }) => {
        castSaveSpellAndRollDamage(casterId, "Test Evasion Bolt", tokenId, 20).then((roll) => {
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "Évasion, réussite : aucun dégât").to.equal(100);
          });
        });
      });
  });

  it("échec (jet forcé à 1, DD 10) : moitié des dégâts (T-TIERC-EVASION-002)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Evasion Fail Target", extraItems: [{ name: "Évasion", type: "feature", system: {} }] }))
      .then(({ actorId, tokenId }) => {
        castSaveSpellAndRollDamage(casterId, "Test Evasion Bolt", tokenId, 1).then((roll) => {
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value, "Évasion, échec : moitié des dégâts").to.equal(
              100 - Math.floor(roll.total / 2)
            );
          });
        });
      });
  });
});

describe("Tour de magie renforcé (Magicien Évocation 6) — réussite à un tour de magie = moitié au lieu d'aucun", () => {
  let casterId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Potent Cantrip Wizard", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          Promise.all([
            createItem(win, casterId, {
              name: "Test Potent Cantrip",
              type: "spell",
              // Tour de magie (niveau 0), halfOnSave FAUX : le cas SRD par défaut où une réussite
              // n'inflige normalement AUCUN dégât — celui que Tour de magie renforcé change.
              system: { classes: ["wizard"], level: 0, save: { ability: "dex", halfOnSave: false }, damage: { dice: "10", type: "fire" } }
            }),
            createItem(win, casterId, { name: "Tour de magie renforcé", type: "feature", system: {} })
          ])
        );
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("réussite (jet forcé à 20, DD 10) : moitié des dégâts au lieu d'aucun (T-TIERC-POTENT-001)", () => {
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Potent Cantrip Success Target" }))
      .then(({ actorId, tokenId }) => {
        castSaveSpellAndRollDamage(casterId, "Test Potent Cantrip", tokenId, 20).then((roll) => {
          applyDamageFromMessage(roll.id);
          cy.window().should((win) => {
            expect(
              win.canvas.tokens.get(tokenId).actor.system.attributes.hp.value,
              "Tour de magie renforcé, réussite : moitié des dégâts"
            ).to.equal(100 - Math.floor(roll.total / 2));
          });
        });
      });
  });
});

describe("spellName ne correspond pas — dégâts pleins, flag conservé pour le bon sort", () => {
  let casterId;
  let targetActorId;
  let targetTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Mismatch Test Wizard", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        casterId = actor.id;
        return cy.window().then((win) =>
          Promise.all([
            createItem(win, casterId, {
              name: "Test Mismatch Save Spell",
              type: "spell",
              system: { classes: ["wizard"], level: 0, save: { ability: "dex", halfOnSave: true }, damage: { dice: "10", type: "fire" } }
            }),
            createItem(win, casterId, {
              name: "Test Mismatch Other Spell",
              type: "spell",
              system: { classes: ["wizard"], level: 0, damage: { dice: "10", type: "fire" } }
            })
          ])
        );
      });
    cy.window()
      .then((win) => createNpcTarget(win, { name: "Mismatch Target" }))
      .then(({ actorId, tokenId }) => {
        targetActorId = actorId;
        targetTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("réussite du sort A, dégâts appliqués pour le sort B (différent) : plein (le flag de A n'est pas consommé) (T-TIERC-MISMATCH-001)", () => {
    // Sort A : jet de sauvegarde réussi (forcé à 20), mais JAMAIS de jet de dégâts pour lui ici.
    targetToken(targetTokenId);
    cy.openActorSheet(casterId);
    goToTab("abilities");
    cy.forceD20(20);
    withItemId(casterId, "Test Mismatch Save Spell", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
    });
    // Attente réelle : cf. commentaire de castSaveSpellAndRollDamage (Cypress ne patiente pas la
    // fin de la chaîne asynchrone interne de #onCastSpell après un simple .click()).
    cy.wait(1000);

    // Sort B : aucun jet de sauvegarde (pas de champ `save`), cast puis dégâts appliqués tout de
    // suite — doit prendre les dégâts PLEINS malgré le flag de succès du sort A encore présent.
    withItemId(casterId, "Test Mismatch Other Spell", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
    });
    cy.wait(1000);
    withItemId(casterId, "Test Mismatch Other Spell", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      lastMessage().then((rollB) => {
        applyDamageFromMessage(rollB.id);
        cy.window().should((win) => {
          expect(
            win.canvas.tokens.get(targetTokenId).actor.system.attributes.hp.value,
            "sort B (spellName différent) : dégâts pleins, pas réduits par le succès du sort A"
          ).to.equal(100 - rollB.total);
        });
      });
    });

    // Le flag du sort A doit être resté intact (jamais consommé par le sort B) : son propre jet
    // de dégâts, appliqué maintenant, doit toujours refléter la réussite (aucun dégât puisque
    // halfOnSave ici... non, ce Sort n'a pas Évasion sur la cible, donc moitié).
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    goToTab("abilities");
    withItemId(casterId, "Test Mismatch Save Spell", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      lastMessage().then((rollA) => {
        let hpBefore;
        cy.window().then((win) => {
          hpBefore = win.canvas.tokens.get(targetTokenId).actor.system.attributes.hp.value;
        });
        applyDamageFromMessage(rollA.id);
        cy.window().should((win) => {
          expect(
            win.canvas.tokens.get(targetTokenId).actor.system.attributes.hp.value,
            "sort A (flag préservé) : réduit de moitié malgré le sort B entre-temps"
          ).to.equal(hpBefore - Math.floor(rollA.total / 2));
        });
      });
    });
  });
});
