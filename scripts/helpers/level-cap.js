import { DND_CUSTOM } from "./config.js";
import { levelCapForBrokenStones, xpLimitForLevelCap } from "./rules.js";

const SYSTEM_ID = "dnd-custom-ai";
const DISABLED_SETTING = "levelCapDisabled";

/** Clé du réglage de monde d'un site de pierre, ex. `siteLogne` → `brokenSiteLogne`. */
const brokenStoneSetting = (site) => `broken${site[0].toUpperCase()}${site.slice(1)}`;

/** Réaffiche les fiches de personnage ouvertes (plafond changé). */
function rerenderCharacterSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app.document?.type === "character" && app.rendered) app.render();
  }
}

/** Enregistre les réglages de monde du plafond : un par site de pierre, plus sa désactivation. */
export function registerLevelCapSettings() {
  for (const site of DND_CUSTOM.bestiarySiteHabitats) {
    game.settings.register(SYSTEM_ID, brokenStoneSetting(site), {
      name: `DND_CUSTOM.Settings.BrokenStones.${site}`,
      hint: "DND_CUSTOM.Settings.BrokenStones.Hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: rerenderCharacterSheets
    });
  }
  game.settings.register(SYSTEM_ID, DISABLED_SETTING, {
    name: "DND_CUSTOM.Settings.LevelCapDisabled.Name",
    hint: "DND_CUSTOM.Settings.LevelCapDisabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: rerenderCharacterSheets
  });
}

/** Nombre de pierres brisées, cochées par le MJ dans les réglages du système. */
export function brokenStoneCount() {
  return DND_CUSTOM.bestiarySiteHabitats.filter((site) => game.settings.get(SYSTEM_ID, brokenStoneSetting(site))).length;
}

/** Niveau maximal actuel des personnages (20 si le plafond est désactivé). */
export function currentLevelCap() {
  if (game.settings.get(SYSTEM_ID, DISABLED_SETTING)) return 20;
  return levelCapForBrokenStones(brokenStoneCount());
}

/** Bloque l'XP des personnages au seuil du niveau suivant le plafond, sans jamais baisser un total existant. */
export function registerLevelCapHooks() {
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (actor.type !== "character") return;
    const newXp = changes.system?.xp;
    if (newXp === undefined) return;

    const level = changes.system?.attributes?.level ?? actor.system.attributes.level;
    const limit = Math.max(xpLimitForLevelCap(currentLevelCap(), level), actor.system.xp);
    if (newXp > limit) changes.system.xp = limit;
  });
}
