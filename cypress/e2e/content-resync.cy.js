// Resynchronisation du contenu de référence : une entrée qui diffère du JSON source est écrasée,
// une entrée identique n'est jamais patchée (T-SYNC-001). Session MJ.

// Attend la fin de l'import automatique (« adversaires » à 15 entrées, dernier fichier importé) ;
// ne jamais relancer l'import en parallèle.
function waitForAutoImport() {
  return cy.window({ timeout: 20000 }).should((win) => {
    const pack = win.game.packs.get("dnd-custom-ai.adversaires");
    expect(pack, "compendium 'adversaires' introuvable").to.exist;
    expect(pack.index.size, "import automatique pas encore terminé").to.equal(15);
  });
}

afterEach(() => {
  // Restaure « Rage » et le poids de « Dague », même après un échec.
  cy.window().then(async (win) => {
    const pack = win.game.packs.get("dnd-custom-ai.capacites");
    const rage = (await pack.getDocuments()).find((d) => d.name === "Rage");
    if (rage) await win.game.dndCustomAi.importSystemContent({ notifyIfEmpty: false });
  });
});

describe("Resynchronisation du contenu de référence — importSystemContent()", () => {
  beforeEach(() => {
    cy.loginAsGM();
    waitForAutoImport();
  });

  it("un monde déjà à jour ne déclenche aucune écriture superflue, sur tout le contenu (T-SYNC-001)", () => {
    // Aucune entrée ne doit être signalée modifiée sans changement du JSON.
    cy.window().then(async (win) => {
      const filesByPack = {
        "dnd-custom-ai.classes": "classes.json",
        "dnd-custom-ai.sous-classes": "subclasses.json",
        "dnd-custom-ai.origines": "origins.json",
        "dnd-custom-ai.sorts": "spells.json",
        "dnd-custom-ai.capacites": "features.json",
        "dnd-custom-ai.dons": "feats.json",
        "dnd-custom-ai.langues": "languages.json",
        "dnd-custom-ai.adversaires": "npcs.json"
      };
      const staleCounts = {};
      for (const [packId, file] of Object.entries(filesByPack)) {
        const pack = win.game.packs.get(packId);
        const data = await win.fetch(`systems/dnd-custom-ai/world-items/${file}`).then((r) => r.json());
        const byName = new Map((await pack.getDocuments()).map((doc) => [doc.name, doc]));
        const stale = data.filter((entry) => {
          const existing = byName.get(entry.name);
          if (!existing) return false;
          const merged = win.foundry.utils.mergeObject(existing.toObject().system ?? {}, entry.system, { inplace: false });
          return !win.foundry.utils.equals(merged, existing.toObject().system ?? {});
        });
        if (stale.length) staleCounts[packId] = stale.map((e) => e.name);
      }
      expect(staleCounts, `entrées à tort jugées obsolètes : ${JSON.stringify(staleCounts)}`).to.deep.equal({});
    });
  });

  it("range les objets régionaux et historiques par région, invisibles des joueurs (T-SYNC-004)", () => {
    cy.window().should((win) => {
      const localize = (key) => win.game.i18n.localize(key);
      const player = win.game.users.find((user) => !user.isGM);
      const expected = [
        ["La Lame des Bannières", "DND_CUSTOM.Folders.Historical"],
        ["Épée de serment", "DND_CUSTOM.Folders.Regional"]
      ];
      for (const [name, folderKey] of expected) {
        const item = win.game.items.getName(name);
        expect(item, `${name} importé`).to.exist;
        expect(item.folder?.name, `${name} : sous-dossier de région`).to.equal(localize("DND_CUSTOM.Regions.fleuraine"));
        expect(item.folder?.folder?.name, `${name} : dossier parent`).to.equal(localize(folderKey));
        expect(item.testUserPermission(player, "OBSERVER"), `${name} invisible du joueur`).to.be.false;
      }
    });
  });

  it("écrase une entrée de compendium modifiée à la main pour la remettre au contenu du JSON (T-SYNC-002)", () => {
    let originalDescription;
    cy.window()
      .then(async (win) => {
        const res = await win.fetch("systems/dnd-custom-ai/world-items/features.json");
        const data = await res.json();
        originalDescription = data.find((e) => e.name === "Rage").system.description;

        const pack = win.game.packs.get("dnd-custom-ai.capacites");
        const rage = (await pack.getDocuments()).find((d) => d.name === "Rage");
        // Objet recréé dans la réalité JS de la page.
        await rage.update(win.JSON.parse(win.JSON.stringify({ "system.description": "MUTATED BY T-SYNC-002" })));
      })
      .then(() => cy.window())
      .then(async (win) => {
        const pack = win.game.packs.get("dnd-custom-ai.capacites");
        const mutated = await pack.getDocument((await pack.getDocuments()).find((d) => d.name === "Rage").id);
        expect(mutated.system.description).to.equal("MUTATED BY T-SYNC-002");
      });

    cy.window().then((win) => win.game.dndCustomAi.importSystemContent({ notifyIfEmpty: false }));

    cy.window().then(async (win) => {
      const pack = win.game.packs.get("dnd-custom-ai.capacites");
      const docs = await pack.getDocuments();
      const rage = docs.find((d) => d.name === "Rage");
      expect(rage.system.description, "la description n'a pas été resynchronisée depuis le JSON").to.equal(originalDescription);
      // Un champ non modifié reste intact.
      expect(rage.system.uses.max).to.equal(2);
    });
  });

  it("écrase aussi un Item de référence du monde (arme) modifié à la main (T-SYNC-003)", () => {
    let originalWeight;
    cy.window()
      .then(async (win) => {
        const res = await win.fetch("systems/dnd-custom-ai/world-items/weapons.json");
        const data = await res.json();
        originalWeight = data.find((e) => e.name === "Dague").system.weight;

        const dague = win.game.items.getName("Dague");
        expect(dague, "\"Dague\" introuvable dans les Items du monde").to.exist;
        await dague.update(win.JSON.parse(win.JSON.stringify({ "system.weight": 999 })));
      });

    cy.window().then((win) => win.game.dndCustomAi.importSystemContent({ notifyIfEmpty: false }));

    cy.window().then((win) => {
      const dague = win.game.items.getName("Dague");
      expect(dague.system.weight, "le poids n'a pas été resynchronisé depuis le JSON").to.equal(originalWeight);
    });
  });
});
