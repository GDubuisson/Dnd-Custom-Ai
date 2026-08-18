// Coups et échecs critiques sur 1/20 naturel (retour de test explicite, 2026-08-16, cf.
// ClaudeFiles/CONCEPTION_TECHNIQUE.md section "Jets de dés") — UNIQUEMENT pendant un combat
// actif (`rollCheck` > `criticalRules`, scripts/helpers/rolls.js), sur les jets d'attaque (arme/sort) et de
// sauvegarde. Pas de section dédiée dans tests/E2E_TEST_PLAN.md au moment de l'écriture (plan
// déjà "chantier terminé" avant ce retour) — IDs T-CRIT-001 et suivants, à ajouter au plan si
// une future relecture globale a lieu.
//
// Preuve "même s'il y a des bonus" (dixit le retour) : les tests d'attaque ciblent une CA
// délibérément hors de portée dans le sens INVERSE de ce qu'on force — CA=1 (touché garanti par
// n'importe quel bonus réaliste) avec un 1 naturel forcé doit quand même RATER ; CA=999 (raté
// garanti par n'importe quel bonus réaliste) avec un 20 naturel forcé doit quand même TOUCHER.
// Même technique de CA extrême que tab-inventory.cy.js > T-INV-004, combinée à cy.forceD20 (pas
// utilisé ensemble jusqu'ici) pour contrôler à la fois le dé ET rendre la preuve rigoureuse.

const createdActorIds = [];
const createdCombatIds = [];
const createdSceneItemIds = [];

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

// Même piège/même fix que tab-inventory.cy.js/tab-stats.cy.js (cf. leur en-tête) : attend un
// message réellement NOUVEAU, pas juste "un message existe".
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
        flavor: message.flavor
      };
    });
}

// Création d'Actor/Token réservée au MJ (permission Foundry, même piège que
// tab-inventory.cy.js > T-INV-004) : bascule la session, laisse l'appelant repasser en Joueur
// une fois la cible prête.
function createTarget(name, ac) {
  let tokenId;
  cy.loginAsGM();
  return cy
    .window()
    .then((win) =>
      win.Actor.create(win.JSON.parse(win.JSON.stringify({ name, type: "npc", system: { attributes: { ac: { value: ac } } } })))
    )
    .then((actor) => {
      createdActorIds.push(actor.id);
      return cy.window().then((win) =>
        win.canvas.scene
          .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify({ actorId: actor.id, x: 200, y: 200 }))])
          .then((tokens) => {
            tokenId = tokens[0].id;
            createdSceneItemIds.push(tokenId);
            return tokenId;
          })
      );
    });
}

function targetToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
}

let fighterId;
let wizardId;

