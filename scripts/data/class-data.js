import { DND_CUSTOM } from "../helpers/config.js";

const { HTMLField, SetField, StringField, NumberField } = foundry.data.fields;

/** Données d'une Classe ou Sous-classe : description et faits de référence, informatifs seulement. */
export class ClassData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // Clé de classe stable (cf. DND_CUSTOM.classes), aussi portée par les sous-classes ; vide si homebrew.
      classKey: new StringField({ required: false, blank: true, initial: "", choices: Object.keys(DND_CUSTOM.classes) }),
      // Clé de sous-classe stable (ex. "champion"), vide pour une classe.
      subclassKey: new StringField({ required: false, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      savingThrows: new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.abilities) })),
      skillChoiceCount: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      weaponProficiencies: new SetField(new StringField({ choices: Object.keys(DND_CUSTOM.weaponTypes) }))
    };
  }
}
