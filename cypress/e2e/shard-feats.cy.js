// Dons d'éclat (récompenses des pierres) : rangement du compendium, sorts octroyés au glisser,
// lancer gratuit une fois par repos long, Éclat absorbé (+2) cumulable, PV de l'Éclat de Tirwen.

const createdActorIds = [];
let actorId;

function sheetRoot() {
  return cy.get(".application.character");
}

// Glisse le don `name` du compendium « Dons » sur la fiche, par le vrai gestionnaire de dépôt.
function dropFeatFromCompendium(name) {
  return cy.window().then(async (win) => {
    const pack = win.game.packs.get("dnd-custom-ai.dons");
    const docs = await pack.getDocuments();
    const feat = docs.find((doc) => doc.name === name);
    expect(feat, `"${name}" présent dans le compendium Dons`).to.exist;
    const actor = win.game.actors.get(actorId);
    return actor.sheet._onDropItem(new win.DragEvent("drop"), feat);
  });
}

before(() => {
  cy.loginAsGM();
  cy.assertSystemVersionMatches();
  cy.createReadyCharacter({
    name: "Shard Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    actorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => (createdActorIds.length ? win.Actor.deleteDocuments(createdActorIds) : null));
});

describe("Dons d'éclat", () => {
  beforeEach(() => cy.loginAsGM());

  it("le compendium Dons range les 9 dons d'éclat dans le dossier « Éclats » (T-SHARD-001)", () => {
    cy.window().then(async (win) => {
      const pack = win.game.packs.get("dnd-custom-ai.dons");
      const docs = await pack.getDocuments();
      const shards = docs.filter((doc) => doc.flags?.["dnd-custom-ai"]?.shard);
      expect(shards.length, "9 dons d'éclat").to.equal(9);
      const folderName = win.game.i18n.localize("DND_CUSTOM.Folders.Shards");
      for (const doc of shards) expect(doc.folder?.name, `dossier de "${doc.name}"`).to.equal(folderName);
      const plain = docs.filter((doc) => !doc.flags?.["dnd-custom-ai"]?.shard);
      for (const doc of plain) expect(doc.folder, `"${doc.name}" reste hors dossier`).to.not.exist;
    });
  });

  it("Éclat de Zahir : Pas brumeux octroyé au glisser, gratuit une fois puis refusé (Guerrier) (T-SHARD-002)", () => {
    dropFeatFromCompendium("Éclat de Zahir");
    cy.window().should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.items.find((item) => item.type === "feature" && item.name === "Éclat de Zahir"), "don posé").to.exist;
      expect(actor.items.find((item) => item.type === "spell" && item.name === "Pas brumeux"), "sort octroyé").to.exist;
    });

    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();

    const castMistyStep = () => {
      sheetRoot().find('.spell-level-tab[data-level="2"]').click();
      sheetRoot().find('.spell-level-group[data-level="2"]').should("have.class", "active");
      sheetRoot().contains("li", "Pas brumeux").find('button[data-action="castSpell"]').click();
    };
    const shardUses = (win) =>
      win.game.actors.get(actorId).items.find((item) => item.name === "Éclat de Zahir").system.uses.value;

    let messagesBefore;
    cy.window()
      .then((win) => {
        expect(shardUses(win), "une utilisation disponible").to.equal(1);
        messagesBefore = win.game.messages.size;
      })
      .then(castMistyStep);
    cy.window().should((win) => {
      expect(win.game.messages.size, "lancer réussi malgré 0 emplacement").to.equal(messagesBefore + 1);
      expect(shardUses(win), "utilisation consommée").to.equal(0);
    });

    cy.window()
      .then((win) => (messagesBefore = win.game.messages.size))
      .then(castMistyStep);
    cy.window().should((win) => {
      expect(win.game.messages.size, "second lancer refusé, faute d'emplacement").to.equal(messagesBefore);
    });
  });

  it("Éclat absorbé (+2) se prend deux fois et s'ajoute à la Marque d'éclat (T-SHARD-003)", () => {
    let strBefore;
    cy.window().then((win) => (strBefore = win.game.actors.get(actorId).system.abilities.str.total));
    dropFeatFromCompendium("Marque d'éclat");
    dropFeatFromCompendium("Éclat absorbé (+2)");
    dropFeatFromCompendium("Éclat absorbé (+2)");
    cy.window().then(async (win) => {
      const actor = win.game.actors.get(actorId);
      const picks = actor.items.filter((item) => ["Marque d'éclat", "Éclat absorbé (+2)"].includes(item.name));
      expect(picks.length, "Marque + deux exemplaires d'Éclat absorbé").to.equal(3);
      // Objets reconstruits dans la fenêtre Foundry (sinon refusés, autre réalité JS).
      const updates = win.JSON.parse(
        JSON.stringify(picks.map((item) => ({ _id: item.id, "system.chosenAbility": "str" })))
      );
      await actor.updateEmbeddedDocuments("Item", updates);
    });
    cy.window().should((win) => {
      expect(win.game.actors.get(actorId).system.abilities.str.total, "+1 +2 +2").to.equal(strBefore + 5);
    });
  });

  it("Éclat de Tirwen : +1 PV max par niveau (T-SHARD-004)", () => {
    let hpBefore;
    let level;
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      hpBefore = actor.system.attributes.hp.max;
      level = actor.system.attributes.level;
    });
    dropFeatFromCompendium("Éclat de Tirwen");
    cy.window().should((win) => {
      expect(win.game.actors.get(actorId).system.attributes.hp.max).to.equal(hpBefore + level);
    });
  });
});
