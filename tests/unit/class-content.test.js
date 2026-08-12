import "../support/foundry-stub.js";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setGameStub } from "../support/foundry-stub.js";
import { WORLD_FEATURES, WORLD_SPELLS, WORLD_LANGUAGES, ORIGINS } from "../support/fixtures.js";
import { grantClassContent, grantLanguages } from "../../scripts/helpers/class-content.js";

/** Enrobe une entrée JSON brute (world-items/*.json) en simili-Item Foundry : seuls `name`,
 *  `type`, `system` et `toObject()` sont lus par class-content.js. */
function asItem(raw) {
  return { name: raw.name, type: raw.type, system: raw.system, toObject: () => ({ ...raw }) };
}

/** Fausse Actor : seuls `items.contents` et `createEmbeddedDocuments` sont lus/appelés par
 *  grantClassContent. `createEmbeddedDocuments` pousse réellement dans `items.contents` pour
 *  pouvoir tester l'idempotence (un deuxième appel ne doit rien ré-octroyer). */
function makeActor({ level = 1, class: classKey = "wizard", subclass = "", maxLevel = 0, owned = [] } = {}) {
  const items = owned.map(asItem);
  return {
    system: { class: classKey, subclass, attributes: { level }, spells: { maxLevel } },
    items: {
      contents: items,
      get: (name) => items.find((item) => item.name === name)
    },
    createEmbeddedDocuments: async (docType, data) => {
      const created = data.map((entry) => asItem(entry));
      items.push(...created);
      return created;
    }
  };
}

/** Fausse compendium collection : `packId` -> tableau d'entrées brutes (cf. world-items/*.json),
 *  exposant `getDocuments()` (async) et `index.size`, seule API utilisée par class-content.js. */
function makePacks(byPackId) {
  return {
    get: (packId) => {
      const entries = byPackId[packId];
      if (!entries) return undefined;
      return {
        index: { size: entries.length },
        getDocuments: async () => entries.map(asItem)
      };
    }
  };
}

const warnings = [];

beforeEach(() => {
  warnings.length = 0;
  setGameStub({
    items: { filter: () => [] }, // aucun Item du monde dans ces tests : tout vient des "compendiums"
    packs: makePacks({
      "dnd-custom-ai.capacites": WORLD_FEATURES,
      "dnd-custom-ai.sorts": WORLD_SPELLS
    })
  });
  globalThis.ui = { notifications: { warn: (msg) => warnings.push(msg) } };
});

describe("grantClassContent — Capacités", () => {
  test("classe vide -> ne fait rien, renvoie []", async () => {
    const actor = makeActor({ class: "" });
    const granted = await grantClassContent(actor, "", 1);
    assert.deepEqual(granted, []);
  });

  test("Barbare niveau 1 : reçoit les Capacités de niveau 1 (Rage, Défense sans armure)", async () => {
    const actor = makeActor({ class: "barbarian", level: 1 });
    const granted = await grantClassContent(actor, "barbarian", 1);
    assert.ok(granted.includes("Rage"), `attendu "Rage" dans ${JSON.stringify(granted)}`);
    assert.ok(granted.includes("Défense sans armure (Barbare)"));
  });

  test("Barde niveau 1 : ne reçoit PAS 'Aptitudes multiples' (niveau 2)", async () => {
    const actor = makeActor({ class: "bard", level: 1 });
    const granted = await grantClassContent(actor, "bard", 1);
    assert.ok(!granted.includes("Aptitudes multiples"));
  });

  test("Barde niveau 2 : reçoit 'Aptitudes multiples' en plus des Capacités de niveau 1", async () => {
    const actor = makeActor({ class: "bard", level: 2 });
    const granted = await grantClassContent(actor, "bard", 2);
    assert.ok(granted.includes("Aptitudes multiples"));
  });

  test("Clerc et Druide niveau 1 : reçoivent chacun leur propre 'Incantation rituelle (<classe>)'", async () => {
    const cleric = makeActor({ class: "cleric", level: 1 });
    const clericGranted = await grantClassContent(cleric, "cleric", 1);
    assert.ok(clericGranted.includes("Incantation rituelle (Clerc)"));
    assert.ok(!clericGranted.includes("Incantation rituelle (Druide)"));

    const druid = makeActor({ class: "druid", level: 1 });
    const druidGranted = await grantClassContent(druid, "druid", 1);
    assert.ok(druidGranted.includes("Incantation rituelle (Druide)"));
    assert.ok(!druidGranted.includes("Incantation rituelle (Clerc)"));
  });

  test("Capacité déjà possédée par nom -> pas re-octroyée (idempotence)", async () => {
    const rage = WORLD_FEATURES.find((feature) => feature.name === "Rage");
    const actor = makeActor({ class: "barbarian", level: 1, owned: [rage] });
    const granted = await grantClassContent(actor, "barbarian", 1);
    assert.ok(!granted.includes("Rage"));
  });

  test("un deuxième appel au même niveau n'octroie plus rien de nouveau", async () => {
    const actor = makeActor({ class: "barbarian", level: 1 });
    await grantClassContent(actor, "barbarian", 1);
    const second = await grantClassContent(actor, "barbarian", 1);
    assert.deepEqual(second, []);
  });
});

