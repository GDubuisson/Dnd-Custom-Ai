const { SchemaField, NumberField } = foundry.data.fields;

/** Type d'Actor "vehicle" (véhicule non-vivant : charrette, bateau...) : le minimum pour
 *  servir de contenant d'objets partagé entre joueurs (nom natif, vitesse, PV, capacité de
 *  charge, inventaire). Pas de caractéristiques ni de CA — ce n'est pas une créature (cf.
 *  Actor "npc" pour les montures vivantes). */
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
