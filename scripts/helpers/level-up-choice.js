import { openAbilityScoreImprovementDialog } from "./ability-score-improvement.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

/** Aux niveaux où une Amélioration de caractéristiques est proposée (SRD 5e, cf.
 *  DND_CUSTOM.abilityScoreImprovementLevels, config.js), le joueur peut choisir à la place un
 *  Don du compendium "Dons" (règle optionnelle SRD 5e, cf. world-items/feats.json) — jusqu'ici
 *  cette alternative n'était accessible qu'en glissant manuellement un Don depuis le compendium,
 *  sans jamais être proposée au moment de la montée de niveau (retour de test). Ouverte par
 *  DndCustomActorSheet#onLevelUp à la place de l'appel direct à
 *  openAbilityScoreImprovementDialog ; celle-ci reste inchangée et réutilisée telle quelle si
 *  le joueur choisit l'Amélioration de caractéristiques. Fermer la fenêtre sans choisir
 *  n'applique rien (comme avant, si le joueur ferme la boîte de dialogue AMC directement). */
export async function offerAbilityScoreOrFeatDialog(actor) {
  const choice = await DialogV2.wait({
    window: { title: game.i18n.localize("DND_CUSTOM.LevelUp.ChoiceTitle") },
    content: `<p>${game.i18n.localize("DND_CUSTOM.LevelUp.ChoiceHelp")}</p>`,
    buttons: [
      { action: "asi", label: game.i18n.localize("DND_CUSTOM.LevelUp.AbilityScoreOption"), default: true },
      { action: "feat", label: game.i18n.localize("DND_CUSTOM.LevelUp.FeatOption") }
    ],
    rejectClose: false
  });

  if (choice === "feat") await openFeatChoiceDialog(actor);
  else if (choice === "asi") await openAbilityScoreImprovementDialog(actor);
}

/** Liste les Dons du compendium "Dons" (dnd-custom-ai.dons) que `actor` ne possède pas encore
 *  (par nom, même convention de dédoublonnage que grantClassContent, class-content.js) et
 *  laisse le joueur en choisir un, avec sa description complète affichée pour décider en
 *  connaissance de cause (pas qu'un simple nom dans une liste déroulante). */
async function openFeatChoiceDialog(actor) {
  const pack = game.packs.get(`${SYSTEM_ID}.dons`);
  const feats = pack ? await pack.getDocuments() : [];
  const ownedNames = new Set(actor.items.contents.map((item) => item.name));
  const available = feats.filter((feat) => !ownedNames.has(feat.name));

  if (!available.length) {
    ui.notifications.warn(
      game.i18n.localize(feats.length ? "DND_CUSTOM.LevelUp.AllFeatsOwned" : "DND_CUSTOM.Wizard.ClassContentMissing")
    );
    return;
  }

  const rows = available
    .map(
      (feat, index) => `
        <label class="checkbox-row" style="align-items:flex-start;gap:0.5rem;">
          <input type="radio" name="featId" value="${feat.id}" ${index === 0 ? "checked" : ""}>
          <span><strong>${feat.name}</strong><br>${feat.system.description}</span>
        </label>`
    )
    .join("");

  const featId = await DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.LevelUp.FeatDialogTitle") },
    content: `<div style="display:flex;flex-direction:column;gap:0.6rem;max-height:60vh;overflow-y:auto;">${rows}</div>`,
    ok: {
      label: game.i18n.localize("DND_CUSTOM.LevelUp.FeatConfirm"),
      callback: (event, button) => button.form.elements.featId?.value
    }
  });

  const chosen = available.find((feat) => feat.id === featId);
  if (!chosen) return;

  await actor.createEmbeddedDocuments("Item", [chosen.toObject()]);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: game.i18n.format("DND_CUSTOM.Chat.FeatGranted", { name: actor.name, feat: chosen.name })
  });
}
