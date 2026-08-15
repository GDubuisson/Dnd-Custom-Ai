// Implémente la section 6 (T-ABIL-001 à T-ABIL-020) de tests/E2E_TEST_PLAN.md — onglet
// Capacités/Sorts (tab-abilities.hbs + partials par classe). T-ABIL-021 (régénération de la
// réaction en début de tour) est marqué "Quench" seul dans le plan : implémenté dans
// tests/quench/quench-tests.js, pas ici.
//
// Bug connu (cf. [[project_bug_grant_class_content_locale]], tests/README.md, T-STATS-012 dans
// tab-stats.cy.js) : grantClassContent ne donne jamais de Capacité/Sort de classe sous ce monde
// de test (langue anglaise) — TOUTES les Capacités/tous les Sorts utilisés ici sont donc
// octroyés directement depuis leur compendium (cf. grantCompendiumItem), jamais via l'assistant
// de création. Sans rapport avec la classe "officielle" du personnage qui les reçoit (le code de
// #onCastSpell/#onRollFeature ne revérifie jamais l'éligibilité de classe à l'utilisation, seul
// grantClassContent le fait au moment d'octroyer — donc un personnage Magicien peut très bien
// recevoir manuellement un sort de Clerc pour isoler un seul mécanisme à la fois, ex. T-ABIL-013).

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

function updateActor(win, actor, data) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)));
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

// Même piège/même fix que tab-stats.cy.js/tab-inventory.cy.js (cf. leur en-tête) : attend un
// message réellement NOUVEAU (compte de game.messages en hausse depuis un repère), pas juste
// "un message existe" — sinon on peut retomber sur le dernier message d'une autre spec/d'une
// action précédente de la même session.
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
      return {
        formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, ""),
        total: message.rolls[0]?.total,
        flavor: message.flavor,
        content: message.content
      };
    });
}

// Octroie un Item du compendium `packName` (packs/capacites ou packs/sorts) par son nom exact,
// jamais via grantClassContent (cf. commentaire d'en-tête).
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

let fighterId; // Second souffle, Imposition des mains, Attaque d'opportunité (+ Sentinelle, T-ABIL-009)
let moineId; // Ki (réserve) + Rafale de coups (technique consommant la réserve)
let wizardId; // Trait de feu, Projectile magique, Bouclier, Contresort, Bénédiction, Invisibilité,
// Lumière, Parler aux animaux + Incantation rituelle (Druide)
let noClassId; // Origine posée, Classe vide (T-ABIL-002) — créé directement, sans passer par l'assistant

