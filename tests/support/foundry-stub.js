/** Stub minimal de l'API Foundry pour importer les modules du système dans Node (sans validation de schéma). */
import { LOCALES, formatString } from "./i18n.js";

class StubField {
  constructor(options = {}) {
    this.options = options;
  }
}

globalThis.foundry ??= {};
globalThis.foundry.abstract ??= {};
globalThis.foundry.abstract.TypeDataModel ??= class TypeDataModel {}; // NOSONAR : bouchon de classe de base, vide exprès
globalThis.foundry.data ??= {};
globalThis.foundry.data.fields ??= {
  SchemaField: StubField,
  NumberField: StubField,
  StringField: StubField,
  BooleanField: StubField,
  HTMLField: StubField,
  SetField: StubField
};
globalThis.foundry.utils ??= {
  mergeObject: (target, source) => ({ ...target, ...source })
};

/** Pose `globalThis.game` avec des valeurs par défaut, écrasées par `overrides` ; à appeler dans chaque test. */
export function setGameStub(overrides = {}) {
  globalThis.game = {
    // Traductions réelles de lang/fr.json.
    i18n: {
      lang: "fr",
      localize: (key) => LOCALES.fr[key] ?? key,
      format: (key, data = {}) => formatString(LOCALES.fr[key] ?? key, data)
    },
    user: { isGM: true, id: "test-user" },
    items: { filter: () => [], getName: () => null, contents: [] },
    packs: { get: () => undefined },
    dndCustomAi: {},
    ...overrides
  };
  return globalThis.game;
}

/** Stubs vides de ui.notifications. */
globalThis.ui ??= { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
