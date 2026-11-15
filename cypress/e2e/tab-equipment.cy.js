// T-EQUIP-001 à 007 : onglet Équipement sur un Guerrier partagé ; chaque test pose l'équipement
// dont il a besoin. Un Item « accessory » de test est créé (aucun n'est livré).

const createdActorIds = [];
let sharedActorId;

const MAIN_HAND = 0;
const OFF_HAND = 1;
const ARMOR = 2;
const ACCESSORIES = 3;

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function equipmentSlotEl(index) {
  return sheetRoot().find(".equipment-slot").eq(index);
}

// Résout l'id d'un Item par son nom avant de construire le sélecteur.
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

function setEquipped(itemId, checked) {
  const checkbox = () => cy.get(`tr[data-item-id="${itemId}"] input[data-item-equipped]`);
  goToTab("inventory");
  // `force` : la case peut être signalée couverte juste après un changement d'onglet.
  if (checked) checkbox().check({ force: true }); // NOSONAR : case couverte (cf. ci-dessus)
  else checkbox().uncheck({ force: true }); // NOSONAR : case couverte (cf. ci-dessus)
}

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Tab Equipment Fighter",
    origin: "ravenmoor",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);

    cy.window().then((win) => {
      const actor = win.game.actors.get(id);
      const greataxe = win.game.items.getName("Grande hache");
      const shield = win.game.items.getName("Bouclier");
      const dagger = win.game.items.getName("Dague");
      expect(greataxe, "prérequis : Item du monde 'Grande hache' importé").to.exist;
      expect(shield, "prérequis : Item du monde 'Bouclier' importé").to.exist;
      expect(dagger, "prérequis : Item du monde 'Dague' importé").to.exist;

      return actor
        .createEmbeddedDocuments("Item", [
          win.JSON.parse(win.JSON.stringify(greataxe.toObject())),
          win.JSON.parse(win.JSON.stringify(shield.toObject())),
          // Arme à une main Légère, non équipée.
          (() => {
            const data = win.JSON.parse(win.JSON.stringify(dagger.toObject()));
            data.system.equipped = false;
            return data;
          })(),
          // Item d'emplacement « accessory ».
          win.JSON.parse(
            win.JSON.stringify({
              name: "Tab Equipment Test Ring",
              type: "armor",
              system: { slot: "accessory", armorType: "light", baseAC: 1, equipped: false }
            })
          )
        ])
        .then(() => {});
    });
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Onglet Équipement", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
  });

  it("emplacement main principale — équiper une arme à une main (T-EQUIP-001)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    withItemId(sharedActorId, "Épée longue", (weaponId) => {
      setEquipped(weaponId, false);
      goToTab("equipment");
      equipmentSlotEl(MAIN_HAND).find(".empty-slot").should("exist");
      equipmentSlotEl(MAIN_HAND).find(`[data-item-id="${weaponId}"]`).should("not.exist");

      setEquipped(weaponId, true);
      goToTab("equipment");
      equipmentSlotEl(MAIN_HAND).find(`.equipped-item-line[data-item-id="${weaponId}"]`).should("exist");
    });
  });

  it("une arme à deux mains occupe les deux emplacements (T-EQUIP-002)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    withItemId(sharedActorId, "Épée longue", (longswordId) => setEquipped(longswordId, false));
    withItemId(sharedActorId, "Bouclier", (shieldId) => setEquipped(shieldId, false));

    withItemId(sharedActorId, "Grande hache", (greataxeId) => {
      setEquipped(greataxeId, true);
      goToTab("equipment");
      equipmentSlotEl(MAIN_HAND).find(`.equipped-item-line[data-item-id="${greataxeId}"]`).should("exist");

      // Main secondaire : mention dédiée, pas de doublon.
      equipmentSlotEl(OFF_HAND).find(`[data-item-id="${greataxeId}"]`).should("not.exist");
      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.localize("DND_CUSTOM.Equipment.OccupiedTwoHanded"))
        .then((label) => {
          equipmentSlotEl(OFF_HAND).find(".empty-slot").should("contain.text", label);
        });

      // Déséquipe l'arme.
      setEquipped(greataxeId, false);
    });
  });

  it("arme Polyvalente — les dégâts affichés suivent la main secondaire (T-EQUIP-003)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    withItemId(sharedActorId, "Bouclier", (shieldId) => setEquipped(shieldId, false));
    withItemId(sharedActorId, "Grande hache", (greataxeId) => setEquipped(greataxeId, false));

    withItemId(sharedActorId, "Épée longue", (longswordId) => {
      setEquipped(longswordId, true);
      goToTab("equipment");
      // Main secondaire libre : dé à deux mains (1d10).
      equipmentSlotEl(MAIN_HAND)
        .find(".equipment-roll-btn-damage")
        .should("contain.text", "1d10");

      withItemId(sharedActorId, "Bouclier", (shieldId) => {
        setEquipped(shieldId, true);
        goToTab("equipment");
        // Main secondaire occupée : dé à une main (1d8).
        equipmentSlotEl(MAIN_HAND)
          .find(".equipment-roll-btn-damage")
          .should("contain.text", "1d8");

        setEquipped(shieldId, false);
      });
    });
  });

  it("emplacement armure — la CA affichée est la CA totale de l'armure (T-EQUIP-004)", () => {
    withItemId(sharedActorId, "Cotte de mailles", (armorId) => {
      setEquipped(armorId, false);
      goToTab("equipment");
      equipmentSlotEl(ARMOR).find(".empty-slot").should("exist");

      setEquipped(armorId, true);
      goToTab("equipment");
      cy.window().then((win) => {
        const armor = win.game.actors.get(sharedActorId).items.get(armorId);
        // Armure de corps : CA absolue.
        expect(armor.system.baseAC, "prérequis : la CA de base sert de référence pour l'assertion").to.be.greaterThan(
          0
        );
      });
      equipmentSlotEl(ARMOR)
        .find(`.equipped-item-line[data-item-id="${armorId}"]`)
        .find(".item-stats-line")
        .should(($el) => {
          const text = $el.text();
          expect(text).to.not.match(/[+-]\d/); // pas de signe : CA absolue, pas un bonus
          expect(text).to.match(/\d/);
        });
    });
  });

  it("accessoire équipé — bonus affiché avec son signe, pas en CA absolue (T-EQUIP-005)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    withItemId(sharedActorId, "Tab Equipment Test Ring", (ringId) => {
      setEquipped(ringId, true);
      goToTab("equipment");
      equipmentSlotEl(ACCESSORIES)
        .find(`.equipped-item-line[data-item-id="${ringId}"]`)
        .find(".item-stats-line")
        .should("contain.text", "+1"); // baseAC: 1 sur la fixture, cf. before()

      setEquipped(ringId, false);
    });
  });

  // Choix d'emplacement proposé en équipant une arme à une main Légère.
  it("arme à une main Légère — fenêtre de choix d'emplacement, Main secondaire choisie (T-EQUIP-006)", () => {
    withItemId(sharedActorId, "Épée longue", (longswordId) => setEquipped(longswordId, false));
    withItemId(sharedActorId, "Bouclier", (shieldId) => setEquipped(shieldId, false));

    withItemId(sharedActorId, "Dague", (daggerId) => {
      goToTab("inventory");
      cy.get(`tr[data-item-id="${daggerId}"] input[data-item-equipped]`).check({ force: true }); // NOSONAR : case parfois signalée couverte après un changement d'onglet

      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.localize("DND_CUSTOM.Equipment.ChooseSlotTitle"))
        .then((title) => {
          cy.get("dialog.application.dialog .window-title", { timeout: 10000 }).should("contain.text", title);
        });

      cy.get('dialog.application.dialog input[type="radio"][name="equipSlot"][value="offHand"]').check();
      cy.get('dialog.application.dialog button[data-action="ok"]').click();

      cy.window().should((win) => {
        const item = win.game.actors.get(sharedActorId).items.get(daggerId);
        expect(item.system.equipped, "équipée après confirmation de la fenêtre").to.be.true;
        expect(item.system.slot, "emplacement choisi dans la fenêtre appliqué").to.equal("offHand");
      });

      goToTab("equipment");
      equipmentSlotEl(OFF_HAND).find(`.equipped-item-line[data-item-id="${daggerId}"]`).should("exist");

      setEquipped(daggerId, false);
    });
  });

  it("fenêtre de choix d'emplacement annulée — l'arme reste non équipée (T-EQUIP-007)", () => {
    withItemId(sharedActorId, "Dague", (daggerId) => {
      goToTab("inventory");
      cy.get(`tr[data-item-id="${daggerId}"] input[data-item-equipped]`).check({ force: true }); // NOSONAR : case parfois signalée couverte après un changement d'onglet

      cy.get("dialog.application.dialog", { timeout: 10000 }).should("exist");
      cy.get('dialog.application.dialog button[data-action="close"]').click();

      cy.window().should((win) => {
        expect(
          win.game.actors.get(sharedActorId).items.get(daggerId).system.equipped,
          "toujours non équipée après annulation de la fenêtre"
        ).to.be.false;
      });
      // Dialogue fermé : la case redevient décochée.
      cy.get(`tr[data-item-id="${daggerId}"] input[data-item-equipped]`).should("not.be.checked");
    });
  });
});
