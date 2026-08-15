// Implémente la section 4 (T-EQUIP-001 à T-EQUIP-005) de tests/E2E_TEST_PLAN.md — onglet
// Équipement (tab-equipment.hbs). Tous les scénarios sont marqués "E2E" seul dans le plan (pas
// de volet Quench).
//
// Personnage partagé fighter (comme dans character-sheet.cy.js/tab-stats.cy.js), dont
// l'équipement de départ (classStartingEquipment.fighter, character-creation-wizard.js) donne
// déjà "Épée longue" (arme Polyvalente à une main, pratique pour T-EQUIP-001/003) et "Cotte de
// mailles" (armure de corps, T-EQUIP-004), les deux auto-équipées. "Grande hache" (arme à deux
// mains, T-EQUIP-002) et "Bouclier" (armure de slot "offHand", sert de remplisseur de main
// secondaire pour T-EQUIP-003) sont dupliquées depuis les Items du monde une fois en before().
// L'emplacement "accessory" (T-EQUIP-005) n'est utilisé par AUCUN Item livré avec le système
// (vérifié : world-items/armors.json n'a que "armor"/"offHand", cf. ArmorData.slot,
// scripts/data/item-data.js) — un Item de test minimal est créé pour l'exercer.
//
// Chaque test pose explicitement l'état d'équipement dont IL a besoin en début de scénario
// (plutôt que de supposer l'état laissé par le précédent) : les items partagés (arme à deux
// mains, bouclier) sont réutilisés d'un test à l'autre, donc l'ordre d'exécution ne doit pas
// pouvoir changer le résultat.

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

// Résout l'id d'un Item par son nom AVANT de construire un sélecteur qui en dépend : un id
// interpolé dans un sélecteur construit hors d'un `.then()` serait figé au moment où le test se
// construit (avant que la commande qui le calcule n'ait tourné), pas au moment où il s'exécute.
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
  // `{force: true}` : Cypress signale parfois cette case native comme couverte par
  // `.window-content` juste après un changement d'onglet (le tableau Armes/Armures défile,
  // rendu AppV2 encore en train de s'installer) alors qu'elle est bien cliquable pour un
  // utilisateur réel — aucun style personnalisé de ce système ne la sort du flux normal
  // (vérifié dans styles/dnd-custom-ai.css), donc rien d'autre à corriger côté template ici.
  if (checked) checkbox().check({ force: true });
  else checkbox().uncheck({ force: true });
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
      expect(greataxe, "prérequis : Item du monde 'Grande hache' importé").to.exist;
      expect(shield, "prérequis : Item du monde 'Bouclier' importé").to.exist;

      return actor
        .createEmbeddedDocuments("Item", [
          win.JSON.parse(win.JSON.stringify(greataxe.toObject())),
          win.JSON.parse(win.JSON.stringify(shield.toObject())),
          // Emplacement "accessory" : aucun Item livré avec le système ne l'utilise (armures =
          // "armor"/"offHand" seulement, cf. commentaire d'en-tête) — fixture minimale dédiée.
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

  it("emplacement main principale — équiper une arme à une main (T-EQUIP-001)", () => {
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

  it("une arme à deux mains occupe les deux emplacements (T-EQUIP-002)", () => {
    withItemId(sharedActorId, "Épée longue", (longswordId) => setEquipped(longswordId, false));
    withItemId(sharedActorId, "Bouclier", (shieldId) => setEquipped(shieldId, false));

    withItemId(sharedActorId, "Grande hache", (greataxeId) => {
      setEquipped(greataxeId, true);
      goToTab("equipment");
      equipmentSlotEl(MAIN_HAND).find(`.equipped-item-line[data-item-id="${greataxeId}"]`).should("exist");

      // La main secondaire n'affiche pas un doublon de l'objet, mais une mention dédiée.
      equipmentSlotEl(OFF_HAND).find(`[data-item-id="${greataxeId}"]`).should("not.exist");
      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.localize("DND_CUSTOM.Equipment.OccupiedTwoHanded"))
        .then((label) => {
          equipmentSlotEl(OFF_HAND).find(".empty-slot").should("contain.text", label);
        });

      // Désarme pour ne pas fausser les tests suivants (le fighter n'a alors plus d'arme
      // équipée, ce qui n'affecte aucun des scénarios restants de cette spec).
      setEquipped(greataxeId, false);
    });
  });

  it("arme Polyvalente — les dégâts affichés suivent la main secondaire (T-EQUIP-003)", () => {
    withItemId(sharedActorId, "Bouclier", (shieldId) => setEquipped(shieldId, false));
    withItemId(sharedActorId, "Grande hache", (greataxeId) => setEquipped(greataxeId, false));

    withItemId(sharedActorId, "Épée longue", (longswordId) => {
      setEquipped(longswordId, true);
      goToTab("equipment");
      // Main secondaire libre : dé à deux mains (1d10, cf. world-items/weapons.json).
      equipmentSlotEl(MAIN_HAND)
        .find(".equipment-roll-btn-damage")
        .should("contain.text", "1d10");

      withItemId(sharedActorId, "Bouclier", (shieldId) => {
        setEquipped(shieldId, true);
        goToTab("equipment");
        // Main secondaire occupée (par un objet autre que l'épée elle-même) : dé à une main (1d8).
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
        // CA absolue (pas un bonus signé) : cf. armorContribution, rules.js — slot "armor".
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

  it("accessoire équipé — bonus affiché avec son signe, pas en CA absolue (T-EQUIP-005)", () => {
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
});
