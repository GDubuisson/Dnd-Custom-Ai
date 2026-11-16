// Compendium « montures-vehicules » : montures SRD (Actor mount) et véhicules (Actor vehicle),
// visibles des joueurs ; fiche Véhicule avec description (prix, attelage).

const createdActorIds = [];

const MOUNTS = ["Cheval de selle", "Destrier fleurainais", "Cheval de trait", "Mule de l'Eismark", "Chameau de piste"];
const VEHICLES = ["Chariot de convoi", "Traîneau des guides d'Eisengrund", "Navire de cabotage", "Barque de la Passe"];

// Attend la fin de l'import automatique (le bestiaire est importé en dernier).
function waitForAutoImport() {
  cy.waitForContentImport();
  return cy.window().should((win) => {
    expect(win.game.packs.get("dnd-custom-ai.montures-vehicules"), "compendium absent").to.exist;
  });
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Compendium « Montures et véhicules »", () => {
  beforeEach(() => {
    cy.loginAsGM();
    cy.assertSystemVersionMatches();
    waitForAutoImport();
  });

  it("contient les 5 montures et les 4 véhicules attendus, visibles des joueurs (T-MOUNT-001)", () => {
    cy.window().then(async (win) => {
      const pack = win.game.packs.get("dnd-custom-ai.montures-vehicules");
      const index = await pack.getIndex();
      const byType = (type) => [...index].filter((entry) => entry.type === type).map((entry) => entry.name);
      expect(byType("mount")).to.have.members(MOUNTS);
      expect(byType("vehicle")).to.have.members(VEHICLES);
      const player = win.game.users.find((user) => !user.isGM);
      expect(pack.testUserPermission(player, "OBSERVER"), "compendium consultable par un joueur").to.be.true;
    });
  });

  it("une monture importée garde son bloc SRD et ouvre la fiche PNJ (T-MOUNT-002)", () => {
    cy.window()
      .then(async (win) => {
        const pack = win.game.packs.get("dnd-custom-ai.montures-vehicules");
        const entry = [...(await pack.getIndex())].find((candidate) => candidate.name === "Destrier fleurainais");
        const actor = await win.game.actors.importFromCompendium(pack, entry._id);
        createdActorIds.push(actor.id);
        expect(actor.type).to.equal("mount");
        expect(actor.system.attributes.hp.max, "PV du cheval de guerre SRD").to.equal(19);
        expect(actor.system.attacks[0].damage.dice).to.equal("2d6");
        await actor.sheet.render(true);
        return actor.id;
      })
      .then(() => cy.get(".application.npc", { timeout: 10000 }).should("contain.text", "Charge piétinante"));
  });

  it("la fiche Véhicule affiche la description avec le prix (T-MOUNT-003)", () => {
    cy.window()
      .then(async (win) => {
        const pack = win.game.packs.get("dnd-custom-ai.montures-vehicules");
        const entry = [...(await pack.getIndex())].find((candidate) => candidate.name === "Chariot de convoi");
        const actor = await win.game.actors.importFromCompendium(pack, entry._id);
        createdActorIds.push(actor.id);
        expect(actor.system.carryCapacity, "traction de deux chevaux de trait").to.equal(2270);
        await actor.sheet.render(true);
      })
      .then(() =>
        cy
          .get(".application.vehicle textarea[name='system.description']", { timeout: 10000 })
          .invoke("val")
          .should("match", /^Prix : 35 po/)
      );
  });
});
