const { SchemaField, NumberField } = foundry.data.fields;

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
      carryCapacity: new NumberField({ required: true, min: 0, initial: 0 })
    };
  }
}
