const { HTMLField } = foundry.data.fields;

/** Type d'Item "class" : une des classes D&D 5e (SRD). Destiné au compendium "Classes"
 *  (system.json > packs), rempli à la main par le MJ. Nom + description pour cette phase
 *  (cf. ClaudeFiles/ITEMS.md) — le système de classes n'étant pas finalisé, la fiche de
 *  personnage continue de lire CONFIG.DND_CUSTOM.classHitDice / .spellcastingClasses
 *  (scripts/helpers/config.js). Prochaine itération prévue : indicateur "lanceur de sorts",
 *  dé de vie, caractéristique principale, sauvegardes maîtrisées. */
export class ClassData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
