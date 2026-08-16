// Implémente la section 7 (T-JOURNAL-001, T-JOURNAL-002) de tests/E2E_TEST_PLAN.md — onglet
// Journal (tab-journal.hbs). Section volontairement petite (2 scénarios P2, E2E seul, pas de
// volet Quench) : listing des langues connues (auto-octroyées à la création, cf.
// class-content.js > grantLanguages) + ajout manuel par glisser-déposer d'une langue "special"
// depuis le compendium "Langues" (cf. world-items/languages.json — ces langues-là ne sont
// jamais auto-octroyées, quelle que soit l'origine, donc jamais présentes tant qu'on ne les
// glisse pas : cible sûre pour ce test, contrairement à une langue "origin" qui pourrait déjà
// être présente selon l'Actor de fixture utilisé).
//
// T-JOURNAL-002 simule le glisser-déposer sans repasser par le DOM source (la sidebar de
// compendium Foundry, hors de la fiche testée elle-même, n'est pas dans le périmètre ici) :
// construit un vrai DragEvent avec un DataTransfer contenant {type: "Item", uuid} — exactement
// la charge que Foundry lit lui-même côté récepteur — et le dispatch directement sur la racine
// de la fiche (`.application.character`, cf. character-sheet.cy.js), là où ActorSheetV2 attache
// son propre listener "drop" (dropSelector par défaut = tout l'élément, cf. commentaire de
// InventoryDragDropMixin._onDropItem sur ce point). Pas de dragover à simuler : contrairement à
// un vrai drag utilisateur, ce drop synthétique ne passe jamais par le moteur HTML5 natif du
// navigateur, donc aucun `preventDefault` sur dragover n'est requis pour que l'event "drop" soit
// traité par le listener de Foundry.

const createdActorIds = [];
let sharedActorId;

function sheetRoot() {
  return cy.get(".application.character");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
}

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Journal T-JOURNAL",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  if (!createdActorIds.length) return;
  // Session MJ : peut toujours supprimer, quel que soit le propriétaire (même piège que dans
  // les autres specs de section, cf. wizard.cy.js).
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Onglet Journal, session Joueur", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    openSheet(sharedActorId);
    sheetRoot().find('nav.tabs [data-tab="journal"]').click();
    sheetRoot().find('section.tab[data-tab="journal"]').should("have.class", "active");
  });

  it("liste Commune + la langue d'Origine, triées alphabétiquement (T-JOURNAL-001)", () => {
    sheetRoot()
      .find(".language-chip .item-name-link")
      .should(($links) => {
        const names = Array.from($links, (el) => el.textContent.trim());
        // Origine "fleuraine" (cf. cy.createReadyCharacter ci-dessus) -> langue "Fleurain" ;
        // "Commune" < "Fleurain" alphabétiquement quelle que soit la locale active du monde de
        // test (E avant F), donc l'ordre attendu est stable sans dépendre de game.i18n.lang.
        expect(names).to.deep.equal(["Commune", "Fleurain"]);
      });
  });

  it("glisser un Item langue depuis le compendium Langues l'ajoute au Journal (T-JOURNAL-002)", () => {
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
      .find(".language-chip .item-name-link")
      .should(($links) => {
        const names = Array.from($links, (el) => el.textContent.trim());
        expect(names).to.include("Argot des rues");
      });

    // Nettoyage : retire la langue ajoutée pour que ce test reste rejouable sans recréer l'Actor
    // (ex. en `cypress open` interactif où les tests sont relancés individuellement).
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const added = actor.items.find((item) => item.name === "Argot des rues");
      return added?.delete();
    });
  });
});
