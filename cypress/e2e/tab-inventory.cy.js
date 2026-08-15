// Implémente la section 5 (T-INV-001 à T-INV-010) de tests/E2E_TEST_PLAN.md — onglet Inventaire
// (tab-inventory.hbs) et, pour les jets d'attaque/dégâts d'arme (T-INV-003/004/005), les boutons
// correspondants qui vivent en réalité sur l'onglet Équipement (tab-equipment.hbs) : une arme
// n'a de bouton de jet que si elle est équipée (cf. weaponStats, actor-sheet.js), et seul cet
// onglet les affiche — l'Inventaire n'en montre qu'un résumé texte non cliquable
// (`{{this.damageLabel}}`, tab-inventory.hbs). Vérifié dans le code avant d'écrire ces tests, pas
// une supposition.
//
// Vérification des jets (T-INV-003/004/005) : formule exacte du jet posté en chat (comme
// tab-stats.cy.js), pas son résultat — sauf T-INV-004 (touché/raté vs CA de la cible) qui se
// vérifie par construction en choisissant une CA cible hors de portée du jet plutôt qu'en
// contrôlant le dé (CA très basse = touché garanti quel que soit le jet, CA très haute = raté
// garanti), plus simple que cy.forceD20 ici.

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

// Même piège/même fix que dans tab-stats.cy.js (cf. son en-tête) : le clic ne fait que
// distribuer l'évènement DOM, le gestionnaire (rollCheck -> roll.toMessage()) continue de
// tourner après. Vérifier juste "un message avec une formule existe" ne suffit pas non plus :
// ça peut retomber sur le dernier message d'une AUTRE spec exécutée juste avant dans la même
// session (`npm run test:e2e:run` partage le même monde entre toutes les specs) — flake
// découvert sur un run combiné, 2026-08-15. `knownMessageCount` (mis à jour par
// resetMessageBaseline() dans le beforeEach, puis après chaque lecture ici) garantit qu'on
// attend un message réellement NOUVEAU.
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
        // Le "flavor" passé à roll.toMessage() (cf. rollCheck, helpers/rolls.js) — c'est là
        // qu'atterrit le libellé et, pour un jet d'attaque ciblé, la ligne Touché/Raté ajoutée
        // par compareToTargetAc. `content` n'est que le HTML généré par Foundry pour le rendu
        // du dé lui-même (juste le total), pas ce texte-là.
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

    // Objet volontairement très lourd pour dépasser la capacité de façon fiable, sans dépendre
    // du détail des poids réels des autres objets de la fixture.
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

    // Comparaison : un lanceur de sorts ne maîtrisant pas les armes de guerre (magicien,
    // cf. DND_CUSTOM.classWeaponProficiencies), équipé de la même arme — mod seul, sans bonus.
    // `withItemId(wizardId, ...)` DOIT être appelé depuis l'intérieur du `.then()` qui reçoit
    // `id` : construit hors de ce callback, `wizardId` vaudrait encore `undefined` au moment où
    // la commande est mise en file (elle ne s'exécute qu'après coup) — piège déjà rencontré,
    // cf. commentaire de withItemId ci-dessus.
    //
    // Ferme la fiche du personnage partagé (ouverte par le beforeEach) avant d'en créer un
    // autre : sinon les deux fiches restent ouvertes en même temps et sheetRoot() (qui matche
    // `.application.character`) devient ambigu — piège déjà rencontré dans tab-stats.cy.js.
    cy.window().then((win) => win.game.actors.get(sharedActorId).sheet.close());
    cy.createReadyCharacter({
      name: "Tab Inventory Wizard",
      origin: "ashar",
      classKey: "wizard",
      skills: ["arcana", "history"]
    }).then((wizardId) => {
      createdActorIds.push(wizardId);
      cy.window().then((win) => grantWorldItem(win, wizardId, "Épée longue"));

      // Le magicien démarre avec "Dague" équipée (classStartingEquipment.wizard, cf. config.js) :
      // sans la retirer, elle resterait dans la main principale au même titre que l'épée
      // longue (les deux "equipped: true" à la fois), et rien ne garantit laquelle des deux
      // findBySlot (actor-sheet.js) choisirait — la Dague est arrivée en premier au premier run
      // réel, faussant complètement le test (maîtrisée, contrairement à l'épée longue).
      withItemId(wizardId, "Dague", (daggerId) => {
        goToTab("inventory");
        cy.get(`tr[data-item-id="${daggerId}"] input[data-item-equipped]`).uncheck({ force: true });
      });

      withItemId(wizardId, "Épée longue", (weaponId) => {
        goToTab("inventory");
        cy.get(`tr[data-item-id="${weaponId}"] input[data-item-equipped]`).check({ force: true });
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

    // CA hors de portée du jet le plus haut possible (1d20 + bonus) : raté garanti, sans
    // contrôler le dé.
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

    // Maj-clic force l'alternative (seule voie réellement câblée dans le template pour ça,
    // cf. commentaire d'en-tête — le dataset `data-versatile` mentionné dans actor-sheet.js
    // n'est posé sur aucun bouton du template) : force le dé à une main (1d8) même main
    // secondaire encore libre.
    equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click({ shiftKey: true });
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("1d8"));
  });

  it("utiliser un objet de soin — PV + (base + bonus de compétence), plafonné au max (T-INV-006)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": 1 })));
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
        // `.should()` sur les DEUX vérifications ensemble (pas hp puis un `.then()` séparé pour
        // le message) : #applyHeal termine par `await ChatMessage.create(...)` APRÈS avoir mis à
        // jour les PV — un `.then()` isolé pour le message pourrait s'exécuter avant que cette
        // toute dernière étape asynchrone n'ait fini, même une fois les PV déjà à jour (piège
        // déjà rencontré ailleurs dans cette suite, cf. tab-stats.cy.js).
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
    // Un Joueur n'a pas la permission de créer un Token sur la scène ("User Player1 lacks
    // permission to create Token", découvert au premier run réel) : posé par le MJ en
    // préalable, comme le Combat de T-STATS-014 — la fiche est ensuite rouverte en session
    // Joueur pour le reste du test (chaque connexion recharge la page entièrement).
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
      // Allume : PV... pardon, la Capacité de lumière du token s'active, message de chat posté.
      cy.window().its("game.messages.size").then((before) => {
        cy.get(`tr[data-item-id="${itemId}"] button[data-action="useItem"]`).click();
        cy.window().should((win) => {
          expect(win.game.actors.get(sharedActorId).items.get(itemId).system.lit).to.be.true;
          expect(win.game.messages.size, "message de chat 'allumé' posté").to.be.greaterThan(before);
          const token = win.canvas.scene.tokens.get(tokenId);
          expect(token.light.bright, "lumière appliquée au token").to.be.greaterThan(0);
        });
      });

      // Éteint : deuxième clic, une seule source active à la fois (ici la même qu'on retire).
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
    // Même piège que T-INV-003 : ferme la fiche du personnage partagé avant d'en ouvrir une autre.
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
        // L'assistant vient de rouvrir la fiche sur son onglet initial (Statistiques) : basculer
        // explicitement sur l'Inventaire, contrairement au beforeEach qui ne le fait que pour le
        // personnage partagé.
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

      // Restaure une quantité normale pour ne pas fausser un test suivant réutilisant cet outil.
      cy.window().then((win) => {
        const tool = win.game.actors.get(sharedActorId).items.get(itemId);
        return tool.update(win.JSON.parse(win.JSON.stringify({ "system.quantity": 1 })));
      });
    });
  });
});
