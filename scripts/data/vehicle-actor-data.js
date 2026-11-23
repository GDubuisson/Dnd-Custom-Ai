import { DND_CUSTOM } from "../helpers/config.js";

const { SchemaField, NumberField, StringField } = foundry.data.fields;

/** Données d'un véhicule : contenant d'objets partagé (vitesse, PV, capacité de charge). */
export class VehicleActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      attributes: new SchemaField({
        hp: new SchemaField({
          value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
        }),
        speed: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),
      carryCapacity: new NumberField({ required: true, min: 0, initial: 0 }),
      // Prix, attelage et contexte, en texte brut.
      description: new StringField({ required: false, blank: true, initial: "" })
    };
  }
}

/** Charge d'une ancienne particularité de monture (« Capacité de charge : 217 kg »). */
const LEGACY_CAPACITY = /\s*Capacité de charge : ([\d\s]+(?:[.,]\d+)?) kg[.;]?/;

/**
 * Données d'une monture : celles d'un véhicule, plus la taille (comparée par le don Combat monté).
 * Les anciennes montures au profil de créature (particularité, CA) sont converties à la lecture.
 */
export class MountActorData extends VehicleActorData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      size: new StringField({ required: true, initial: "g", choices: Object.keys(DND_CUSTOM.sizes) })
    };
  }

  /**
   * Chaque champ est relu tant qu'il n'est pas stocké : une mise à jour n'envoie que les écarts,
   * une valeur seulement convertie en mémoire peut donc ne jamais être persistée.
   * @override
   */
  static migrateData(source) {
    const legacy = source.particularity;
    if (typeof legacy !== "string" || !legacy) return super.migrateData(source);
    const capacity = legacy.match(LEGACY_CAPACITY);
    if (capacity && source.carryCapacity === undefined) {
      source.carryCapacity = Number(capacity[1].replaceAll(/\s/g, "").replace(",", "."));
    }
    if (!source.description) {
      const armorClass = source.attributes?.ac?.value;
      const text = legacy.replace(LEGACY_CAPACITY, "").trim();
      source.description = armorClass ? `${text} Classe d'armure ${armorClass}.` : text;
    }
    return super.migrateData(source);
  }
}