before(() => {
  // Créés en session Joueur (comme toute autre spec, cf. cy.createReadyCharacter) : un Actor
  // créé sous une session MJ n'est PAS automatiquement lié au Joueur (cf. wizard.cy.js >
  // T-WIZ-013) — les rouvrir/y jouer plus tard en session Joueur échouerait sinon par manque de
  // permission.
  cy.loginAsPlayer();

  cy.createReadyCharacter({
    name: "Crit Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    fighterId = id;
    createdActorIds.push(id);
  });

  cy.createReadyCharacter({
    name: "Crit Wizard",
    origin: "ashar",
    classKey: "wizard",
    skills: ["arcana", "history"]
  }).then((id) => {
    wizardId = id;
    createdActorIds.push(id);
    cy.window().then((win) => grantCompendiumItem(win, id, "sorts", "Trait de feu"));
  });

  // Combat + les deux Actors Combattants dès le départ (création de Combat/Combattant réservée
  // au MJ) — les scénarios "hors combat" retirent explicitement le Combattant concerné plutôt
  // que de créer un second Actor dédié.
  cy.loginAsGM();
  cy.window().then((win) =>
    win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
      createdCombatIds.push(combat.id);
      return combat.createEmbeddedDocuments(
        "Combatant",
        win.JSON.parse(win.JSON.stringify([{ actorId: fighterId, initiative: 10 }, { actorId: wizardId, initiative: 5 }]))
      );
    })
  );
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Critiques en combat — jet d'attaque d'arme", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("20 naturel touche automatiquement même une CA hors de portée, et double les dés de dégâts (T-CRIT-001)", () => {
    createTarget("Crit Target High AC", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      cy.forceD20(20);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => ({
          hit: i18n.format("DND_CUSTOM.Roll.AttackHit", { target: "Crit Target High AC", ac: 999 }),
          crit: i18n.localize("DND_CUSTOM.Roll.CriticalHit")
        }))
        .then(({ hit, crit }) => {
          lastMessageRoll().then((roll) => {
            expect(roll.flavor, "touché malgré une CA de 999").to.include(hit);
            expect(roll.flavor, "libellé Coup critique affiché").to.include(crit);
            // Retour de test : le modificateur ne doit plus apparaître dans le résultat affiché
            // sur un critique — juste le d20 naturel (cf. rollCheck > messageRoll, rolls.js).
            expect(roll.formula, "aucun modificateur affiché sur un coup critique").to.equal("1d20");
          });
        });

      // Dégâts doublés au clic suivant sur CETTE arme (Épée longue, 1d10 par défaut à deux
      // mains — aucune main secondaire équipée sur ce personnage, cf. cy.createReadyCharacter).
      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula, "dés doublés (2d10 au lieu de 1d10)").to.include("2d10");
      });
    });
  });

  it("1 naturel rate automatiquement même une CA très basse (T-CRIT-002)", () => {
    createTarget("Crit Target Low AC", 1).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      cy.forceD20(1);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => ({
          miss: i18n.format("DND_CUSTOM.Roll.AttackMiss", { target: "Crit Target Low AC", ac: 1 }),
          fumble: i18n.localize("DND_CUSTOM.Roll.CriticalFumble")
        }))
        .then(({ miss, fumble }) => {
          lastMessageRoll().then((roll) => {
            expect(roll.flavor, "raté malgré une CA de 1").to.include(miss);
            expect(roll.flavor, "libellé Échec critique affiché").to.include(fumble);
            expect(roll.formula, "aucun modificateur affiché sur un échec critique").to.equal("1d20");
          });
        });
    });
  });

  it("20 naturel HORS combat : pas de libellé critique, comparaison normale à la CA (T-CRIT-003)", () => {
    // Modifier un Combattant est réservé au MJ (même piège que la création de cible).
    cy.loginAsGM();
    cy.window().then((win) => win.game.combat?.combatants.find((c) => c.actor?.id === fighterId)?.delete());

    createTarget("Crit Target Out Of Combat", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      cy.forceD20(20);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => ({
          miss: i18n.format("DND_CUSTOM.Roll.AttackMiss", { target: "Crit Target Out Of Combat", ac: 999 }),
          crit: i18n.localize("DND_CUSTOM.Roll.CriticalHit")
        }))
        .then(({ miss, crit }) => {
          lastMessageRoll().then((roll) => {
            expect(roll.flavor, "comparaison normale : raté contre CA 999 hors combat").to.include(miss);
            expect(roll.flavor, "aucun libellé critique hors combat").not.to.include(crit);
          });
        });
    });

    // Remet le personnage en combat pour les tests suivants de ce fichier (MJ requis).
    cy.loginAsGM();
    cy.window().then((win) =>
      win.game.combat.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId: fighterId, initiative: 10 }])))
    );
  });
});

describe("Critiques en combat — jet d'attaque de sort", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("20 naturel touche automatiquement un sort d'attaque, et double ses dés de dégâts (T-CRIT-004)", () => {
    createTarget("Crit Spell Target", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(wizardId);
      goToTab("abilities");

      withItemId(wizardId, "Trait de feu", (itemId) => {
        resetMessageBaseline();
        cy.forceD20(20);
        targetToken(tokenId);
        cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();

        cy.window()
          .its("game.i18n")
          .then((i18n) => i18n.localize("DND_CUSTOM.Roll.CriticalHit"))
          .then((crit) => {
            lastMessageRoll().then((roll) => {
              expect(roll.flavor, "libellé Coup critique affiché").to.include(crit);
              expect(roll.formula, "aucun modificateur affiché sur un coup critique").to.equal("1d20");
            });
          });

        resetMessageBaseline();
        cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
        lastMessageRoll().then((roll) => {
          expect(roll.formula, "dés doublés (2d10 au lieu de 1d10, cf. Trait de feu)").to.equal("2d10");
        });
      });
    });
  });
});

