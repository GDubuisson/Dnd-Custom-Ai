import { CharacterCreationWizard } from "../sheets/character-creation-wizard.js";
import { grantClassContent } from "./class-content.js";

/** Enregistre les hooks du cycle de vie des Actors (tokens, assistant de création, sous-classe). */
export function registerTokenActorHooks() {
  // Token d'un personnage joueur lié à son Actor par défaut.
  Hooks.on("preCreateActor", (actor) => {
    if (actor.type !== "character") return;
    actor.updateSource({ "prototypeToken.actorLink": true });
  });
  
  // Nom et barre de PV toujours affichés sur les tokens.
  Hooks.on("preCreateActor", (actor) => {
    actor.updateSource({
      "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
      "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
      "prototypeToken.bar1.attribute": "attributes.hp"
    });
  });
  
  // Empêche le dialogue natif d'ouvrir la fiche quand l'assistant de création va s'ouvrir.
  Hooks.on("preCreateActor", (actor, data, options, userId) => {
    if (actor.type !== "character") return;
    if (game.user.id !== userId) return;
    if (actor.system.class || actor.system.origin) return;
    options.renderSheet = false;
  });
  
  // Ouvre l'assistant de création pour un nouveau personnage vierge, chez son créateur.
  Hooks.on("createActor", (actor, options, userId) => {
    if (actor.type !== "character") return;
    if (game.user.id !== userId) return;
    if (actor.system.class || actor.system.origin) return;
  
    new CharacterCreationWizard(actor).render(true);
  });
  
  // Octroie les Capacités de sous-classe dès le choix de la sous-classe.
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (game.user.id !== userId) return;
    if (actor.type !== "character") return;
    if (changes.system?.subclass === undefined) return;
  
    await grantClassContent(actor, actor.system.class, actor.system.attributes.level);
  });
}
