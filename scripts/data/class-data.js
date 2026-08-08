const { BooleanField, NumberField, HTMLField } = foundry.data.fields;

/** Type d'Item "class" : une des classes D&D 5e (SRD). Destiné au compendium "Classes"
 *  (system.json > packs), rempli à la main par le MJ. Reprend les mêmes informations que
 *  celles actuellement en dur dans CONFIG.DND_CUSTOM.classHitDice / .spellcastingClasses
 *  (scripts/helpers/config.js) — pas encore relié à la fiche de personnage (le système de
 *  classes n'est pas finalisé, cf. suivi). */
export class ClassData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      hitDie: new NumberField({ required: true, integer: true, min: 4, initial: 8 }),
      spellcaster: new BooleanField({ required: true, initial: false }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