describe("Critiques en combat — jet de sauvegarde", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("1 naturel EN combat : libellé Échec critique affiché (T-CRIT-005)", () => {
    cy.openActorSheet(fighterId);
    resetMessageBaseline();
    cy.forceD20(1);
    sheetRoot().find('button[data-action="rollSave"][data-key="str"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Roll.CriticalFumble"))
      .then((fumble) => {
        lastMessageRoll().then((roll) => {
          expect(roll.flavor, "libellé Échec critique affiché sur une sauvegarde en combat").to.include(fumble);
          expect(roll.formula, "aucun modificateur affiché sur un échec critique").to.equal("1d20");
        });
      });
  });

  it("20 naturel HORS combat : aucun libellé critique sur une sauvegarde (T-CRIT-006)", () => {
    cy.loginAsGM();
    cy.window().then((win) => win.game.combat?.combatants.find((c) => c.actor?.id === fighterId)?.delete());
    cy.loginAsPlayer();

    cy.openActorSheet(fighterId);
    resetMessageBaseline();
    cy.forceD20(20);
    sheetRoot().find('button[data-action="rollSave"][data-key="str"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Roll.CriticalHit"))
      .then((crit) => {
        lastMessageRoll().then((roll) => {
          expect(roll.flavor, "aucun libellé critique sur une sauvegarde hors combat").not.to.include(crit);
        });
      });

    cy.loginAsGM();
    cy.window().then((win) =>
      win.game.combat?.createEmbeddedDocuments("Combatant", win.JSON.parse(win.JSON.stringify([{ actorId: fighterId, initiative: 10 }])))
    );
  });
});

// Retour de test (lot 3, point 8) : au-delà du libellé texte déjà couvert ci-dessus, la carte
// de jet elle-même (`.dice-roll`) doit porter un effet visuel dédié — bordure/halo + icône
// distincte, jamais la couleur seule (cf. flags criticalHit/criticalFumble, rolls.js ; hook
// renderChatMessageHTML, dnd-custom-ai.js).
describe("Critiques en combat — effet visuel sur la carte de jet", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("coup critique : bordure et icône dédiées sur la carte de jet, dégâts doublés inclus (T-CRIT-007)", () => {
    createTarget("Crit Visual Target High AC", 999).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      cy.forceD20(20);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      lastMessageRoll();

      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(".chat-message").last().within(() => {
        cy.get(".dice-roll").should("have.class", "dnd-critical-hit");
        cy.get(".dice-total .dnd-critical-icon.fa-burst").should("exist");
      });

      // Le jet de dégâts doublé qui suit (même mécanique que T-CRIT-001) profite du même effet.
      resetMessageBaseline();
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-damage").click();
      lastMessageRoll();
      cy.get(".chat-message").last().within(() => {
        cy.get(".dice-roll").should("have.class", "dnd-critical-hit");
        cy.get(".dice-total .dnd-critical-icon.fa-burst").should("exist");
      });
    });
  });

  it("échec critique : bordure et icône dédiées, distinctes du coup critique (T-CRIT-008)", () => {
    createTarget("Crit Visual Target Low AC", 1).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      cy.forceD20(1);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      lastMessageRoll();

      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(".chat-message")
        .last()
        .within(() => {
          cy.get(".dice-roll").should("have.class", "dnd-critical-fumble").and("not.have.class", "dnd-critical-hit");
          cy.get(".dice-total .dnd-critical-icon.fa-skull-crossbones").should("exist");
        });
    });
  });

  it("jet normal (sans critique) : aucune des deux classes, aucune icône ajoutée (T-CRIT-009)", () => {
    createTarget("Crit Visual Target Normal", 5).then((tokenId) => {
      cy.loginAsPlayer();
      cy.openActorSheet(fighterId);
      goToTab("equipment");
      resetMessageBaseline();
      cy.forceD20(10);
      targetToken(tokenId);
      equipmentSlotEl(MAIN_HAND).find(".equipment-roll-btn-attack").click();
      lastMessageRoll();

      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(".chat-message")
        .last()
        .within(() => {
          cy.get(".dice-roll").should("not.have.class", "dnd-critical-hit").and("not.have.class", "dnd-critical-fumble");
          cy.get(".dnd-critical-icon").should("not.exist");
        });
    });
  });
});
