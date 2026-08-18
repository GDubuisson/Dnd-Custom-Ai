// Couvre le lot Ensorceleur du chantier "plusieurs sous-classes par classe" (inspiration BG3,
// cf. ClaudeFiles/ANOMALIES_ACTIVES.md > "Gros chantier") : 2 nouvelles sous-classes ajoutées
// (Magie sauvage/wildSorcery, Sorcellerie des tempêtes/stormSorcery), en plus du Lignage
// draconique déjà existant. Vérifie l'octroi des Capacités liées ET le scénario minimal de
// chaque mécanique propre — en particulier la réutilisation de la primitive P1 (RollTable,
// construite pour le Barbare) avec une table et un déclencheur distincts (emplacement de sort
// dépensé, pas activation de Rage).

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
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Sous-classes d'Ensorceleur — Magie sauvage / Sorcellerie des tempêtes", () => {
  it("Magie sauvage — Surtenance sauvage tirée à chaque emplacement de sort dépensé (T-SUB-SORCERER-001)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Sorcerer WildMagic",
      origin: "ravenmoor",
      classKey: "sorcerer",
      skills: ["arcana", "deception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(
            win.JSON.stringify({
              "system.attributes.level": 3,
              "system.subclass": "wildSorcery",
              // Valeur explicite plutôt que de dépendre du pool hérité de la création (niveau
              // 1) : #onLevelUp topperait normalement le pool, bypassé ici comme pour les
              // autres tests de sous-classe (dndCustomWizard), donc `value` resterait sinon à
              // sa valeur de niveau 1 — pas forcément > 0 selon le moment du test.
              "system.spells.uses.value": 5
            })
          ),
          { dndCustomWizard: true }
        );
      });

      let leveledSpellId;
      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Surtenance sauvage (Ensorceleur)"), "Capacité octroyée").to.exist;
        const leveledSpell = actor.items.find((i) => i.type === "spell" && i.system.level > 0);
        expect(leveledSpell, "un sort de niveau > 0 doit être connu au niveau 3").to.exist;
        leveledSpellId = leveledSpell.id;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      cy.window().its("game.messages.size").then((before) => {
        cy.get(`li[data-item-id="${leveledSpellId}"] button[data-action="castSpell"]`).click();

        cy.window()
          .its("game.i18n")
          .then((i18n) => i18n.localize("DND_CUSTOM.WildMagic.SorcererTableName"))
          .then((tableName) => {
            cy.window({ timeout: 10000 }).should((win) => {
              expect(win.game.messages.size, "au moins 2 nouveaux messages (tirage + lancer)").to.be.greaterThan(before);
              const recent = win.game.messages.contents.slice(before);
              const hasSurgeMessage = recent.some(
                (m) => (m.flavor ?? "").includes(tableName) || (m.content ?? "").includes(tableName)
              );
              expect(hasSurgeMessage, "un message de Surtenance sauvage a bien été posté").to.be.true;
            });
          });
      });
    });
  });

  it("Sorcellerie des tempêtes — Capacités octroyées, Vol tempétueux utilisable (T-SUB-SORCERER-002)", () => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Sub Sorcerer StormSorcery",
      origin: "ravenmoor",
      classKey: "sorcerer",
      skills: ["arcana", "deception"]
    }).then((actorId) => {
      createdActorIds.push(actorId);

      cy.window().then((win) => {
        const actor = win.game.actors.get(actorId);
        return actor.update(
          win.JSON.parse(win.JSON.stringify({ "system.attributes.level": 1, "system.subclass": "stormSorcery" })),
          { dndCustomWizard: true }
        );
      });

      cy.window().should((win) => {
        const actor = win.game.actors.get(actorId);
        expect(actor.items.find((i) => i.name === "Vol tempétueux"), "Vol tempétueux octroyée").to.exist;
        expect(actor.items.find((i) => i.name === "Affinité de la tempête"), "Affinité de la tempête octroyée").to.exist;
      });

      cy.openActorSheet(actorId);
      goToTab("abilities");

      withItemId(actorId, "Vol tempétueux", (itemId) => {
        cy.window().its("game.messages.size").then((before) => {
          cy.get(`li[data-item-id="${itemId}"] button[data-action="useFeatureCharge"]`).click();

          cy.window({ timeout: 10000 }).should((win) => {
            expect(win.game.messages.size, "message d'utilisation posté").to.be.greaterThan(before);
            expect(win.game.actors.get(actorId).items.get(itemId).system.uses.value, "charge décomptée").to.equal(0);
          });
        });
      });
    });
  });
});
