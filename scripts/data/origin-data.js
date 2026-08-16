import { ABILITY_KEYS, SKILL_ABILITIES } from "./character-data.js";

const { SchemaField, NumberField, StringField, HTMLField, SetField } = foundry.data.fields;

/** Bonus de caractéristiques accordés par l'Origine (ex. Charisme +2 / Force +1 pour Fleuraine). */
function abilityBonusesSchema() {
  return new SchemaField(
    Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, new NumberField({ required: true, integer: true, initial: 0 })])
    )
  );
}

/** Type d'Item "origin" : une des 6 nations géographiques remplaçant les races classiques
 *  (cf. system.json > documentTypes.Item.origin). Destiné à être rangé dans le compendium
 *  "Origines" (system.json > packs), à la place des données jusqu'ici externalisées dans
 *  scripts/data/origins.json. L'illustration (ITEMS.md > champ "image") réutilise le champ
 *  natif `img` de l'Item, pas de champ dédié. */
export class OriginData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      demonym: new StringField({ required: false, blank: true, initial: "" }),
      language: new StringField({ required: false, blank: true, initial: "" }),
      traits: new StringField({ required: false, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      abilityBonuses: abilityBonusesSchema(),
      skillAdvantages: new SetField(new StringField({ choices: Object.keys(SKILL_ABILITIES) })),
      specialTrait: new SchemaField({
        name: new StringField({ required: false, blank: true, initial: "" }),
        description: new HTMLField({ required: false, blank: true, initial: "" })
      })
    };
  }
}
