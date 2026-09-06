import { DND_CUSTOM } from "./config.js";
import { radioListDialogContent } from "./dialog-content.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

/** Au niveau où le personnage obtient sa sous-classe (SRD 5e, cf. DND_CUSTOM.subclassLevel,
 *  config.js), propose une petite fenêtre de choix parmi les sous-classes de sa classe (une
 *  seule par classe pour l'instant, cf. DND_CUSTOM.subclasses) avec leur description complète
 *  (compendium "Sous-classes") — jusqu'ici seul le sélecteur permanent de l'en-tête de la fiche
 *  (character-sheet.hbs) permettait ce choix, sans jamais être proposé au moment précis de la
 *  montée de niveau (même lacune que pour le choix Don, cf. level-up-choice.js). N'affiche rien
 *  si le personnage a déjà choisi (verrouillé, cf. hook preUpdateActor, dnd-custom-ai.js), si
 *  sa classe n'a pas de sous-classe modélisée, ou si le niveau requis n'est pas encore atteint.
 *  Le sélecteur d'en-tête reste disponible en secours (ex. fenêtre fermée sans choisir) — même
 *  update `system.subclass`, donc même octroi automatique des Capacités de sous-classe à la clé
 *  (hook updateActor, dnd-custom-ai.js) qu'on passe par l'un ou l'autre chemin. */
export async function offerSubclassChoiceDialog(actor, classKey, level) {
  if (actor.system.subclass) return;
  const subclassChoices = DND_CUSTOM.subclasses[classKey];
  const requiredLevel = DND_CUSTOM.subclassLevel[classKey];
  if (!subclassChoices || requiredLevel === undefined || level < requiredLevel) return;

  const pack = game.packs.get(`${SYSTEM_ID}.sous-classes`);
  const subclassItems = pack ? await pack.getDocuments() : [];

  const options = Object.entries(subclassChoices).map(([key, labelKey]) => {
    const label = game.i18n.localize(labelKey);
    return {
      value: key,
      label,
      description: subclassItems.find((candidate) => candidate.name === label)?.system.description ?? ""
    };
  });

  const chosenKey = await DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.LevelUp.SubclassDialogTitle") },
    content: radioListDialogContent(options, "subclassKey"),
    ok: {
      label: game.i18n.localize("DND_CUSTOM.LevelUp.SubclassConfirm"),
      callback: (event, button) => button.form.elements.subclassKey?.value
    }
  });

  if (chosenKey) await actor.update({ "system.subclass": chosenKey });
}
