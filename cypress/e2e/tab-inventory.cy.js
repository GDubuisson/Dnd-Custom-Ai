// T-INV-001 à 010 : onglet Inventaire ; les jets d'arme se font depuis l'onglet Équipement.
// Touché/Raté vérifié avec une CA cible hors de portée du jet.

const createdActorIds = [];
const createdSceneItemIds = []; // tokens créés sur la scène active, à nettoyer à part des Actors

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

function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}
function proficiencyBonusFor(level) {
  return Math.ceil(level / 4) + 1;
}
function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
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

// Attend un message réellement nouveau (monde partagé entre specs).
let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function lastMessageRoll() {
  return cy
    .window()
    .should((win) => {
      expect(win.game.messages.size, "un nouveau message de jet doit être posté").to.be.greaterThan(knownMessageCount);
    })
    .then((win) => {
      knownMessageCount = win.game.messages.size;
      const message = win.game.messages.contents.at(-1);
      return {
        formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, ""),
        total: message.rolls[0]?.total,
        // Libellé du jet, avec Touché/Raté.
        flavor: message.flavor
      };
    });
}

function grantWorldItem(win, actorId, itemName) {
  const worldItem = win.game.items.getName(itemName);
  expect(worldItem, `Item du monde '${itemName}' introuvable — importé ? (world-items/README.md)`).to.exist;
  return win.game.actors
    .get(actorId)
    .createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(worldItem.toObject()))]);
}

