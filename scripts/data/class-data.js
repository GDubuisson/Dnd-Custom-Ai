import { DND_CUSTOM } from "../helpers/config.js";

const { HTMLField, SetField, StringField, NumberField } = foundry.data.fields;

/** Type d'Item "class" : une des classes D&D 5e (SRD). Destiné au compendium "Classes"
 *  (system.json > packs), rempli à la main par le MJ. Description narrative + faits mécaniques
 *  de référence (sauvegardes maîtrisées, compétences à choisir, maîtrises d'armes) — cf.
 *  ClaudeFiles/ITEMS.md. Volontairement **informatif uniquement** : la fiche de personnage
 *  continue de lire CONFIG.DND_CUSTOM.classSavingThrows / .classSkillChoices /
 *  .classWeaponProficiencies / .classHitDice / .spellcastingClasses (scripts/helpers/config.js),
 *  seule source utilisée par les calculs (même statut que l'Item Origine aujourd'hui, mi-migré
 *  depuis scripts/data/origins.json). Pas de dé de vie ni de bonus de caractéristique de classe
 *  ici (décision de cadrage : le dé de vie reste un détail de calcul interne, et les bonus de
 *  caractéristique restent un privilège des Origines, jamais cumulés avec la classe). Partagé
 *  avec le type "subclass" (cf. dnd-custom-ai.js) : ces champs y restent simplement vides, la
 *  donnée mécanique d'une sous-classe étant bien plus légère (cf. ITEMS.md). */
export class ClassData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      savingThrows: new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.abilities) })),
      skillChoiceCount: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      weaponProficiencies: new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.weaponTypes) }))
    };
  }
}
