// Implémente la section 9 (T-REF-001 à T-REF-004) de tests/E2E_TEST_PLAN.md — fiches de
// référence Classe/Sous-classe/Origine, ouvertes depuis les boutons de l'en-tête de la fiche
// personnage (`data-action="openClassSheet"/"openSubclassSheet"/"openOriginSheet"`,
// #openReferenceItem dans actor-sheet.js).
//
// #openReferenceItem cherche d'abord par NOM exact dans les Items du monde
// (`game.items.getName`), puis dans le compendium correspondant (classes/sous-classes/
// origines) — sous ce monde de test, ces Items vivent uniquement en compendium (importés par
// content-import.js, jamais dans les Items du monde), donc T-REF-001/002/003 exercent
// systématiquement le second chemin (lookup par pack.index puis pack.getDocument).
//
// T-REF-004 (avertissement si introuvable) est le seul scénario à devoir être joué en session
// MJ : reproduire "introuvable" exige de supprimer temporairement l'Item de référence du
// compendium (packs/origines), une opération que l'ownership du pack (PLAYER: OBSERVER, cf.
// system.json) refuse à un Joueur. Restauré dans un `afterEach` (pas à la fin du `it` lui-même)
// via `game.dndCustomAi.importSystemContent({ notifyIfEmpty: false })` — ré-import idempotent,
// dédoublonné par nom (content-import.js) — pour que la restauration ait lieu même si
// l'assertion du test échoue, et ne pas laisser le compendium partagé entre toutes les specs de
// cette session dans un état amputé.

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

// Titre de la dernière fiche d'Item ouverte (pas la fiche personnage elle-même, scopée par
// `.application.sheet.item`, cf. classes CSS posées par DocumentSheetV2/ItemSheetV2 — jamais
// utilisé ailleurs dans cette suite jusqu'ici, aucune spec n'avait encore ouvert de fiche
// d'Item). Le titre affiché peut inclure un préfixe de type non localisé (clé `TYPES.Item.*`
// brute si absente des fichiers de langue, même comportement déjà observé sur la fiche
// personnage) : on vérifie seulement qu'il CONTIENT le nom attendu, pas l'égalité stricte.
function latestItemSheetTitle() {
  return cy.get(".application.sheet.item .window-title", { timeout: 10000 });
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
      // subclassAvailable (actor-sheet.js > getData, condition du bouton openSubclassSheet dans
      // character-sheet.hbs) exige `system.attributes.level >= DND_CUSTOM.subclassLevel[classe]`
      // (fighter = 3, config.js) — sans ce niveau, le bouton n'existe simplement pas dans le DOM.
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

  // **Volontairement rouge** — 3e manifestation du même bug de locale que T-STATS-012/T-LVL-004
  // (cf. tests/README.md > "Bug connu"), mais dans un chemin de code différent :
  // #onOpenClassSheet (actor-sheet.js) résout `name = game.i18n.localize(DND_CUSTOM.classes.
  // fighter)` = "Fighter" sous ce monde anglais, puis cherche un Item nommé EXACTEMENT "Fighter"
  // (Items du monde puis compendium `classes`) — mais l'Item réel s'appelle "Guerrier" (nom
  // français codé en dur dans world-items/classes.json, jamais traduit). La recherche échoue
  // donc systématiquement sous cette locale : #openReferenceItem se contente d'un avertissement
  // non bloquant (`ClassSheetMissing`) plutôt que d'ouvrir la fiche attendue. NE PAS neutraliser.
  it("ouvre la fiche de Classe (T-REF-001, régression connue)", () => {
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Classes.fighter"))
      .then((classLabel) => {
        sheetRoot().find('button[data-action="openClassSheet"]').click();
        latestItemSheetTitle().should("contain.text", classLabel);
      });
  });

  it("ouvre la fiche de Sous-classe (T-REF-002)", () => {
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Subclasses.fighter.champion"))
      .then((subclassLabel) => {
        sheetRoot().find('button[data-action="openSubclassSheet"]').click();
        latestItemSheetTitle().should("contain.text", subclassLabel);
      });
  });

  it("ouvre la fiche d'Origine (T-REF-003)", () => {
    cy.window()
      .then((win) => win.game.dndCustomAi.origins.fleuraine.label)
      .then((originLabel) => {
        sheetRoot().find('button[data-action="openOriginSheet"]').click();
        latestItemSheetTitle().should("contain.text", originLabel);
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
        const document = docs.find((candidate) => candidate.name === "Fleuraine");
        expect(document, "prérequis : l'Item d'Origine 'Fleuraine' existe dans le compendium").to.exist;
        return document.delete();
      });
    });

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
