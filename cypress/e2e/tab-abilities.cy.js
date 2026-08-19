// Implémente la section 6 (T-ABIL-001 à T-ABIL-020) de tests/E2E_TEST_PLAN.md — onglet
// Capacités/Sorts (tab-abilities.hbs + partials par classe). T-ABIL-021 (régénération de la
// réaction en début de tour) est marqué "Quench" seul dans le plan : implémenté dans
// tests/quench/quench-tests.js, pas ici. T-ABIL-022/023 (langues connues), T-ABIL-024 (sort de
// soin), T-ABIL-025 (capacité conditionnée à un état actif) et T-ABIL-026 (surclassement
// d'emplacement de sort) sont hors plan initial, ajoutés depuis sur des retours de test réels/le
// chantier des vrais emplacements de sorts par niveau.
//
// Écrit à l'origine pour contourner un bug de locale sur grantClassContent (corrigé depuis, cf.
// tests/README.md > "Bug connu — CORRIGÉ", T-STATS-012 dans tab-stats.cy.js) — le contournement
// reste néanmoins la bonne approche ici : TOUTES les Capacités/tous les Sorts utilisés dans ce
// fichier sont octroyés directement depuis leur compendium (cf. grantCompendiumItem), jamais via
// l'assistant de création, pour isoler un seul mécanisme à la fois SANS dépendre de la classe
// "officielle" du personnage qui les reçoit. #onCastSpell/#onRollFeature ne revérifient jamais
// l'éligibilité de classe à l'UTILISATION (seul grantClassContent la vérifie à l'OCTROI) — donc
// un personnage Magicien peut très bien recevoir manuellement un sort de Clerc pour tester, par
// exemple, l'Incantation rituelle isolément (T-ABIL-013).

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

// Réserve confortable pour tester le décompte d'emplacement/la concentration sans dépendre de
// l'historique d'un test précédent : remplit les paliers 1 à 3 (les seuls réellement utilisés par
// les sorts de cette fixture, cf. Invisibilité niveau 2/Contresort niveau 3) à une valeur
// volontairement haute, silencieusement plafonnée à son propre max par le correctif global
// "emplacements de sorts ne dépassent jamais leur max" (dnd-custom-ai.js) — piège déjà rencontré
// ici avec l'ancien pool unique (un "5" posé alors retombait à 2 avant même le clic).
function fillWizardSlots(win) {
  return updateActor(win, win.game.actors.get(wizardId), {
    "system.spells.slots.1.value": 10,
    "system.spells.slots.2.value": 10,
    "system.spells.slots.3.value": 10
  });
}