let sharedActorId;

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Tab Inventory Fighter",
    origin: "ravenmoor",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);
    cy.window().then((win) =>
      Promise.all([
        grantWorldItem(win, id, "Trousse de soins"),
        grantWorldItem(win, id, "Torche"),
        grantWorldItem(win, id, "Outils de voleur")
      ])
    );
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Onglet Inventaire", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    goToTab("inventory");
    resetMessageBaseline();
  });

  it("deux tableaux distincts — Armes/Armures d'un côté, Objets/Outils de l'autre (T-INV-001)", () => {
    withItemId(sharedActorId, "Épée longue", (weaponId) => {
      cy.get(".inventory-table").eq(0).find(`tr[data-item-id="${weaponId}"]`).should("exist");
      cy.get(".inventory-table").eq(1).find(`tr[data-item-id="${weaponId}"]`).should("not.exist");
    });
    withItemId(sharedActorId, "Trousse de soins", (gearId) => {
      cy.get(".inventory-table").eq(1).find(`tr[data-item-id="${gearId}"]`).should("exist");
      cy.get(".inventory-table").eq(0).find(`tr[data-item-id="${gearId}"]`).should("not.exist");
    });
  });

  it("poids porté et capacité de charge se recalculent, overCapacity au-delà (T-INV-002)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const items = actor.items.filter((item) => ["weapon", "armor", "gear", "tool"].includes(item.type));
      const carriedWeight = items.reduce((total, item) => total + (item.system.weight ?? 0) * (item.system.quantity ?? 1), 0);
      const capacity = actor.system.abilities.str.total * 7.5;
      const expectedPercent = Math.min(100, Math.round((carriedWeight / (capacity || 1)) * 100));

      cy.get(".capacity-bar-fill").invoke("attr", "style").should("include", `width: ${expectedPercent}%`);
      cy.get(".capacity-bar-fill").should(carriedWeight > capacity ? "have.class" : "not.have.class", "over-capacity");
    });

    // Objet très lourd pour dépasser la capacité de charge.
    cy.window().then((win) => {
      return win.game.actors
        .get(sharedActorId)
        .createEmbeddedDocuments("Item", [
          win.JSON.parse(
            win.JSON.stringify({ name: "Tab Inventory Test Anvil", type: "gear", system: { weight: 1000, quantity: 1 } })
          )
        ]);
    });
    cy.get(".capacity-bar-fill").should("have.class", "over-capacity");

    withItemId(sharedActorId, "Tab Inventory Test Anvil", (anvilId) => {
      cy.window().then((win) => win.game.actors.get(sharedActorId).deleteEmbeddedDocuments("Item", [anvilId]));
    });
    cy.get(".capacity-bar-fill").should("not.have.class", "over-capacity");
  });

  it("jet d'attaque d'arme — bonus de maîtrise seulement si la classe couvre la catégorie (T-INV-003)", () => {
    goToTab("equipment");
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const strMod = abilityModifier(actor.system.abilities.str.total);
      const prof = proficiencyBonusFor(actor.system.attributes.level);
      expect(actor.items.find((i) => i.name === "Épée longue").system.equipped, "prérequis : équipée").to.be.true;

      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula, "fighter maîtrise les armes de guerre : mod + bonus de maîtrise").to.equal(
          `1d20${formatModifier(strMod + prof)}`
        );
      });
    });

    // Comparaison avec un magicien non maîtrisé ; fiche partagée fermée avant.
    cy.window().then((win) => win.game.actors.get(sharedActorId).sheet.close());
    cy.createReadyCharacter({
      name: "Tab Inventory Wizard",
      origin: "ashar",
      classKey: "wizard",
      skills: ["arcana", "history"]
    }).then((wizardId) => {
      createdActorIds.push(wizardId);
      cy.window().then((win) => grantWorldItem(win, wizardId, "Épée longue"));

      // Retire la Dague équipée du magicien.
      withItemId(wizardId, "Dague", (daggerId) => {
        goToTab("inventory");
        cy.get(`tr[data-item-id="${daggerId}"] input[data-item-equipped]`).uncheck({ force: true }); // NOSONAR : case parfois signalée couverte après un changement d'onglet
      });

      withItemId(wizardId, "Épée longue", (weaponId) => {
        goToTab("inventory");
        cy.get(`tr[data-item-id="${weaponId}"] input[data-item-equipped]`).check({ force: true }); // NOSONAR : case parfois signalée couverte après un changement d'onglet
        goToTab("equipment");
        cy.window().then((win) => {
          const actor = win.game.actors.get(wizardId);
          const strMod = abilityModifier(actor.system.abilities.str.total);
          equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
          lastMessageRoll().then((roll) => {
            expect(roll.formula, "magicien non maîtrisé des armes de guerre : mod seul").to.equal(
              `1d20${formatModifier(strMod)}`
            );
          });
        });
      });
    });
  });

  it("jet d'attaque comparé à la CA de la cible ciblée (T-INV-004)", () => {
    let targetActorId;
    let tokenId;

    cy.loginAsGM();
    cy.window()
      .then((win) =>
        win.Actor.create(
          win.JSON.parse(
            win.JSON.stringify({ name: "Tab Inventory Target", type: "npc", system: { attributes: { ac: { value: 1 } } } })
          )
        )
      )
      .then((actor) => {
        targetActorId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) =>
          win.canvas.scene
            .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify({ actorId: actor.id, x: 100, y: 100 }))])
            .then((tokens) => {
              tokenId = tokens[0].id;
              createdSceneItemIds.push(tokenId);
            })
        );
      });

    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    goToTab("equipment");

    cy.window().then((win) => {
      const token = win.canvas.tokens.get(tokenId);
      token.setTarget(true, { releaseOthers: true });
    });
    equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Roll.AttackHit", { target: "Tab Inventory Target", ac: 1 }))
      .then((expectedLine) => {
        lastMessageRoll().then((roll) => {
          expect(roll.flavor).to.include(expectedLine);
        });
      });

    // CA hors de portée : raté garanti.
    cy.loginAsGM();
    cy.window().then((win) =>
      win.game.actors.get(targetActorId).update(win.JSON.parse(win.JSON.stringify({ "system.attributes.ac.value": 999 })))
    );
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    goToTab("equipment");
    cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
    equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Roll.AttackMiss", { target: "Tab Inventory Target", ac: 999 }))
      .then((expectedLine) => {
        lastMessageRoll().then((roll) => {
          expect(roll.flavor).to.include(expectedLine);
        });
      });
  });

  it("jet de dégâts — le dé suit l'équipement réel d'une arme Polyvalente (T-INV-005)", () => {
    goToTab("equipment");
    // Main secondaire libre : dé à deux mains (1d10).
    equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click();
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("1d10"));

    // Maj-clic : dé à une main (1d8).
    equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click({ shiftKey: true });
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("1d8"));
  });

  it("utiliser un objet de soin — PV + (base + bonus de compétence), plafonné au max (T-INV-006)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      // `dndCustomDamageApply` autorise la baisse de PV simulée.
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": 1 })), {
        dndCustomDamageApply: true
      });
    });

    withItemId(sharedActorId, "Trousse de soins", (itemId) => {
      cy.window().then((win) => {
        const actor = win.game.actors.get(sharedActorId);
        const prof = proficiencyBonusFor(actor.system.attributes.level);
        const medicine = actor.system.skills.medicine;
        const mod = abilityModifier(actor.system.abilities[medicine.ability].total) + (medicine.proficient ? prof : 0);
        const healBase = 1; // Trousse de soins, cf. world-items/gear.json
        const expectedAmount = Math.max(0, healBase + mod);

        cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
        // PV et message vérifiés ensemble (message créé après la mise à jour).
        cy.window().should((win2) => {
          const updated = win2.game.actors.get(sharedActorId);
          expect(updated.system.attributes.hp.value).to.equal(Math.min(1 + expectedAmount, updated.system.attributes.hp.max));
          expect(win2.game.messages.contents.at(-1).content).to.include(updated.name);
        });
      });
    });

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": actor.system.attributes.hp.max })));
    });
  });

  it("utiliser un objet de lumière — allume puis éteint le token de l'Actor (T-INV-007)", () => {
    let tokenId;
    // Token posé par le MJ.
    cy.loginAsGM();
    cy.window()
      .then((win) => win.game.actors.get(sharedActorId).getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 200, y: 200 }))))
      .then((tokenDoc) =>
        cy.window().then((win) =>
          win.canvas.scene.createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))]).then((tokens) => {
            tokenId = tokens[0].id;
            createdSceneItemIds.push(tokenId);
          })
        )
      );

    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    goToTab("inventory");

    withItemId(sharedActorId, "Torche", (itemId) => {
      // Allume la lumière du token, message posté.
      cy.window().its("game.messages.size").then((before) => {
        cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
        cy.window().should((win) => {
          expect(win.game.actors.get(sharedActorId).items.get(itemId).system.lit).to.be.true;
          expect(win.game.messages.size, "message de chat 'allumé' posté").to.be.greaterThan(before);
          const token = win.canvas.scene.tokens.get(tokenId);
          expect(token.light.bright, "lumière appliquée au token").to.be.greaterThan(0);
        });
      });

      // Éteint la même source.
      cy.window().its("game.messages.size").then((before) => {
        cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
        cy.window().should((win) => {
          expect(win.game.actors.get(sharedActorId).items.get(itemId).system.lit).to.be.false;
          expect(win.game.messages.size, "message de chat 'éteint' posté").to.be.greaterThan(before);
          const token = win.canvas.scene.tokens.get(tokenId);
          expect(token.light.bright).to.equal(0);
        });
      });
    });
  });

  it("utiliser un objet de lumière sans token sur la scène — avertissement, pas d'erreur (T-INV-008)", () => {
    let noTokenActorId;
    // Ferme la fiche partagée avant d'en ouvrir une autre.
    cy.window().then((win) => win.game.actors.get(sharedActorId).sheet.close());
    cy.createReadyCharacter({
      name: "Tab Inventory No Token",
      origin: "fleuraine",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((id) => {
      noTokenActorId = id;
      createdActorIds.push(id);
      cy.window().then((win) => grantWorldItem(win, id, "Torche"));

      withItemId(id, "Torche", (itemId) => {
        // Bascule sur l'Inventaire.
        goToTab("inventory");

        cy.window().then((win) => {
          expect(
            win.game.actors.get(id).getActiveTokens(),
            "prérequis : cet Actor n'a aucun token sur la scène active"
          ).to.have.length(0);
        });

        let warned = false;
        cy.window().then((win) => {
          const original = win.ui.notifications.warn.bind(win.ui.notifications);
          win.ui.notifications.warn = (message) => {
            warned = true;
            return original(message);
          };
        });

        cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
        cy.window().should(() => {
          expect(warned, "avertissement NoTokenOnScene attendu").to.be.true;
        });
      });
    });
  });

  it("utiliser un outil — test de compétence, quantité décrémentée (T-INV-009)", () => {
    withItemId(sharedActorId, "Outils de voleur", (itemId) => {
      cy.window().then((win) => {
        const actor = win.game.actors.get(sharedActorId);
        const tool = actor.items.get(itemId);
        const startingQuantity = tool.system.quantity;
        const prof = proficiencyBonusFor(actor.system.attributes.level);
        const dexMod = abilityModifier(actor.system.abilities.dex.total); // sleightOfHand -> dex
        const expectedMod = dexMod + prof + (tool.system.useEffect.bonus ?? 0);

        cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
        lastMessageRoll().then((roll) => {
          expect(roll.formula, "maîtrise de l'outil toujours appliquée + bonus fixe éventuel").to.equal(
            `1d20${formatModifier(expectedMod)}`
          );
        });
        cy.window().should((win2) => {
          expect(win2.game.actors.get(sharedActorId).items.get(itemId).system.quantity).to.equal(startingQuantity - 1);
        });
      });
    });
  });

  it("outil épuisé — avertissement, aucun jet effectué (T-INV-010)", () => {
    withItemId(sharedActorId, "Outils de voleur", (itemId) => {
      cy.window().then((win) => {
        const tool = win.game.actors.get(sharedActorId).items.get(itemId);
        return tool.update(win.JSON.parse(win.JSON.stringify({ "system.quantity": 0 })));
      });

      let warned = false;
      cy.window().then((win) => {
        const original = win.ui.notifications.warn.bind(win.ui.notifications);
        win.ui.notifications.warn = (message) => {
          warned = true;
          return original(message);
        };
      });

      cy.window().its("game.messages.size").then((before) => {
        cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
        cy.window().should((win) => {
          expect(warned, "avertissement attendu").to.be.true;
          expect(win.game.messages.size, "aucun jet ne doit être posté").to.equal(before);
        });
      });

      // Restaure la quantité de l'outil.
      cy.window().then((win) => {
        const tool = win.game.actors.get(sharedActorId).items.get(itemId);
        return tool.update(win.JSON.parse(win.JSON.stringify({ "system.quantity": 1 })));
      });
    });
  });
});

