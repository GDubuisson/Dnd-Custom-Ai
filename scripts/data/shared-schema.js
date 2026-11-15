import { DND_CUSTOM } from "../helpers/config.js";

const { SchemaField, NumberField, SetField, StringField } = foundry.data.fields;

/** Construit `{ [key]: fieldFactory(key) }` pour un SchemaField à colonnes homogènes. */
export function schemaFromKeys(keys, fieldFactory) {
  return Object.fromEntries(keys.map((key) => [key, fieldFactory(key)]));
}

/** Sous-schéma monnaie (PC/PA/PO/PP) des Actors et des prix d'Items. */
export function currencySchema() {
  return new SchemaField({
    pc: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    pa: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    po: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    pp: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
  });
}

/** Résistances, immunités et vulnérabilités aux 13 types de dégâts SRD. */
export function damageAffinitySchema() {
  const damageTypeSet = () => new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.damageTypes) }));
  return {
    damageResistances: damageTypeSet(),
    damageImmunities: damageTypeSet(),
    damageVulnerabilities: damageTypeSet()
  };
}