describe("grantClassContent — Capacités de sous-classe", () => {
  // Jeu de données synthétique (pas WORLD_FEATURES) : une Capacité de classe de base et deux
  // Capacités de sous-classe (Voie du Berserker, niveaux 3 et 6) pour le Barbare, plus une
  // Capacité d'une autre sous-classe (Collège du Savoir, Barde) — teste le mécanisme
  // indépendamment du contenu réel écrit dans world-items/features.json.
  const SUBCLASS_FEATURES = [
    { name: "Rage", type: "feature", system: { class: "Barbare", subclass: "", level: 1 } },
    { name: "Frénésie", type: "feature", system: { class: "Barbare", subclass: "Voie du Berserker", level: 3 } },
    { name: "Rage sans esprit", type: "feature", system: { class: "Barbare", subclass: "Voie du Berserker", level: 6 } },
    { name: "Mots cinglants", type: "feature", system: { class: "Barde", subclass: "Collège du Savoir", level: 3 } }
  ];

  beforeEach(() => {
    setGameStub({
      items: { filter: () => [] },
      packs: makePacks({ "dnd-custom-ai.capacites": SUBCLASS_FEATURES, "dnd-custom-ai.sorts": [] })
    });
    globalThis.ui = { notifications: { warn: () => {} } };
  });

  test("aucune sous-classe choisie -> seule la Capacité de classe de base est octroyée", async () => {
    const actor = makeActor({ class: "barbarian", level: 6, subclass: "" });
    const granted = await grantClassContent(actor, "barbarian", 6);
    assert.ok(granted.includes("Rage"));
    assert.ok(!granted.includes("Frénésie"));
    assert.ok(!granted.includes("Rage sans esprit"));
  });

  test("sous-classe choisie mais niveau pas atteint -> Capacité de sous-classe pas encore octroyée", async () => {
    const actor = makeActor({ class: "barbarian", level: 2, subclass: "berserker" });
    const granted = await grantClassContent(actor, "barbarian", 2);
    assert.ok(!granted.includes("Frénésie"));
  });

  test("sous-classe choisie et niveau atteint -> Capacité de sous-classe octroyée", async () => {
    const actor = makeActor({ class: "barbarian", level: 3, subclass: "berserker" });
    const granted = await grantClassContent(actor, "barbarian", 3);
    assert.ok(granted.includes("Frénésie"));
    assert.ok(!granted.includes("Rage sans esprit")); // niveau 6, hors de portée
  });

  test("montée de niveau ultérieure -> octroie la Capacité de sous-classe de palier supérieur", async () => {
    const actor = makeActor({ class: "barbarian", level: 3, subclass: "berserker" });
    await grantClassContent(actor, "barbarian", 3);
    actor.system.attributes.level = 6;
    const granted = await grantClassContent(actor, "barbarian", 6);
    assert.ok(granted.includes("Rage sans esprit"));
  });

  test("une Capacité d'une autre sous-classe n'est jamais octroyée", async () => {
    const actor = makeActor({ class: "barbarian", level: 6, subclass: "berserker" });
    const granted = await grantClassContent(actor, "barbarian", 6);
    assert.ok(!granted.includes("Mots cinglants"));
  });
});

describe("grantClassContent — Sorts (classes lanceuses uniquement)", () => {
  test("classe non lanceuse -> aucun sort octroyé même si des sorts existent", async () => {
    const actor = makeActor({ class: "fighter", level: 5, maxLevel: 3 });
    const granted = await grantClassContent(actor, "fighter", 5);
    const spellNames = WORLD_SPELLS.map((spell) => spell.name);
    assert.ok(granted.every((name) => !spellNames.includes(name)));
  });

  test("magicien niveau 1 (maxLevel=1) : reçoit ses tours de magie + sorts de niveau 1, pas de niveau 2+", () => {
    return grantClassContent(makeActor({ class: "wizard", level: 1, maxLevel: 1 }), "wizard", 1).then((granted) => {
      assert.ok(granted.includes("Trait de feu")); // tour de magie Magicien
      assert.ok(granted.includes("Projectile magique")); // niveau 1 Magicien
      assert.ok(!granted.includes("Boule de feu")); // niveau 3, hors de portée
    });
  });

  test("magicien niveau 5 (maxLevel=3) : reçoit aussi les sorts de niveau 2-3", async () => {
    const actor = makeActor({ class: "wizard", level: 5, maxLevel: 3 });
    const granted = await grantClassContent(actor, "wizard", 5);
    assert.ok(granted.includes("Boule de feu")); // niveau 3
    assert.ok(granted.includes("Rayon ardent")); // niveau 2
  });

  test("un sort ne listant pas la classe du personnage n'est jamais octroyé", async () => {
    // "Flamme sacrée" (tour de magie) est réservé au Clerc, cf. world-items/spells.json.
    const actor = makeActor({ class: "wizard", level: 1, maxLevel: 1 });
    const granted = await grantClassContent(actor, "wizard", 1);
    assert.ok(!granted.includes("Flamme sacrée"));
  });

  test("Occultiste : reçoit son tour de magie de classe (Décharge occulte)", async () => {
    const actor = makeActor({ class: "warlock", level: 1, maxLevel: 1 });
    const granted = await grantClassContent(actor, "warlock", 1);
    assert.ok(granted.includes("Décharge occulte"));
  });
});

