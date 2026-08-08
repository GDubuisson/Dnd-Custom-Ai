const { SchemaField, NumberField } = foundry.data.fields;

/** Sous-schéma monnaie (PC/PA/PO/PP), réutilisé par la monnaie de l'Actor et par le prix
 *  de tout Item vendable (arme, armure, objet, outil, moyen de transport). */
export function currencySchema() {
  return new SchemaField({
    pc: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    pa: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    po: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    pp: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
  });
}
