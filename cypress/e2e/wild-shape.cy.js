// Forme sauvage : choix de la forme dans un dialogue filtré par niveau, Actor de forme créé ou
// réutilisé par personnage et par forme, PV de la forme en 2e réserve.

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
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

function chooseWildShapeForm(formName) {
  cy.get('dialog.application.dialog input[type="radio"][name="wildShapeFormName"]', { timeout: 10000 }).should("exist");
  cy.get(`dialog.application.dialog input[type="radio"][name="wildShapeFormName"][value="${formName}"]`).check();
  cy.get('dialog.application.dialog button[data-action="ok"]').click();
}

let druidId;

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({ name: "Wild Shape Druid", origin: "fleuraine", classKey: "druid", skills: ["nature", "survival"] }).then(
    (id) => {
      druidId = id;
      createdActorIds.push(id);
    }
  );
  // Niveau 2 et Capacité créée directement depuis les données actuelles.
  cy.window().then((win) => updateActor(win, win.game.actors.get(druidId), { "system.attributes.level": 2 }, { dndCustomWizard: true }));
  cy.window().then((win) =>
    win.game.actors.get(druidId).createEmbeddedDocuments(
      "Item",
      win.JSON.parse(
        win.JSON.stringify([
          {
            name: "Forme sauvage",
            type: "feature",
            system: {
              class: "druid",
              level: 2,
              activation: "bonusAction",
              entersWildShape: true,
              requiresRoll: false,
              uses: { max: 2, value: 2, recharge: "shortRest" }
            }
          }
        ])
      )
    )
  );
  cy.window().then((win) => win.game.actors.get(druidId)?.sheet?.close());
});

after(() => {
  cy.loginAsGM();
  // Supprime aussi les Actors de forme créés.
  cy.window().then((win) => {
    const formActorIds = Object.values(win.game.actors.get(druidId)?.getFlag("dnd-custom-ai", "wildShapeFormActors") ?? {});
    return win.Actor.deleteDocuments([...createdActorIds, ...formActorIds]);
  });
});

describe("Forme sauvage — dialogue de choix, chip de statut, attaques, retour volontaire", () => {
  // Session MJ : la création de l'Actor de forme exige le MJ (relais non testable).
  beforeEach(() => {
    cy.loginAsGM();
  });

  it("le dialogue ne propose que les formes accessibles au niveau du personnage (T-WS-001)", () => {
    cy.openActorSheet(druidId);
    goToTab("abilities");
    withItemId(druidId, "Forme sauvage", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="enterWildShape"]`).click();
    });

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.WildShape.DialogTitle"))
      .then((title) => cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("contain.text", title));

    cy.get('dialog.application.dialog input[type="radio"][name="wildShapeFormName"][value="Loup"]').should("exist");
    // Ours brun (niveau 8 minimum) absent au niveau 2.
    cy.get('dialog.application.dialog input[type="radio"][name="wildShapeFormName"][value="Ours brun"]').should("not.exist");

    cy.get('dialog.application.dialog button[data-action="close"]').click();

    cy.window().should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId, "aucune forme liée sans choix").to.equal("");
      const item = win.game.actors.get(druidId).items.find((i) => i.name === "Forme sauvage");
      expect(item.system.uses.value, "aucune charge consommée si le dialogue est fermé sans choisir").to.equal(2);
    });
  });

  it("choisit Loup dans le dialogue : prend la forme, décompte une charge, chip visible avec CA/Vitesse (T-WS-002)", () => {
    cy.openActorSheet(druidId);
    goToTab("abilities");
    withItemId(druidId, "Forme sauvage", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="enterWildShape"]`).click();
    });
    chooseWildShapeForm("Loup");

    cy.window({ timeout: 10000 }).should((win) => {
      const formId = win.game.actors.get(druidId).system.combat.wildShapeActorId;
      expect(formId, "forme liée après choix").to.not.equal("");
      expect(win.game.actors.get(formId)?.name, "nom de la forme créée").to.contain("Loup");
      const item = win.game.actors.get(druidId).items.find((i) => i.name === "Forme sauvage");
      expect(item.system.uses.value, "une charge décomptée").to.equal(1);
    });

    goToTab("stats");
    sheetRoot().find(".mount-chip").contains("Loup");
    sheetRoot().find(".mount-chip").contains("11/11");
    sheetRoot().find(".mount-chip").contains("13"); // CA du Loup (world-items/npcs.json)
    sheetRoot().find(".mount-chip").contains("12"); // Vitesse du Loup
  });

  it("attaque directement depuis l'onglet Statistiques du personnage, sans ouvrir la fiche de la forme (T-WS-003)", () => {
    cy.openActorSheet(druidId);
    goToTab("stats");

    cy.window().its("game.messages.size").then((before) => {
      sheetRoot().find('button[data-action="rollWildShapeAttack"]').first().click();

      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.game.messages.size, "jet d'attaque posté").to.be.greaterThan(before);
      });
    });

    cy.window().its("game.messages.size").then((before) => {
      sheetRoot().find('button[data-action="rollWildShapeAttackDamage"]').first().click();

      cy.window({ timeout: 10000 }).should((win) => {
        expect(win.game.messages.size, "jet de dégâts posté").to.be.greaterThan(before);
      });
    });
  });

  it("retour volontaire : le bouton 'Redevenir soi-même' vide le lien, sans rendre la charge (T-WS-004)", () => {
    cy.openActorSheet(druidId);
    goToTab("stats");
    sheetRoot().find('[data-action="revertWildShape"]').click();

    cy.window().should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId, "forme retirée").to.equal("");
      const item = win.game.actors.get(druidId).items.find((i) => i.name === "Forme sauvage");
      expect(item.system.uses.value, "charge jamais rendue par un retour volontaire").to.equal(1);
    });
    sheetRoot().find(".mount-chip").contains("Loup").should("not.exist");
  });
});

