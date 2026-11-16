import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bestiaryFolderKeys, fitsSealedWorld } from "../../scripts/helpers/bestiary.js";

const creature = (phase, habitat, creatureType = "beast") => ({
  system: { creatureType },
  flags: { "dnd-custom-ai": { phase, habitat } }
});

describe("bestiaryFolderKeys — dossier du compendium par phase puis milieu", () => {
  test("phase 0, Fleuraine : libellés de phase puis de région", () => {
    assert.deepEqual(bestiaryFolderKeys(creature(0, "fleuraine")), ["DND_CUSTOM.Bestiary.Phases.0", "DND_CUSTOM.Regions.fleuraine"]);
  });

  test("phase 1, site de Logne", () => {
    assert.deepEqual(bestiaryFolderKeys(creature(1, "siteLogne")), [
      "DND_CUSTOM.Bestiary.Phases.1",
      "DND_CUSTOM.Bestiary.Habitats.siteLogne"
    ]);
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

  test("phase 0 au large : monstruosité acceptée (Kraken)", () => {
    assert.equal(fitsSealedWorld(creature(0, "abyss", "monstrosity")), true);
  });

  test("phase 1 et au-delà : tout type accepté", () => {
    assert.equal(fitsSealedWorld(creature(1, "siteLogne", "fey")), true);
    assert.equal(fitsSealedWorld(creature(3, "common", "fiend")), true);
  });
});
