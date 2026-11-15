// Sous-classes du Rôdeur (Maître des bêtes, Traqueur des ténèbres) : octroi des Capacités et compagnon animal.

const createdActorIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
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

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    // Nom exact du compagnon dans la locale active.
    const companionName = win.game.i18n.format("DND_CUSTOM.Companion.Name", { owner: "Sub Ranger Beastmaster" });
    const companions = win.game.actors.filter((a) => a.name === companionName);
    const ids = [...createdActorIds, ...companions.map((a) => a.id)];
    return win.Actor.deleteDocuments(ids);
  });
});

describe("Sous-classes de Rôdeur — Maître des bêtes / Traqueur des ténèbres", () => {
  it("Maître des bêtes — Capacité octroyée, compagnon invoqué une seule fois (T-SUB-RANGER-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Ranger Beastmaster",
      origin: "ravenmoor",
      classKey: "ranger",
      skills: ["survival", "perception", "athletics"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "beastmaster" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Compagnon animal"), "Compagnon animal octroyée").to.exist;
      });

      // Invocation par le MJ (création d'Actor).
      cy.loginAsGM();
      cy.openActorSheet(actorId);
      goToTab("abilities");

      cy.window().its("game.actors").then((actors) => actors.size).then((countBefore) => {
        withItemId(actorId, "Compagnon animal", (itemId) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="summonCompanion"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.actors.size, "un compagnon Actor a été créé").to.equal(countBefore + 1);
            expect(win.game.actors.get(actorId).getFlag("dnd-custom-ai", "beastCompanionCreated"), "flag posé").to.be.true;
          });

          // Le compagnon doit avoir au moins une attaque.
          cy.window().then((win) => {
            // Filtre `npc` : le PJ porte le même nom.
            const wolf = [...win.game.actors].find((actor) => actor.type === "npc" && actor.name.includes("Sub Ranger Beastmaster"));
            expect(wolf, "compagnon Loup introuvable parmi les Actors").to.exist;
            expect(wolf.system.attacks, "le compagnon doit avoir au moins une attaque configurée").to.have.length.greaterThan(0);
            expect(wolf.system.attacks[0].name).to.equal("Morsure");
          });

          // Réaffiche la fiche après invocation.
          cy.openActorSheet(actorId);
          goToTab("abilities");
          cy.get(`li[data-item-id="${itemId}"] button[data-action="summonCompanion"]`).should("not.exist");
        });
      });
    });
  });

  it("Traqueur des ténèbres — Capacité octroyée, +2 Initiative automatique (T-SUB-RANGER-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Ranger GloomStalker",
      origin: "ravenmoor",
      classKey: "ranger",
      skills: ["survival", "perception", "stealth"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 3, "system.subclass": "gloomStalker" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Embuscade des ténèbres"), "Embuscade des ténèbres octroyée").to.exist;

        const dexMod = Math.floor((actor.system.abilities.dex.total - 10) / 2);
        expect(actor.system.attributes.initiativeMod, "+2 d'Initiative appliqué automatiquement").to.equal(dexMod + 2);
      });
    });
  });
});
