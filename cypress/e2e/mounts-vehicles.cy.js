// Compendium « montures-vehicules » : montures (Actor mount) et véhicules (Actor vehicle),
// visibles des joueurs ; une seule fiche pour les deux (description, inventaire, capacité de charge),
// la monture y ajoute sa taille (don Combat monté).

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

  it("une monture ouvre la fiche Véhicule : taille, description, inventaire et poids transporté (T-MOUNT-002)", () => {
    let mountId;
    cy.window()
      .then(async (win) => {
        const pack = win.game.packs.get("dnd-custom-ai.montures-vehicules");
        const entry = [...(await pack.getIndex())].find((candidate) => candidate.name === "Destrier fleurainais");
        const actor = await win.game.actors.importFromCompendium(pack, entry._id);
        createdActorIds.push(actor.id);
        mountId = actor.id;
        expect(actor.type).to.equal("mount");
        expect(actor.system.carryCapacity, "capacité de charge du destrier").to.equal(245);
        expect(actor.system.size).to.equal("g");
        expect(actor.system.attributes.hp.max).to.equal(19);
        expect(actor.system.attacks, "plus de profil de créature").to.be.undefined;
        await actor.sheet.render(true);
      })
      .then(() => {
        cy.get(".application.vehicle select[name='system.size']", { timeout: 10000 }).should("have.value", "g");
        cy.get(".application.vehicle textarea[name='system.description']").invoke("val").should("match", /^Prix : 400 po/);
      });

    // Un objet déposé sur la monture rejoint son inventaire et compte dans le poids transporté.
    cy.window().then((win) => {
      const gear = win.game.items.find((item) => item.type === "gear" && item.system.weight > 0);
      const dataTransfer = new win.DataTransfer();
      dataTransfer.setData("text/plain", win.JSON.stringify({ type: "Item", uuid: gear.uuid }));
      const dropEvent = new win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer });
      win.document.querySelector(".application.vehicle").dispatchEvent(dropEvent);
      cy.wrap(gear.name).as("gearName");
    });
    cy.get("@gearName").then((gearName) => {
      cy.window().should((win) => {
        expect(win.game.actors.get(mountId).items.getName(gearName), "objet dans l'inventaire de la monture").to.exist;
      });
      cy.get(".application.vehicle .inventory-table").should("contain.text", gearName);
      cy.get(".application.vehicle .carrying-capacity .label span:last-child")
        .invoke("text")
        .should("match", /\/ 245 kg$/)
        .and("not.match", /^0 kg/);
    });
  });

  it("une ancienne monture au profil de créature est convertie à la lecture (T-MOUNT-004)", () => {
    cy.window().then(async (win) => {
      const legacy = {
        name: "Vieux cheval de test",
        type: "mount",
        system: {
          creatureType: "beast",
          size: "g",
          attributes: { hp: { value: 13, max: 13, temp: 0 }, ac: { value: 10 }, speed: 18 },
          particularity: "Prix : 75 po. Un vieux cheval. Capacité de charge : 217 kg."
        }
      };
      const actor = await win.Actor.create(win.JSON.parse(win.JSON.stringify(legacy)));
      createdActorIds.push(actor.id);
      expect(actor.system.carryCapacity).to.equal(217);
      expect(actor.system.description).to.equal("Prix : 75 po. Un vieux cheval. Classe d'armure 10.");
      expect(actor.system.size).to.equal("g");
    });
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