let fighterId; // Second souffle, Imposition des mains, Attaque d'opportunité (+ Sentinelle, T-ABIL-009)
let moineId; // Ki (réserve) + Rafale de coups (technique consommant la réserve)
let wizardId; // Trait de feu, Projectile magique, Bouclier, Contresort, Bénédiction, Invisibilité,
// Lumière, Parler aux animaux, Mot de guérison + Incantation rituelle (Druide)
let noClassId; // Origine posée, Classe vide (T-ABIL-002) — créé directement, sans passer par l'assistant
let barbareId; // Capacité conditionnée à un état actif (system.requiresState, T-ABIL-025)

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
          "Parler aux animaux",
          "Mot de guérison"
        ].map((name) => grantCompendiumItem(win, id, "sorts", name))
      ).then(() => grantCompendiumItem(win, id, "capacites", "Incantation rituelle (Druide)"))
    );
    // Niveau 5 (mis à jour directement, hors assistant/#onLevelUp — option dndCustomWizard,
    // même bypass que subclass-*.cy.js) : seul niveau garantissant un emplacement à CHAQUE
    // palier réellement utilisé par les sorts de cette fixture (1 à 3, cf. Invisibilité niveau 2/
    // Contresort niveau 3) — fullCaster[5] = [4,3,2,0,...]. Les sorts eux-mêmes restent octroyés
    // directement (grantCompendiumItem, cf. en-tête du fichier), jamais via grantClassContent.
    cy.window().then((win) =>
      win.game.actors
        .get(id)
        .update(win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 5 })), { dndCustomWizard: true })
    );
    // Réserve de sorts confortable pour tester slots/concentration sans dépendre de l'historique
    // d'un test précédent (cf. fillWizardSlots ci-dessous).
    cy.window().then((win) => fillWizardSlots(win));
  });

  cy.window().then((win) => win.game.actors.get(wizardId)?.sheet?.close());
  cy.createReadyCharacter({ name: "Tab Abilities Barbarian", origin: "altenmark", classKey: "barbarian", skills: ["athletics", "survival"] }).then(
    (id) => {
      barbareId = id;
      createdActorIds.push(id);
      // Créée directement (pas via grantCompendiumItem comme les autres Capacités ci-dessus) :
      // isole le mécanisme générique requiresState/featureDisabled (retour de test, lot 3 point
      // 5) du contenu réel du compendium "capacites", dont l'octroi via grantClassContent est
      // déjà couvert ailleurs (tests/unit/class-content.test.js) — ce scénario teste le grisage
      // conditionnel lui-même, pas l'octroi de Frénésie en particulier.
      cy.window().then((win) =>
        win.game.actors.get(id).createEmbeddedDocuments(
          "Item",
          win.JSON.parse(
            win.JSON.stringify([
              {
                name: "Frénésie",
                type: "feature",
                system: { class: "barbarian", subclass: "berserker", requiresRoll: false, requiresState: "raging", uses: { max: 0 } }
              }
            ])
          )
        )
      );
    }
  );

  cy.window().then((win) => win.game.actors.get(barbareId)?.sheet?.close());
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

  it("lancer un sort — décompte de l'emplacement de son propre niveau (T-ABIL-010)", () => {
    // Remplit au max plutôt qu'à une valeur arbitraire (5/10) : le hook global de correction
    // "emplacements de sorts ne dépassent jamais leur max" (dnd-custom-ai.js) ramène
    // silencieusement toute valeur au-delà de spells.slots.1.max (4 pour ce magicien niveau 5)
    // — piège rencontré au premier run réel, un "5" posé ici retombait à 2 avant même le clic.
    let maxSlots;
    cy.window().then((win) => {
      const actor = win.game.actors.get(wizardId);
      maxSlots = actor.system.spells.slots[1].max;
      return updateActor(win, actor, { "system.spells.slots.1.value": maxSlots });
    });
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(wizardId, "Projectile magique", (itemId) => {
      // Prérequis : Projectile magique est de niveau 1, l'emplacement de son propre niveau est
      // disponible -> décompte direct, aucune fenêtre de surclassement (cf. T-ABIL-011bis pour
      // le cas surclassement).
      cy.window().then((win) => {
        expect(win.game.actors.get(wizardId).items.get(itemId).system.level, "prérequis : sort de niveau 1").to.equal(1);
      });
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        expect(win.game.actors.get(wizardId).system.spells.slots[1].value).to.equal(maxSlots - 1);
        expect(win.game.messages.size).to.be.greaterThan(knownMessageCount);
      });
    });

    cy.window().then((win) => fillWizardSlots(win));
  });

  it("aucun emplacement disponible, y compris au-dessus — avertissement, aucun décompte (T-ABIL-011)", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(wizardId), {
        "system.spells.slots.1.value": 0,
        "system.spells.slots.2.value": 0,
        "system.spells.slots.3.value": 0
      })
    );
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
        expect(win.game.actors.get(wizardId).system.spells.slots[1].value).to.equal(0);
        expect(win.game.messages.size, "aucun jet/message posté").to.equal(knownMessageCount);
      });
    });

    cy.window().then((win) => fillWizardSlots(win));
  });

  it("surclassement — palier exact épuisé, palier supérieur dépensé après confirmation (T-ABIL-026)", () => {
    // Projectile magique (niveau 1) : palier 1 épuisé, palier 2 disponible -> la fenêtre de
    // choix doit s'ouvrir et proposer le palier 2 (cf. spell-slot-choice.js).
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(wizardId), {
        "system.spells.slots.1.value": 0,
        "system.spells.slots.2.value": 3
      })
    );
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(wizardId, "Projectile magique", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      // Structure DOM DialogV2 (cf. level-up.cy.js en-tête pour le pattern de référence) :
      // `dialog.application.dialog`, radio par palier proposé (name="slotLevel"), confirmation
      // via button[data-action="ok"].
      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.localize("DND_CUSTOM.Spells.UpcastDialogTitle"))
        .then((title) => {
          cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("contain.text", title);
        });
      cy.get('dialog.application.dialog input[type="radio"][name="slotLevel"][value="2"]').check();
      cy.get('dialog.application.dialog button[data-action="ok"]').click();
      cy.window().should((win) => {
        const slots = win.game.actors.get(wizardId).system.spells.slots;
        expect(slots[1].value, "le palier du sort lui-même reste intact").to.equal(0);
        expect(slots[2].value, "le palier surclassé est décompté").to.equal(2);
        expect(win.game.messages.size).to.be.greaterThan(knownMessageCount);
      });
    });

    cy.window().then((win) => fillWizardSlots(win));
  });

  it("tour de magie — aucun changement des emplacements de sorts (T-ABIL-012)", () => {
    cy.window().then((win) => fillWizardSlots(win));
    cy.openActorSheet(wizardId);
    goToTab("abilities");
    resetMessageBaseline();

    let before;
    withItemId(wizardId, "Trait de feu", (itemId) => {
      cy.window().then((win) => {
        const actor = win.game.actors.get(wizardId);
        expect(actor.items.get(itemId).system.level, "prérequis : tour de magie").to.equal(0);
        before = [1, 2, 3].map((level) => actor.system.spells.slots[level].value);
      });
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      lastMessage(); // attend que le jet d'attaque du tour de magie soit bien posté avant de vérifier
      cy.window().should((win) => {
        const actor = win.game.actors.get(wizardId);
        expect([1, 2, 3].map((level) => actor.system.spells.slots[level].value)).to.deep.equal(before);
      });
    });
  });

  it("Incantation rituelle — lancé gratuitement même sans emplacement (T-ABIL-013)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(wizardId), { "system.spells.slots.1.value": 0 }));
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
        expect(win.game.actors.get(wizardId).system.spells.slots[1].value, "aucun emplacement dépensé").to.equal(0);
        expect(win.game.messages.size, "message de chat posté malgré l'absence d'emplacement").to.be.greaterThan(
          knownMessageCount
        );
      });
    });

    cy.window().then((win) => fillWizardSlots(win));
  });

  it("concentration — un seul sort à la fois, le précédent est rompu (T-ABIL-014)", () => {
    cy.window().then((win) =>
      fillWizardSlots(win).then(() =>
        updateActor(win, win.game.actors.get(wizardId), { "system.spells.concentratingOn": "" })
      )
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
    // "Trait de feu" est un tour de magie (niveau 0) : aucun emplacement à préparer ici.
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
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      cy.window().should((win) => {
        const token = win.canvas.scene.tokens.get(tokenId);
        expect(token.light.bright, "lumière appliquée au token").to.be.greaterThan(0);
      });
      // Retour de test : un double message ("Allume Lumière" + "Lance Lumière") était posté
      // pour un seul lancer — un seul message attendu désormais (#onCastSpell, actor-sheet.js).
      cy.window().should((win) => {
        expect(win.game.messages.size, "un seul nouveau message de chat pour ce lancer").to.equal(knownMessageCount + 1);
      });
    });
  });

  // Retour de test (lot 3) : "Mot de guérison"/"Soin des blessures" ne lançaient aucun dé et ne
  // soignaient rien (system.heal.dice absent du schéma) — vérifie le vrai jet (dé + modificateur
  // de caractéristique d'incantation) et le bouton "Appliquer le soin" affiché sur son message.
  it("sort de soin lance le dé de soin et le bouton 'Appliquer le soin' restaure des PV (T-ABIL-024)", () => {
    // "Mot de guérison" est de niveau 1 : garantit un emplacement disponible indépendamment de
    // l'historique des tests précédents (cf. fillWizardSlots).
    cy.window().then((win) => fillWizardSlots(win));

    let tokenId;
    cy.loginAsGM();
    cy.window()
      .then((win) => win.game.actors.get(wizardId).getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 350, y: 350 }))))
      .then((tokenDoc) =>
        cy.window().then((win) =>
          win.canvas.scene.createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))]).then((tokens) => {
            tokenId = tokens[0].id;
            createdSceneItemIds.push(tokenId);
          })
        )
      );

    cy.loginAsPlayer();
    let hpBefore;
    cy.window().then((win) => {
      const actor = win.game.actors.get(wizardId);
      hpBefore = Math.max(1, actor.system.attributes.hp.max - 5);
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": hpBefore })), {
        dndCustomDamageApply: true
      });
    });

    cy.openActorSheet(wizardId);
    goToTab("abilities");

    withItemId(wizardId, "Mot de guérison", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      lastMessage().then((message) => {
        // Mot de guérison : 1d4 + modificateur d'Intelligence (Magicien) — le modificateur EST
        // ajouté pour un soin, contrairement aux dégâts d'un sort (cf. rollHeal, rolls.js).
        expect(message.formula).to.match(/^1d4[+-]\d+$/);
        expect(Number.isFinite(message.total), "un vrai total de soin doit être calculé").to.be.true;
      });

      cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));

      // Ferme la fiche personnage (recouvre la moitié droite de l'écran) et ouvre l'onglet Chat
      // de la barre latérale (repliée par défaut après un cy.loginAsPlayer(), même pattern que
      // #sidebar-tabs [data-tab="combat"] dans combat-tracker.cy.js) avant d'interagir avec le
      // message posté — sans ça, Cypress refuse le clic ("center of this element is hidden from
      // view") même si l'élément existe bien dans le DOM.
      cy.window().then((win) => win.game.actors.get(wizardId).sheet.close());
      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(".chat-message").last().find("button.dnd-apply-heal-btn").click();

      cy.window().should((win) => {
        const actor = win.game.actors.get(wizardId);
        const healAmount = win.game.messages.contents.at(-1).rolls?.[0]?.total ?? 0;
        expect(actor.system.attributes.hp.value, "PV restaurés du montant du jet, plafonnés au max").to.equal(
          Math.min(hpBefore + healAmount, actor.system.attributes.hp.max)
        );
      });
    });

    // Remet les PV au maximum pour ne pas fausser un futur run de cette spec.
    cy.window().then((win) => {
      const actor = win.game.actors.get(wizardId);
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": actor.system.attributes.hp.max })));
    });
  });

  it("réaction déjà consommée bloque une autre Capacité/un autre Sort réaction (T-ABIL-019)", () => {
    cy.window().then((win) =>
      fillWizardSlots(win).then(() =>
        updateActor(win, win.game.actors.get(wizardId), { "system.combat.reactionAvailable": true })
      )
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

    // Contresort est un sort réaction de niveau 3 : bloqué par la réaction déjà consommée
    // AVANT même la vérification d'emplacement (#consumeReaction s'exécute en premier dans
    // #onCastSpell) — son propre palier (3) n'est donc jamais consulté ni décompté.
    withItemId(wizardId, "Contresort", (counterspellId) => {
      cy.window().then((win) => {
        const before = win.game.actors.get(wizardId).system.spells.slots[3].value;
        cy.get(`li[data-item-id="${counterspellId}"] button[data-action="castSpell"]`).click({ force: true });
        cy.window().should((win2) => {
          expect(warned, "avertissement ReactionUnavailable attendu").to.be.true;
          expect(win2.game.actors.get(wizardId).system.spells.slots[3].value, "aucune charge décomptée").to.equal(before);
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

  // Retour de test (lot 3, point 5 "Capacités à ressource") : une Capacité qui ne fonctionne que
  // dans un état particulier (ex. Frénésie, qui nécessite d'être En Rage) doit être grisée par
  // défaut et se dégriser automatiquement dès que l'état correspondant est actif — la bascule de
  // l'état (onglet Statistiques, mécanisme déjà existant) est le SEUL contrôle actionné par le
  // joueur, pas de bouton séparé pour la Capacité elle-même.
  it("Capacité conditionnée à un état actif — grisée par défaut, dégrisée à la bascule de l'état (T-ABIL-025)", () => {
    cy.openActorSheet(barbareId);
    goToTab("abilities");

    withItemId(barbareId, "Frénésie", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="useConditionalFeature"]`).should("be.disabled");
    });

    goToTab("stats");
    // Retour de test (cf. tab-stats.cy.js > T-STATS-015) : cocher un état ne l'applique plus
    // qu'à la fermeture de la liste déroulante.
    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="raging"]').click();
    sheetRoot().find(".conditions-dropdown summary").click(); // ferme -> applique
    cy.window().should((win) => {
      expect(win.game.actors.get(barbareId).statuses.has("raging"), "état 'raging' actif après bascule").to.be.true;
    });

    goToTab("abilities");
    resetMessageBaseline();
    withItemId(barbareId, "Frénésie", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="useConditionalFeature"]`).should("not.be.disabled").click();
    });

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Chat.UseConditionalFeature", { name: "Tab Abilities Barbarian", feature: "Frénésie" }))
      .then((expectedContent) => {
        cy.window().should((win) => {
          expect(win.game.messages.size, "un message annonçant l'utilisation doit être posté").to.be.greaterThan(knownMessageCount);
          expect(win.game.messages.contents.at(-1).content).to.equal(expectedContent);
        });
      });

    // Rebascule l'état "En Rage" à faux : ne fausse pas un futur run réutilisant ce personnage.
    goToTab("stats");
    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="raging"]').click();
    sheetRoot().find(".conditions-dropdown summary").click(); // ferme -> applique le retrait
    cy.window().should((win) => {
      expect(win.game.actors.get(barbareId).statuses.has("raging")).to.be.false;
    });

    goToTab("abilities");
    withItemId(barbareId, "Frénésie", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="useConditionalFeature"]`).should("be.disabled");
    });
  });
});

// Langues connues, déplacées de l'onglet Journal vers l'onglet Capacités le 2026-08-16 (retour
// de test), affichées juste au-dessus du panneau de la capacité d'Origine (cf.
// templates/actor/tab-abilities.hbs). Anciennement T-JOURNAL-001/002 (tests/E2E_TEST_PLAN.md >
// section 7) — Actor dédié distinct des fixtures partagées ci-dessus, pour ne pas dépendre de
// leur composition de Capacités/Sorts.
describe("Onglet Capacités/Sorts — langues connues", () => {
  const languagesActorIds = [];
  let languagesActorId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Abilities Languages",
      origin: "fleuraine",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((id) => {
      languagesActorId = id;
      languagesActorIds.push(id);
    });
  });

  after(() => {
    if (!languagesActorIds.length) return;
    cy.loginAsGM();
    cy.window().then((win) => win.Actor.deleteDocuments(languagesActorIds));
  });

  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(languagesActorId);
    goToTab("abilities");
  });

  it("liste Commune en premier, puis la langue d'Origine (T-ABIL-022)", () => {
    sheetRoot()
      .find(".languages-list .language-chip .item-name-link")
      .should(($links) => {
        const names = Array.from($links, (el) => el.textContent.trim());
        // Retour de test : ordre d'ajout (pas alphabétique), Commune forcée en tête quel que
        // soit cet ordre (cf. actor-sheet.js > context.languages). Origine "fleuraine" -> langue
        // "Fleurain".
        expect(names).to.deep.equal(["Commune", "Fleurain"]);
      });
  });

  it("glisser un Item langue depuis le compendium Langues l'ajoute à la liste, à la fin (T-ABIL-023)", () => {
    let sourceUuid;

    cy.window()
      .then((win) => win.game.packs.get("dnd-custom-ai.langues").getDocuments())
      .then((docs) => {
        sourceUuid = docs.find((doc) => doc.name === "Argot des rues").uuid;
      });

    cy.window().then((win) => {
      const dataTransfer = new win.DataTransfer();
      dataTransfer.setData("text/plain", win.JSON.stringify({ type: "Item", uuid: sourceUuid }));
      const dropEvent = new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer });
      win.document.querySelector(".application.character").dispatchEvent(dropEvent);
    });

    sheetRoot()
      .find(".languages-list .language-chip .item-name-link")
      .should(($links) => {
        const names = Array.from($links, (el) => el.textContent.trim());
        // Ajoutée en dernier dans la liste (ordre d'ajout, cf. T-ABIL-022) : "Argot des rues"
        // sortirait AVANT "Commune"/"Fleurain" sous un tri alphabétique (A < C < F) — la
        // retrouver en dernière position prouve que le tri est bien par ordre d'ajout, pas
        // alphabétique.
        expect(names).to.deep.equal(["Commune", "Fleurain", "Argot des rues"]);
      });

    cy.window().then((win) => {
      const actor = win.game.actors.get(languagesActorId);
      const added = actor.items.find((item) => item.name === "Argot des rues");
      return added?.delete();
    });
  });
});
