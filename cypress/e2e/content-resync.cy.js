// Resynchronisation du contenu de référence (dette technique "les compendiums ne se remettent
// jamais à jour", cf. ClaudeFiles/ANOMALIES_ACTIVES.md, corrigée le 2026-09-05) :
// `importSystemContent()` (scripts/helpers/content-import.js) ne se contente plus d'ajouter les
// entrées absentes par nom — une entrée déjà présente (Item du monde OU document de compendium)
// dont `img`/`system` diffère du JSON source (`world-items/*.json`) est désormais ÉCRASÉE par ce
// JSON, qui reste l'unique source de vérité pour ce contenu de règles. Décision explicite de
// l'utilisateur : toute modification manuelle d'un Item/Actor de référence est perdue au
// prochain chargement du monde si le JSON source a changé depuis — attendu, pas un bug.
//
// Session MJ uniquement (`importSystemContent` retourne immédiatement pour un non-MJ, cf.
// `if (!game.user.isGM) return;`).
//
// Piège découvert en écrivant ce mécanisme (cf. CONCEPTION_TECHNIQUE.md) : comparer `entry.system`
// (JSON brut, forcément partiel) à `existing.system` (DataModel préparé, valeurs par défaut du
// schéma + données dérivées) faisait remonter QUASIMENT CHAQUE entrée comme "modifiée" à CHAQUE
// appel, JSON identique ou pas — corrigé en fusionnant `entry.system` par-dessus
// `existing.toObject().system` (données brutes stockées) et en ne patchant que si le résultat de
// cette fusion diffère des données déjà stockées. T-SYNC-001 ci-dessous est le garde-fou direct
// contre une régression de ce type (faux positifs systématiques).

// Même stratégie que waitForAdversairesImport (bestiary-adversaires.cy.js) : l'auto-import du
// hook "ready" tourne en arrière-plan sans être attendu par Foundry (Hooks.callAll n'attend pas
// les handlers async) — "adversaires" est le DERNIER fichier de COMPENDIUM_FILES
// (content-import.js), donc son compendium atteignant 15 entrées prouve que tout ce qui le
// précède (armes/armures/objets/outils, classes, sous-classes, origines, sorts, capacités,
// dons, langues) a déjà fini d'importer/resynchroniser. Jamais rappeler importSystemContent()
// manuellement tant que ce n'est pas confirmé : ça créerait une vraie course avec l'appel
// automatique déjà en cours.
function waitForAutoImport() {
  return cy.window({ timeout: 20000 }).should((win) => {
    const pack = win.game.packs.get("dnd-custom-ai.adversaires");
    expect(pack, "compendium 'adversaires' introuvable").to.exist;
    expect(pack.index.size, "import automatique pas encore terminé").to.equal(15);
  });
}

afterEach(() => {
  // Nettoyage best-effort : remet "Rage" et le poids de "Dague" dans l'état attendu même si un
  // test échoue avant sa propre assertion de resynchronisation (ne dépend jamais d'un test
  // précédent pour laisser le monde propre).
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
    // Garde-fou anti-régression direct contre le piège documenté en tête de fichier (comparaison
    // naïve JSON brut vs DataModel préparé -> faux positif systématique) : si ça revenait, CE
    // test échouerait immédiatement (staleCounts non vides) là où une vérification ciblée sur une
    // seule entrée ne l'aurait pas forcément remarqué.
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

  it("écrase une entrée de compendium modifiée à la main pour la remettre au contenu du JSON (T-SYNC-002)", () => {
    let originalDescription;
    cy.window()
      .then(async (win) => {
        const res = await win.fetch("systems/dnd-custom-ai/world-items/features.json");
        const data = await res.json();
        originalDescription = data.find((e) => e.name === "Rage").system.description;

        const pack = win.game.packs.get("dnd-custom-ai.capacites");
        const rage = (await pack.getDocuments()).find((d) => d.name === "Rage");
        // Un littéral construit dans le realm du test runner Cypress (pas celui de la fenêtre
        // AUT) fait échouer la validation de schéma de Foundry ("Item must be constructed with
        // a DataModel or Object") — passer par win.JSON pour reconstruire l'objet dans le bon
        // realm, convention déjà en place ailleurs dans ce dépôt (ex. npc-sheet.cy.js).
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
      // Un champ NON modifié doit rester intact : preuve que la resynchronisation ne fait pas
      // table rase d'une entrée entière au premier écart venu, juste réaffirmer le JSON source.
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