// Équipement ajouté en 1.0.5 : potion à dés consommable, arme +1, accessoire de protection.
describe("Onglet Inventaire — équipement magique et potions", () => {
  // Attend, en session MJ, que l'import automatique ait créé les nouveaux objets du monde.
  before(() => {
    cy.loginAsGM();
    cy.window({ timeout: 60000 }).should((win) => {
      for (const name of ["Préparation rituelle de guérison", "Épée longue +1", "Cape de protection"]) {
        expect(win.game.items.getName(name), `${name} importé`).to.exist;
      }
    });
  });

  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    goToTab("inventory");
    resetMessageBaseline();
  });

  it("préparation rituelle de guérison — 2d4 + 2 PV, une fiole consommée, refusée une fois épuisée (T-INV-011)", () => {
    cy.window().then((win) => grantWorldItem(win, sharedActorId, "Préparation rituelle de guérison"));
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      // `dndCustomDamageApply` autorise la baisse de PV simulée.
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": 1 })), {
        dndCustomDamageApply: true
      });
    });

    withItemId(sharedActorId, "Préparation rituelle de guérison", (itemId) => {
      cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula).to.equal("2d4+2");
        cy.window().should((win) => {
          const actor = win.game.actors.get(sharedActorId);
          expect(actor.system.attributes.hp.value).to.equal(Math.min(1 + roll.total, actor.system.attributes.hp.max));
          expect(actor.items.get(itemId).system.quantity, "une fiole consommée").to.equal(0);
        });
      });

      // Épuisée : aucun nouveau jet.
      cy.window().its("game.messages.size").then((before) => {
        cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
        cy.wait(500);
        cy.window().its("game.messages.size").should("equal", before);
      });
      cy.window().then((win) => win.game.actors.get(sharedActorId).deleteEmbeddedDocuments("Item", [itemId]));
    });

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": actor.system.attributes.hp.max })));
    });
  });

  it("arme +1 — bonus magique ajouté au jet d'attaque et aux dégâts (T-INV-012)", () => {
    cy.window().then((win) => grantWorldItem(win, sharedActorId, "Épée longue +1"));
    withItemId(sharedActorId, "Épée longue", (baseId) => {
      cy.get(`tr[data-item-id="${baseId}"] input[data-item-equipped]`).uncheck({ force: true }); // NOSONAR : case parfois signalée couverte après un changement d'onglet
    });
    withItemId(sharedActorId, "Épée longue +1", (magicId) => {
      cy.get(`tr[data-item-id="${magicId}"] input[data-item-equipped]`).check({ force: true }); // NOSONAR : case parfois signalée couverte après un changement d'onglet
      goToTab("equipment");
      cy.window().then((win) => {
        const actor = win.game.actors.get(sharedActorId);
        const strMod = abilityModifier(actor.system.abilities.str.total);
        const prof = proficiencyBonusFor(actor.system.attributes.level);

        equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
        lastMessageRoll().then((roll) => {
          expect(roll.formula).to.equal(`1d20${formatModifier(strMod + prof + 1)}`);
        });
        equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click();
        lastMessageRoll().then((roll) => {
          expect(roll.formula).to.equal(`1d10${formatModifier(strMod + 1)}`);
        });
      });

      // Rétablit l'Épée longue de base, attendue par les autres tests.
      goToTab("inventory");
      cy.window().then((win) => win.game.actors.get(sharedActorId).deleteEmbeddedDocuments("Item", [magicId]));
    });
    withItemId(sharedActorId, "Épée longue", (baseId) => {
      cy.get(`tr[data-item-id="${baseId}"] input[data-item-equipped]`).check({ force: true }); // NOSONAR : case parfois signalée couverte après un changement d'onglet
    });
  });

  it("cape de protection équipée — +1 CA et +1 aux jets de sauvegarde (T-INV-013)", () => {
    let acBefore;
    cy.window().then((win) => {
      acBefore = win.game.actors.get(sharedActorId).system.attributes.ac.value;
      return grantWorldItem(win, sharedActorId, "Cape de protection");
    });
    withItemId(sharedActorId, "Cape de protection", (cloakId) => {
      cy.get(`tr[data-item-id="${cloakId}"] input[data-item-equipped]`).check({ force: true }); // NOSONAR : case parfois signalée couverte après un changement d'onglet
      cy.window().should((win) => {
        const actor = win.game.actors.get(sharedActorId);
        expect(actor.system.attributes.ac.value).to.equal(acBefore + 1);
        expect(actor.system.attributes.saveBonus).to.equal(1);
      });

      goToTab("stats");
      cy.window().then((win) => {
        const actor = win.game.actors.get(sharedActorId);
        const dexMod = abilityModifier(actor.system.abilities.dex.total);
        const prof = actor.system.saves.dex.proficient ? proficiencyBonusFor(actor.system.attributes.level) : 0;
        sheetRoot().find('button[data-action="rollSave"][data-key="dex"]').click();
        lastMessageRoll().then((roll) => {
          expect(roll.formula).to.equal(`1d20${formatModifier(dexMod + prof + 1)}`);
        });
      });
      cy.window().then((win) => win.game.actors.get(sharedActorId).deleteEmbeddedDocuments("Item", [cloakId]));
    });
  });
});
