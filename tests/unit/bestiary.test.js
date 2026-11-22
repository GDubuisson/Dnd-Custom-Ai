import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bestiaryFolderKeys, bestiaryFolderLabelKeys, fitsSealedWorld } from "../../scripts/helpers/bestiary.js";

const creature = (phase, habitat, creatureType = "beast") => ({
  system: { creatureType },
  flags: { "dnd-custom-ai": { phase, habitat } }
});

describe("bestiaryFolderKeys — dossier du compendium par phase puis milieu, sites et Ulrich à part", () => {
  test("phase 0, Fleuraine : libellés de phase puis de région", () => {
    assert.deepEqual(bestiaryFolderKeys(creature(0, "fleuraine")), ["DND_CUSTOM.Bestiary.Phases.0", "DND_CUSTOM.Regions.fleuraine"]);
    // Six phases, du monde scellé (0) à l'ancien monde (5).
    assert.deepEqual(bestiaryFolderKeys(creature(5, "common")), ["DND_CUSTOM.Bestiary.Phases.5", "DND_CUSTOM.Bestiary.Habitats.common"]);
  });

  test("site de pierre : le site, puis avant (phase 0) ou après la rupture (phase 1 et au-delà)", () => {
    assert.deepEqual(bestiaryFolderKeys(creature(0, "siteKis")), [
      "DND_CUSTOM.Bestiary.Habitats.siteKis",
      "DND_CUSTOM.Bestiary.Rupture.before"
    ]);
    for (const phase of [1, 2, 3]) {
      assert.deepEqual(bestiaryFolderKeys(creature(phase, "siteLogne")), [
        "DND_CUSTOM.Bestiary.Habitats.siteLogne",
        "DND_CUSTOM.Bestiary.Rupture.after"
      ]);
    }
  });

  test("Ulrich et sa bande : un seul dossier, quelle que soit la phase", () => {
    for (const phase of [0, 1, 3]) {
      assert.deepEqual(bestiaryFolderKeys(creature(phase, "ulrichBand")), ["DND_CUSTOM.Bestiary.Habitats.ulrichBand"]);
    }
  });

  test("libellés de dossiers gérés : phases, milieux, avant/après la rupture", () => {
    const keys = bestiaryFolderLabelKeys();
    for (const key of ["DND_CUSTOM.Bestiary.Phases.3", "DND_CUSTOM.Bestiary.Habitats.siteKis", "DND_CUSTOM.Bestiary.Rupture.after"]) {
      assert.ok(keys.includes(key), key);
    }
  });

  test("sans flags, ou phase/milieu inconnus : aucun dossier", () => {
    assert.deepEqual(bestiaryFolderKeys({ system: {} }), []);
    assert.deepEqual(bestiaryFolderKeys(creature(9, "fleuraine")), []);
    assert.deepEqual(bestiaryFolderKeys(creature(0, "lune")), []);
  });
});

describe("fitsSealedWorld — le surnaturel n'existe qu'au large avant la première pierre", () => {
  test("phase 0 : bête et humanoïde acceptés, monstruosité refusée sur terre", () => {
    assert.equal(fitsSealedWorld(creature(0, "common", "beast")), true);
    assert.equal(fitsSealedWorld(creature(0, "azhar", "humanoid")), true);
    assert.equal(fitsSealedWorld(creature(0, "siteLogne", "monstrosity")), false);
  });

  test("phase 0 à Tirwen : plantes admises (fuite de la pierre), monstruosité toujours refusée", () => {
    assert.equal(fitsSealedWorld(creature(0, "siteTirwen", "plant")), true);
    assert.equal(fitsSealedWorld(creature(0, "siteTirwen", "monstrosity")), false);
    assert.equal(fitsSealedWorld(creature(0, "siteLogne", "plant")), false);
  });

  test("phase 0 au Zahir : morts-vivants admis (le sage fondu avec la pierre et ses invocations), confinés au site", () => {
    assert.equal(fitsSealedWorld(creature(0, "siteZahir", "undead")), true);
    assert.equal(fitsSealedWorld(creature(0, "siteZahir", "plant")), false);
    assert.equal(fitsSealedWorld(creature(0, "common", "undead")), false);
  });

  test("phase 0 à Kis : Kisaeth renaissante admise (monstruosité confinée au site)", () => {
    assert.equal(fitsSealedWorld(creature(0, "siteKis", "monstrosity")), true);
    assert.equal(fitsSealedWorld(creature(0, "common", "monstrosity")), false);
  });

  test("phase 0 au large : monstruosité acceptée (Kraken)", () => {
    assert.equal(fitsSealedWorld(creature(0, "abyss", "monstrosity")), true);
  });

  test("phase 1 et au-delà : tout type accepté", () => {
    assert.equal(fitsSealedWorld(creature(1, "siteLogne", "fey")), true);
    assert.equal(fitsSealedWorld(creature(3, "common", "fiend")), true);
  });
});
