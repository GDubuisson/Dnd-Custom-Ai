// T-REF-001 à 005 : fiches de référence Classe/Sous-classe/Origine et Guide du Joueur depuis l'en-tête.
// T-REF-004 (introuvable) en session MJ : l'entrée supprimée est réimportée dans afterEach.

const createdActorIds = [];
let sharedActorId;

function sheetRoot() {
  return cy.get(".application.character");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

// Titre de la dernière fiche d'Item ouverte (comparé par inclusion).
function latestItemSheetTitle() {
  return cy.get(".application.sheet.item .window-title", { timeout: 10000 });
}

// Supprime l'entrée jusqu'à ce que son absence soit stable (l'import de fond peut la recréer).
function ensureCompendiumEntryDeleted(win, packName, entryName, stableChecks = 0, attempts = 0) {
  if (attempts > 40) throw new Error(`Impossible de garder '${entryName}' supprimé du compendium ${packName} (ré-import en boucle ?)`);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return win.game.packs
    .get(`dnd-custom-ai.${packName}`)
    .getDocuments()
    .then((docs) => {
      const doc = docs.find((candidate) => candidate.name === entryName);
      if (doc) return doc.delete().then(() => wait(400)).then(() => ensureCompendiumEntryDeleted(win, packName, entryName, 0, attempts + 1));
      if (stableChecks >= 3) return null;
      return wait(400).then(() => ensureCompendiumEntryDeleted(win, packName, entryName, stableChecks + 1, attempts + 1));
    });
}

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Reference Sheets",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);
    return cy.window().then((win) => {
      const actor = win.game.actors.get(id);
      // Niveau de sous-classe requis pour afficher le bouton.
      return updateActor(
        win,
        actor,
        { "system.subclass": "champion", "system.attributes.level": 3 },
        { dndCustomWizard: true }
      );
    });
  });
});

after(() => {
  if (!createdActorIds.length) return;
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Fiches de référence — ouverture depuis la fiche personnage", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    openSheet(sharedActorId);
  });

  // Referme les fiches d'Item et de Journal ouvertes.
  afterEach(() => {
    cy.window().then((win) => {
      const closing = [];
      for (const app of win.foundry.applications.instances.values()) {
        if (["Item", "JournalEntry"].includes(app.document?.documentName)) closing.push(app.close());
      }
      return Promise.all(closing);
    });
  });

  // La fiche de Classe est trouvée par `system.classKey`, son titre reste le nom français.
  it("ouvre la fiche de Classe correspondant à la clé de classe de l'Actor (T-REF-001)", () => {
    cy.window()
      .then((win) => win.game.packs.get("dnd-custom-ai.classes").getDocuments())
      .then((docs) => docs.find((item) => item.system.classKey === "fighter"))
      .then((expected) => {
        expect(expected, "prérequis : un Item 'class' avec classKey='fighter' existe").to.not.equal(undefined);
        sheetRoot().find('button[data-action="openClassSheet"]').click();
        latestItemSheetTitle().should("contain.text", expected.name);
      });
  });

  it("ouvre la fiche de Sous-classe (T-REF-002)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Subclasses.fighter.champion"))
      .then((subclassLabel) => {
        sheetRoot().find('button[data-action="openSubclassSheet"]').click();
        latestItemSheetTitle().should("contain.text", subclassLabel);
      });
  });

  it("ouvre la fiche d'Origine (T-REF-003)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    cy.window()
      .then((win) => win.game.dndCustomAi.origins.fleuraine.label)
      .then((originLabel) => {
        sheetRoot().find('button[data-action="openOriginSheet"]').click();
        latestItemSheetTitle().should("contain.text", originLabel);
      });
  });

  // Bouton « Guide du Joueur », en session Joueur.
  it("ouvre le Journal « Guide du Joueur » depuis l'en-tête (T-REF-005)", () => {
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Journal.PlayerGuideTitle"))
      .then((guideName) => {
        sheetRoot().find('button[data-action="openPlayerGuide"]').click();
        cy.window({ timeout: 10000 }).should((win) => {
          const open = [...win.foundry.applications.instances.values()].some(
            (app) => app.document?.documentName === "JournalEntry" && app.document.name === guideName && app.rendered
          );
          expect(open, `le Journal « ${guideName} » est ouvert pour le joueur`).to.equal(true);
        });
      });
  });
});

describe("Fiches de référence — avertissement si introuvable, session MJ", () => {
  afterEach(() => {
    cy.loginAsGM();
    cy.window().then((win) => win.game.dndCustomAi.importSystemContent({ notifyIfEmpty: false }));
    cy.window().should((win) => {
      const pack = win.game.packs.get("dnd-custom-ai.origines");
      expect(pack.index.find((entry) => entry.name === "Fleuraine"), "Origine 'Fleuraine' restaurée dans le compendium").to.exist;
    });
  });

  it("avertit sans bloquer si l'Item de référence est introuvable, sans erreur JS (T-REF-004)", () => {
    cy.loginAsGM();
    cy.window().then((win) => {
      const pack = win.game.packs.get("dnd-custom-ai.origines");
      return pack.getDocuments().then((docs) => {
        expect(
          docs.find((candidate) => candidate.name === "Fleuraine"),
          "prérequis : l'Item d'Origine 'Fleuraine' existe dans le compendium"
        ).to.exist;
      });
    });
    cy.window().then((win) => ensureCompendiumEntryDeleted(win, "origines", "Fleuraine"));

    openSheet(sharedActorId);

    let warnedMessage = null;
    cy.window().then((win) => {
      const original = win.ui.notifications.warn.bind(win.ui.notifications);
      win.ui.notifications.warn = (message) => {
        warnedMessage = message;
        return original(message);
      };
    });

    sheetRoot().find('button[data-action="openOriginSheet"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Actor.OriginSheetMissing", { name: "Fleuraine" }))
      .then((expectedMessage) => {
        cy.window().should(() => {
          expect(warnedMessage, "avertissement OriginSheetMissing attendu").to.equal(expectedMessage);
        });
      });
  });
});
