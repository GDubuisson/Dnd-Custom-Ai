// Implémente les Invocations occultes (Occultiste) — revue de conception du 2026-08-22/23,
// ANOMALIES_ACTIVES.md, périmètre "petit lot mécanisé" choisi explicitement avec l'utilisateur.
// Contrairement à la Métamagie (un seul mécanisme partagé), les Invocations occultes SRD n'ont
// pas de terrain commun : une seule (Salve implacable / Agonizing Blast) s'est avérée
// mécanisable sans gros chantier, les 7 autres ajoutées au compendium restent du texte pur.
//
// Modèle retenu (cf. FeatureData#boostsSpellDamage/boostsSpellDamageAbility, item-data.js,
// #onRollSpellDamage dans actor-sheet.js) : une Capacité dont `boostsSpellDamage` correspond au
// nom exact d'un Sort possédé ajoute le modificateur de `boostsSpellDamageAbility` au jet de
// dégâts de CE Sort, et de lui seul. Ces Invocations sont `manualOnly` (item-data.js) : jamais
// octroyées par grantClassContent même si `class`/`level` correspondent (le pool SRD compte 30+
// options dont seul un sous-ensemble est connu à la fois) — d'où grantCompendiumItem ci-dessous,
// jamais l'assistant de création, même stratégie que tab-abilities.cy.js (cf. son en-tête).

const createdActorIds = [];
let warlockId;

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
      return { formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, "") };
    });
}

// Même helper que tab-abilities.cy.js (cf. son en-tête) : octroie un Item du compendium réel par
// son nom exact, jamais via grantClassContent — teste le contenu réellement livré, pas une
// fixture minimale.
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

before(() => {
  // Réimport idempotent (session MJ) : garantit que "Salve implacable" (ajoutée à
  // world-items/features.json) est bien présente dans le compendium Capacités de CETTE instance
  // Docker persistée, même si son dernier chargement de monde date d'avant l'ajout — même
  // pattern que reference-sheets.cy.js/tab-stats.cy.js (importSystemContent n'importe que les
  // entrées absentes, idempotent).
  cy.loginAsGM();
  cy.window().then((win) => win.game.dndCustomAi.importSystemContent({ notifyIfEmpty: false }));

  cy.loginAsPlayer();
  cy.createReadyCharacter({ name: "Eldritch Invocations Warlock", origin: "ravenmoor", classKey: "warlock", skills: ["arcana", "deception"] }).then(
    (id) => {
      warlockId = id;
      createdActorIds.push(id);
      cy.window().then((win) =>
        Promise.all([
          grantCompendiumItem(win, id, "sorts", "Décharge occulte"),
          grantCompendiumItem(win, id, "sorts", "Trait de feu")
        ])
      );
      // Charisme à 18 (mod +4), valeur déterministe indépendante de l'Origine choisie.
      // `dndCustomWizard: true` requis : preUpdateActor (dnd-custom-ai.js) bloque sinon toute
      // écriture directe de system.abilities par un Joueur hors assistant/montée de niveau
      // (filet de sécurité "champs de build réservés au MJ").
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(id), { "system.abilities.cha.value": 18 }, { dndCustomWizard: true })
      );
    }
  );
  cy.window().then((win) => win.game.actors.get(warlockId)?.sheet?.close());
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Invocations occultes — Salve implacable (Agonizing Blast)", () => {
  // Chaque test réauthentifie explicitement (cf. tab-abilities.cy.js/metamagic-careful-heightened.cy.js) :
  // l'isolation Cypress efface cookies/storage entre chaque `it()` (page ramenée à about:blank),
  // sans quoi `win.game` est indéfini au début de tout test après le premier.
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("sans l'Invocation : dégâts de Décharge occulte sans bonus", () => {
    cy.openActorSheet(warlockId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(warlockId, "Décharge occulte", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "aucun bonus sans Salve implacable").to.equal("1d10");
      });
    });
  });

  it("avec l'Invocation : dégâts de Décharge occulte + modificateur de Charisme", () => {
    cy.openActorSheet(warlockId);
    cy.window().then((win) => grantCompendiumItem(win, warlockId, "capacites", "Salve implacable"));
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(warlockId, "Décharge occulte", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "modificateur de Charisme (+4) ajouté").to.equal("1d10+4");
      });
    });
  });

  it("l'Invocation ne s'applique qu'à Décharge occulte, pas à un autre Sort d'attaque", () => {
    cy.openActorSheet(warlockId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(warlockId, "Trait de feu", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "Salve implacable ne cible que Décharge occulte par son nom exact").to.equal("1d10");
      });
    });
  });
});