describe("Forme sauvage — réutilisation de l'Actor de forme, retour automatique à 0 PV", () => {
  beforeEach(() => {
    cy.loginAsGM();
  });

  it("reprendre Loup après y avoir pris des dégâts réutilise le même Actor et remet ses PV au maximum (T-WS-005)", () => {
    let wolfActorId;
    cy.window().then((win) => {
      wolfActorId = win.game.actors.get(druidId).getFlag("dnd-custom-ai", "wildShapeFormActors")?.Loup;
      expect(wolfActorId, "Actor Loup déjà créé au test précédent").to.exist;
    });

    cy.window().then((win) => updateActor(win, win.game.actors.get(wolfActorId), { "system.attributes.hp.value": 3 }));

    cy.openActorSheet(druidId);
    goToTab("abilities");
    withItemId(druidId, "Forme sauvage", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="enterWildShape"]`).click();
    });
    chooseWildShapeForm("Loup");

    cy.window({ timeout: 10000 }).should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId, "même Actor réutilisé").to.equal(wolfActorId);
      expect(win.game.actors.get(wolfActorId).system.attributes.hp.value, "PV remis au maximum").to.equal(11);
      expect(
        Object.values(win.game.actors.get(druidId).getFlag("dnd-custom-ai", "wildShapeFormActors") ?? {}).filter(
          (id) => id === wolfActorId
        ).length,
        "un seul Actor Loup pour ce personnage, jamais dupliqué"
      ).to.equal(1);
    });
  });

  it("les PV de la forme tombent à 0 : retour automatique + message de chat (T-WS-006)", () => {
    cy.window().should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId).to.not.equal("");
    });

    let formId;
    let baseline;
    cy.window().then((win) => {
      formId = win.game.actors.get(druidId).system.combat.wildShapeActorId;
      baseline = win.game.messages.size;
    });
    cy.window().then((win) => updateActor(win, win.game.actors.get(formId), { "system.attributes.hp.value": 0 }));

    cy.window({ timeout: 10000 }).should((win) => {
      expect(win.game.actors.get(druidId).system.combat.wildShapeActorId, "retour automatique à la forme normale").to.equal("");
      expect(win.game.messages.size, "un message de fin de forme est posté").to.be.greaterThan(baseline);
    });

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Chat.WildShapeEnded", { name: "Wild Shape Druid", form: "Loup (Wild Shape Druid)" }))
      .then((expected) => {
        cy.window().then((win) => {
          const found = win.game.messages.contents.slice(-5).some((m) => (m.content ?? "").includes(expected));
          expect(found, `message contenant "${expected}"`).to.be.true;
        });
      });
  });
});
