/** Stub minimal de l'API Foundry VTT, juste assez pour pouvoir `import` les modules du système
 *  (scripts/data/*.js, scripts/helpers/*.js) dans Node sans navigateur/monde Foundry réel.
 *
 *  Ne cherche PAS à reproduire fidèlement `foundry.abstract.TypeDataModel`/`foundry.data.fields`
 *  (validation de schéma, etc.) : les classes `class X extends foundry.abstract.TypeDataModel`
 *  n'exécutent `defineSchema()` qu'au moment où Foundry construit réellement un Document, jamais
 *  au chargement du module — donc `foundry.abstract.TypeDataModel` n'a besoin d'être qu'une
 *  classe valide à hériter, et les *Field n'ont besoin d'être que des classes constructibles.
 *  Les tests appellent directement les méthodes qui nous intéressent (ex.
 *  `CharacterData.prototype.prepareDerivedData.call(fixture)`) sur des objets bruts construits
 *  à la main, sans jamais passer par le vrai pipeline DataModel/Document de Foundry. */
import { LOCALES, formatString } from "./i18n.js";

class StubField {
  constructor(options = {}) {
    this.options = options;
  }
}

globalThis.foundry ??= {};
globalThis.foundry.abstract ??= {};
globalThis.foundry.abstract.TypeDataModel ??= class TypeDataModel {};
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

/** Pose `globalThis.game` avec des valeurs par défaut raisonnables, écrasées par `overrides`
 *  (ex. `{ dndCustomAi: { origins: {...}, spellSlotTables: {...} } }`) — à appeler en début de
 *  test (ou d'un hook `beforeEach`) plutôt qu'une fois pour toutes, chaque test ayant
 *  typiquement besoin de ses propres données de classes/origines. */
export function setGameStub(overrides = {}) {
  globalThis.game = {
    // Résolu contre les VRAIS fichiers lang/fr.json (cf. i18n.js) plutôt qu'un simple echo de
    // la clé : plusieurs modules (ex. helpers/class-content.js) comparent le résultat de
    // `localize` à des libellés métier réels ("Barbare", "Magicien"...) lus depuis les données
    // de jeu (world-items/*.json) — un echo brut de la clé i18n ne matcherait jamais rien.
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

/** Fausse implémentation minimale d'un ChatMessage/ui.notifications, pour les modules qui les
 *  référencent en dehors des chemins testés ici (jamais appelés dans nos tests, mais évite un
 *  ReferenceError si un import transitif y touche). */
globalThis.ui ??= { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