before(() => {
  cy.loginAsPlayer();

  cy.createReadyCharacter({ name: "Tab Abilities Fighter", origin: "ravenmoor", classKey: "fighter", skills: ["athletics", "intimidation"] }).then(
    (id) => {
      fighterId = id;
      createdActorIds.push(id);
      cy.window().then((win) =>
        Promise.all([
          grantCompendiumItem(win, id, "capacites", "Second souffle"),
          grantCompendiumItem(win, id, "capacites", "Imposition des mains"),
          grantCompendiumItem(win, id, "capacites", "Attaque d'opportunité")
        ])
      );
    }
  );

  cy.window().then((win) => win.game.actors.get(fighterId)?.sheet?.close());
  cy.createReadyCharacter({ name: "Tab Abilities Monk", origin: "altenmark", classKey: "monk", skills: ["acrobatics", "athletics"] }).then((id) => {
    moineId = id;
    createdActorIds.push(id);
    cy.window().then((win) =>
      Promise.all([grantCompendiumItem(win, id, "capacites", "Ki"), grantCompendiumItem(win, id, "capacites", "Rafale de coups")])
    );
  });

  cy.window().then((win) => win.game.actors.get(moineId)?.sheet?.close());
  cy.createReadyCharacter({ name: "Tab Abilities Wizard", origin: "ashar", classKey: "wizard", skills: ["arcana", "history"] }).then((id) => {
    wizardId = id;
    createdActorIds.push(id);
    cy.window().then((win) =>
      Promise.all(
        [
          "Trait de feu",
          "Projectile magique",
          "Bouclier",
          "Contresort",
          "Bénédiction",
          "Invisibilité",
          "Lumière",
          "Parler aux animaux"
        ].map((name) => grantCompendiumItem(win, id, "sorts", name))
      ).then(() => grantCompendiumItem(win, id, "capacites", "Incantation rituelle (Druide)"))
    );
    // Réserve de sorts confortable pour tester slots/concentration sans dépendre du niveau réel
    // du personnage (le calcul SRD normal des emplacements par niveau n'est pas ce qui est testé
    // ici, cf. tab-stats.cy.js pour la dérivation elle-même).
    cy.window().then((win) => updateActor(win, win.game.actors.get(id), { "system.spells.uses.value": 10 }));
  });

  cy.window().then((win) => win.game.actors.get(wizardId)?.sheet?.close());
  cy.window()
    .then((win) =>
      win.Actor.create(
        win.JSON.parse(
          win.JSON.stringify({ name: "Tab Abilities No Class", type: "character", system: { origin: "fleuraine" } })
        )
      )
    )
    .then((actor) => {
      noClassId = actor.id;
      createdActorIds.push(actor.id);
    });
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

describe("Onglet Capacités/Sorts", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("en-tête spécifique par classe (T-ABIL-001)", () => {
    cy.openActorSheet(fighterId);
    goToTab("abilities");
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Abilities.ClassFlavor.fighter.Title"))
      .then((title) => {
        sheetRoot().find(".class-flavor-header .class-flavor-title").should("have.text", title);
      });

    cy.window().then((win) => win.game.actors.get(fighterId).sheet.close());
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Abilities.ClassFlavor.wizard.Title"))
      .then((title) => {
        sheetRoot().find(".class-flavor-header .class-flavor-title").should("have.text", title);
      });
  });

  it("repli sur le partial 'default' sans classe, sans erreur (T-ABIL-002)", () => {
    cy.openActorSheet(noClassId);
    goToTab("abilities");
    sheetRoot().find(".class-flavor-header").should("not.exist");
    // Cypress fait échouer le test lui-même en cas d'exception non interceptée côté page : arriver
    // jusqu'ici sans erreur EST la preuve attendue par ce scénario.
    sheetRoot().find(".features-list").should("exist");
  });

  it("jet libre d'une Capacité avec formule, données de l'Actor résolues (T-ABIL-003)", () => {
    cy.openActorSheet(fighterId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(fighterId, "Second souffle", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();
      lastMessage().then((message) => {
        expect(message.formula).to.include("1d10");
        expect(message.total, "1d10 + niveau (1)").to.be.within(2, 11);
      });
    });
  });

  it("consomme une charge, affichée dans le message de chat (T-ABIL-004)", () => {
    cy.openActorSheet(fighterId);
    goToTab("abilities");

    withItemId(fighterId, "Second souffle", (itemId) => {
      cy.window().then((win) => {
        const item = win.game.actors.get(fighterId).items.get(itemId);
        return item.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 1 })));
      });
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();
      lastMessage().then((message) => {
        expect(message.flavor, "charge restante annoncée dans le message").to.include("0/1");
      });
      cy.window().should((win) => {
        expect(win.game.actors.get(fighterId).items.get(itemId).system.uses.value).to.equal(0);
      });

      // Recharge pour ne pas fausser un test suivant réutilisant ce personnage/cette Capacité.
      cy.window().then((win) => {
        const item = win.game.actors.get(fighterId).items.get(itemId);
        return item.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 1 })));
      });
    });
  });

  it("Capacité épuisée — avertissement, aucune charge décomptée sous zéro (T-ABIL-005)", () => {
    cy.openActorSheet(fighterId);
    goToTab("abilities");

    withItemId(fighterId, "Second souffle", (itemId) => {
      cy.window().then((win) => {
        const item = win.game.actors.get(fighterId).items.get(itemId);
        return item.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 0 })));
      });

      let warned = false;
      cy.window().then((win) => {
        const original = win.ui.notifications.warn.bind(win.ui.notifications);
        win.ui.notifications.warn = (message) => {
          warned = true;
          return original(message);
        };
      });

      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();
      cy.window().should((win) => {
        expect(warned, "avertissement NoChargesLeft attendu").to.be.true;
        expect(win.game.messages.size, "aucun jet posté").to.equal(knownMessageCount);
        expect(win.game.actors.get(fighterId).items.get(itemId).system.uses.value).to.equal(0);
      });

      cy.window().then((win) => {
        const item = win.game.actors.get(fighterId).items.get(itemId);
        return item.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 1 })));
      });
    });
  });

  it("Capacité à charges sans jet — décrémente et annonce en chat, sans jet posté (T-ABIL-006)", () => {
    cy.openActorSheet(fighterId);
    goToTab("abilities");

    withItemId(fighterId, "Imposition des mains", (itemId) => {
      cy.window().then((win) => {
        const actor = win.game.actors.get(fighterId);
        const item = actor.items.get(itemId);
        expect(item.system.requiresRoll, "prérequis : pas de jet associé").to.be.false;
      });

      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="useFeatureCharge"]`).click();
      cy.window().should((win) => {
        const item = win.game.actors.get(fighterId).items.get(itemId);
        expect(item.system.uses.value).to.equal(item.system.uses.max - 1);
        const message = win.game.messages.contents.at(-1);
        expect(message.rolls.length, "annoncé en chat sans poster de jet").to.equal(0);
        expect(win.game.messages.size).to.be.greaterThan(knownMessageCount);
      });

      cy.window().then((win) => {
        const item = win.game.actors.get(fighterId).items.get(itemId);
        return item.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": item.system.uses.max })));
      });
    });
  });

  it("technique consommant la réserve d'une autre Capacité (Ki) (T-ABIL-007)", () => {
    cy.openActorSheet(moineId);
    goToTab("abilities");

    cy.window().then((win) => {
      const actor = win.game.actors.get(moineId);
      const ki = actor.items.find((i) => i.name === "Ki");
      return updateActor(win, ki, { "system.uses.value": ki.system.uses.max });
    });

    withItemId(moineId, "Rafale de coups", (techniqueId) => {
      cy.window().then((win) => {
        const kiBefore = win.game.actors.get(moineId).items.find((i) => i.name === "Ki").system.uses.value;
        cy.get(`li[data-item-id="${techniqueId}"] button[data-action="useResourceTechnique"]`).click();
        cy.window().should((win2) => {
          const ki = win2.game.actors.get(moineId).items.find((i) => i.name === "Ki");
          expect(ki.system.uses.value, "la réserve (Ki), pas la technique, est décrémentée").to.equal(kiBefore - 1);
        });
      });
    });
  });

  it("bouton grisé si la réserve est vide (T-ABIL-008)", () => {
    cy.window().then((win) => {
      const ki = win.game.actors.get(moineId).items.find((i) => i.name === "Ki");
      return updateActor(win, ki, { "system.uses.value": 0 });
    });

    cy.openActorSheet(moineId);
    goToTab("abilities");
    withItemId(moineId, "Rafale de coups", (techniqueId) => {
      cy.get(`li[data-item-id="${techniqueId}"] button[data-action="useResourceTechnique"]`).should("be.disabled");
    });

    cy.window().then((win) => {
      const ki = win.game.actors.get(moineId).items.find((i) => i.name === "Ki");
      return updateActor(win, ki, { "system.uses.value": ki.system.uses.max });
    });
  });

  it("Sentinelle modifie le déclencheur affiché d'Attaque d'opportunité (T-ABIL-009)", () => {
    cy.openActorSheet(fighterId);
    goToTab("abilities");

    withItemId(fighterId, "Attaque d'opportunité", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] .reaction-badge`)
        .invoke("attr", "title")
        .should("not.include", "Sentinelle");
    });

    // "Sentinelle" est un Don (feats.json), importé dans le compendium "dons", pas "capacites"
    // (cf. world-items/README.md) — piège rencontré au premier run réel de ce fichier.
    cy.window().then((win) => grantCompendiumItem(win, fighterId, "dons", "Sentinelle"));
    cy.openActorSheet(fighterId);
    goToTab("abilities");
    withItemId(fighterId, "Attaque d'opportunité", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] .reaction-badge`)
        .invoke("attr", "title")
        .should("include", "Sentinelle");
    });

    withItemId(fighterId, "Sentinelle", (itemId) => {
      cy.window().then((win) => win.game.actors.get(fighterId).deleteEmbeddedDocuments("Item", [itemId]));
    });
  });

  it("lancer un sort — décompte du pool d'emplacements (T-ABIL-010)", () => {
    // Remplit au max plutôt qu'à une valeur arbitraire (5/10) : le hook global de correction
    // "PV/sorts ne dépassent jamais leur max" (dnd-custom-ai.js) ramène silencieusement toute
    // valeur au-delà de spells.uses.max (2 pour un magicien niveau 1) — piège rencontré au
    // premier run réel, un "5" posé ici retombait à 2 avant même le clic.
    let maxSlots;
    cy.window().then((win) => {
      const actor = win.game.actors.get(wizardId);
      maxSlots = actor.system.spells.uses.max;
      return updateActor(win, actor, { "system.spells.uses.value": maxSlots });
    });
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(wizardId, "Projectile magique", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        expect(win.game.actors.get(wizardId).system.spells.uses.value).to.equal(maxSlots - 1);
        expect(win.game.messages.size).to.be.greaterThan(knownMessageCount);
      });
    });
  });

  it("aucun emplacement disponible — avertissement, aucun décompte (T-ABIL-011)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(wizardId), { "system.spells.uses.value": 0 }));
    cy.openActorSheet(wizardId);
    goToTab("abilities");

    let warned = false;
    cy.window().then((win) => {
      const original = win.ui.notifications.warn.bind(win.ui.notifications);
      win.ui.notifications.warn = (message) => {
        warned = true;
        return original(message);
      };
    });

    resetMessageBaseline();
    withItemId(wizardId, "Projectile magique", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        expect(warned, "avertissement NoSlotAvailable attendu").to.be.true;
        expect(win.game.actors.get(wizardId).system.spells.uses.value).to.equal(0);
        expect(win.game.messages.size, "aucun jet/message posté").to.equal(knownMessageCount);
      });
    });

    cy.window().then((win) => {
      const actor = win.game.actors.get(wizardId);
      return updateActor(win, actor, { "system.spells.uses.value": actor.system.spells.uses.max });
    });
  });

  it("tour de magie — aucun changement du pool d'emplacements (T-ABIL-012)", () => {
    // Cf. commentaire de T-ABIL-010 : rempli au max, pas à une valeur arbitraire.
    let maxSlots;
    cy.window().then((win) => {
      const actor = win.game.actors.get(wizardId);
      maxSlots = actor.system.spells.uses.max;
      return updateActor(win, actor, { "system.spells.uses.value": maxSlots });
    });
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(wizardId, "Trait de feu", (itemId) => {
      cy.window().then((win) => {
        expect(win.game.actors.get(wizardId).items.get(itemId).system.level, "prérequis : tour de magie").to.equal(0);
      });
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      lastMessage(); // attend que le jet d'attaque du tour de magie soit bien posté avant de vérifier
      cy.window().should((win) => {
        expect(win.game.actors.get(wizardId).system.spells.uses.value).to.equal(maxSlots);
      });
    });
  });

  it("Incantation rituelle — lancé gratuitement même sans emplacement (T-ABIL-013)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(wizardId), { "system.spells.uses.value": 0 }));
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(wizardId, "Parler aux animaux", (itemId) => {
      cy.window().then((win) => {
        const actor = win.game.actors.get(wizardId);
        expect(actor.items.get(itemId).system.ritual, "prérequis : sort Rituel").to.be.true;
        expect(actor.items.some((i) => i.name === "Incantation rituelle (Druide)"), "prérequis : Capacité présente").to
          .be.true;
      });

      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        expect(win.game.actors.get(wizardId).system.spells.uses.value, "aucun emplacement dépensé").to.equal(0);
        expect(win.game.messages.size, "message de chat posté malgré l'absence d'emplacement").to.be.greaterThan(
          knownMessageCount
        );
      });
    });

    cy.window().then((win) => updateActor(win, win.game.actors.get(wizardId), { "system.spells.uses.value": 10 }));
  });

  it("concentration — un seul sort à la fois, le précédent est rompu (T-ABIL-014)", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(wizardId), { "system.spells.uses.value": 10, "system.spells.concentratingOn": "" })
    );
    cy.openActorSheet(wizardId);
    goToTab("abilities");

    withItemId(wizardId, "Bénédiction", (benedictionId) => {
      cy.get(`li[data-item-id="${benedictionId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        expect(win.game.actors.get(wizardId).system.spells.concentratingOn).to.equal("Bénédiction");
      });
    });

    resetMessageBaseline();
    withItemId(wizardId, "Invisibilité", (invisibiliteId) => {
      cy.get(`li[data-item-id="${invisibiliteId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        expect(win.game.actors.get(wizardId).system.spells.concentratingOn).to.equal("Invisibilité");
      });
      // #onCastSpell poste DEUX messages ici : "concentration rompue" (Bénédiction) d'abord,
      // PUIS la confirmation de lancer d'Invisibilité elle-même — le dernier message n'est donc
      // pas celui qu'on cherche (piège rencontré au premier run réel avec d'autres specs :
      // `.at(-1)` retombait sur le second). Cherche parmi tous les messages apparus depuis le
      // repère plutôt que de supposer une position fixe.
      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.format("DND_CUSTOM.Chat.ConcentrationBroken", { name: "Tab Abilities Wizard", spell: "Bénédiction" }))
        .then((expectedContent) => {
          cy.window().should((win) => {
            const newMessages = win.game.messages.contents.slice(knownMessageCount);
            expect(newMessages.some((message) => message.content.includes(expectedContent))).to.be.true;
          });
        });
    });
  });

  it("rompre la concentration manuellement (T-ABIL-015)", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(wizardId), { "system.spells.concentratingOn": "Bénédiction" })
    );
    cy.openActorSheet(wizardId);
    goToTab("abilities");

    sheetRoot().find('button[data-action="dropConcentration"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(wizardId).system.spells.concentratingOn).to.equal("");
    });
  });

  it("sort d'attaque — jet d'attaque puis bouton de dégâts distinct (T-ABIL-016)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(wizardId), { "system.spells.uses.value": 10 }));
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(wizardId, "Trait de feu", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] [data-action="rollSpellDamage"]`).should("exist");

      cy.window().then((win) => {
        const actor = win.game.actors.get(wizardId);
        const intMod = Math.floor((actor.system.abilities.int.total - 10) / 2);
        const prof = Math.ceil(actor.system.attributes.level / 4) + 1;
        const expectedBonus = intMod + prof;

        cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
        lastMessage().then((message) => {
          expect(message.formula).to.equal(`1d20${expectedBonus >= 0 ? "+" : ""}${expectedBonus}`);
        });
      });
    });
  });

  it("sort de dégâts — pas de modificateur de caractéristique ajouté (T-ABIL-017)", () => {
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(wizardId, "Trait de feu", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      lastMessage().then((message) => {
        expect(message.formula).to.equal("1d10"); // aucun modificateur d'incantation ajouté
      });
    });
  });

  it("sort de lumière allume le token du lanceur (T-ABIL-018)", () => {
    let tokenId;
    cy.loginAsGM();
    cy.window()
      .then((win) => win.game.actors.get(wizardId).getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 300, y: 300 }))))
      .then((tokenDoc) =>
        cy.window().then((win) =>
          win.canvas.scene.createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))]).then((tokens) => {
            tokenId = tokens[0].id;
            createdSceneItemIds.push(tokenId);
          })
        )
      );

    cy.loginAsPlayer();
    cy.openActorSheet(wizardId);
    goToTab("abilities");

    withItemId(wizardId, "Lumière", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        const token = win.canvas.scene.tokens.get(tokenId);
        expect(token.light.bright, "lumière appliquée au token").to.be.greaterThan(0);
      });
    });
  });

  it("réaction déjà consommée bloque une autre Capacité/un autre Sort réaction (T-ABIL-019)", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(wizardId), { "system.spells.uses.value": 10, "system.combat.reactionAvailable": true })
    );
    cy.openActorSheet(wizardId);
    goToTab("abilities");

    withItemId(wizardId, "Bouclier", (shieldSpellId) => {
      cy.get(`li[data-item-id="${shieldSpellId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        expect(win.game.actors.get(wizardId).system.combat.reactionAvailable, "réaction consommée").to.be.false;
      });
    });

    let warned = false;
    cy.window().then((win) => {
      const original = win.ui.notifications.warn.bind(win.ui.notifications);
      win.ui.notifications.warn = (message) => {
        warned = true;
        return original(message);
      };
    });

    withItemId(wizardId, "Contresort", (counterspellId) => {
      cy.window().then((win) => {
        const before = win.game.actors.get(wizardId).system.spells.uses.value;
        cy.get(`li[data-item-id="${counterspellId}"] button[data-action="castSpell"]`).click({ force: true });
        cy.window().should((win2) => {
          expect(warned, "avertissement ReactionUnavailable attendu").to.be.true;
          expect(win2.game.actors.get(wizardId).system.spells.uses.value, "aucune charge décomptée").to.equal(before);
        });
      });
    });

    cy.window().then((win) => updateActor(win, win.game.actors.get(wizardId), { "system.combat.reactionAvailable": true }));
  });

  it("bascule manuelle de la réaction depuis l'en-tête (T-ABIL-020)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(wizardId), { "system.combat.reactionAvailable": true }));
    cy.openActorSheet(wizardId);

    sheetRoot().find('button[data-action="toggleReaction"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(wizardId).system.combat.reactionAvailable).to.be.false;
    });

    sheetRoot().find('button[data-action="toggleReaction"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(wizardId).system.combat.reactionAvailable).to.be.true;
    });
  });
});