describe("grantClassContent — avertissement compendium vide", () => {
  test("compendium Capacités vide -> avertit", async () => {
    setGameStub({ items: { filter: () => [] }, packs: makePacks({ "dnd-custom-ai.capacites": [], "dnd-custom-ai.sorts": WORLD_SPELLS }) });
    globalThis.ui = { notifications: { warn: (msg) => warnings.push(msg) } };
    const actor = makeActor({ class: "monk", level: 3 }); // Moine : aucune Capacité de niveau <=3 dans le jeu de données de test ici, non lanceur
    await grantClassContent(actor, "monk", 3);
    assert.equal(warnings.length, 1);
  });

  test("compendium peuplé mais rien de nouveau à ce niveau précis -> pas d'avertissement", async () => {
    // Barbare niveau 1 a déjà tout reçu ; relancer au même niveau ne doit pas avertir (cf. test
    // d'idempotence ci-dessus) même si granted.length === 0, puisque le compendium n'est pas vide.
    const actor = makeActor({ class: "barbarian", level: 1 });
    await grantClassContent(actor, "barbarian", 1);
    await grantClassContent(actor, "barbarian", 1);
    assert.equal(warnings.length, 0);
  });
});

describe("grantLanguages", () => {
  beforeEach(() => {
    warnings.length = 0;
    setGameStub({
      items: { filter: () => [] },
      packs: makePacks({ "dnd-custom-ai.langues": WORLD_LANGUAGES }),
      dndCustomAi: { origins: ORIGINS }
    });
    globalThis.ui = { notifications: { warn: (msg) => warnings.push(msg) } };
  });

  test("Origine renseignée : reçoit Commune + la langue d'Origine exacte (scripts/data/origins.json > language)", async () => {
    const actor = makeActor({ class: "" });
    const granted = await grantLanguages(actor, "fleuraine");
    assert.deepEqual(new Set(granted), new Set(["Commune", "Fleurain"]));
  });

  test("chaque Origine octroie une langue qui existe réellement dans world-items/languages.json", async () => {
    for (const key of Object.keys(ORIGINS)) {
      const actor = makeActor({ class: "" });
      const granted = await grantLanguages(actor, key);
      assert.ok(granted.includes("Commune"), `Origine ${key} : Commune non octroyée`);
      assert.ok(granted.includes(ORIGINS[key].language), `Origine ${key} : langue "${ORIGINS[key].language}" non octroyée (${JSON.stringify(granted)})`);
    }
  });

  test("Origine vide : reçoit uniquement Commune", async () => {
    const actor = makeActor({ class: "" });
    const granted = await grantLanguages(actor, "");
    assert.deepEqual(granted, ["Commune"]);
  });

  test("les langues spéciales (catégorie 'special') ne sont jamais octroyées automatiquement", async () => {
    const actor = makeActor({ class: "" });
    const granted = await grantLanguages(actor, "fleuraine");
    const specialNames = WORLD_LANGUAGES.filter((lang) => lang.system.category === "special").map((lang) => lang.name);
    for (const name of specialNames) assert.ok(!granted.includes(name), `"${name}" (spéciale) n'aurait pas dû être octroyée`);
  });

  test("langue déjà possédée par nom -> pas re-octroyée (idempotence)", async () => {
    const commune = WORLD_LANGUAGES.find((lang) => lang.name === "Commune");
    const actor = makeActor({ class: "", owned: [commune] });
    const granted = await grantLanguages(actor, "fleuraine");
    assert.ok(!granted.includes("Commune"));
    assert.ok(granted.includes("Fleurain"));
  });

  test("un deuxième appel n'octroie plus rien de nouveau", async () => {
    const actor = makeActor({ class: "" });
    await grantLanguages(actor, "fleuraine");
    const second = await grantLanguages(actor, "fleuraine");
    assert.deepEqual(second, []);
  });

  test("compendium Langues vide -> avertit", async () => {
    setGameStub({ items: { filter: () => [] }, packs: makePacks({ "dnd-custom-ai.langues": [] }), dndCustomAi: { origins: ORIGINS } });
    globalThis.ui = { notifications: { warn: (msg) => warnings.push(msg) } };
    const actor = makeActor({ class: "" });
    await grantLanguages(actor, "fleuraine");
    assert.equal(warnings.length, 1);
  });
});
