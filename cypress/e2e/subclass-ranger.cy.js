// Couvre le lot Rôdeur du chantier "plusieurs sous-classes par classe" (inspiration BG3, cf.
// ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") : 2 nouvelles sous-classes ajoutées
// (Maître des bêtes/beastmaster, Traqueur des ténèbres/gloomStalker), en plus du Chasseur déjà
// existant. Vérifie l'octroi des Capacités liées ET le scénario minimal de chaque mécanique
// propre — en particulier la primitive P3 (compagnon animal, cf. helpers/companion.js)
// construite ici pour la première fois.

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
    const companions = win.game.actors.filter((a) => a.name.startsWith("Loup ("));
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

      // Invocation réservée au MJ (permission de création d'Actor, même restriction que la
      // création de Token — cf. combat-criticals.cy.js > createTarget).
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

          // Bouton disparu après invocation (déjà invoqué) : ré-affiche la fiche pour repartir
          // d'un rendu à jour plutôt que de dépendre d'un re-render implicite.
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
