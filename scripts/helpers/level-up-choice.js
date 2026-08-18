import { openAbilityScoreImprovementDialog } from "./ability-score-improvement.js";

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "dnd-custom-ai";

/** Aux niveaux où une Amélioration de caractéristiques est proposée (SRD 5e, cf.
 *  DND_CUSTOM.abilityScoreImprovementLevels, config.js), le joueur peut choisir à la place un
 *  Don du compendium "Dons" (règle optionnelle SRD 5e, cf. world-items/feats.json).
 *
 *  Boucle entre 3 étapes (choix Amélioration/Don, formulaire Amélioration, liste des Dons) avec
 *  possibilité de revenir en arrière à tout moment (retour de test) — s'arrête dès qu'un choix
 *  est réellement appliqué (renvoie `true`) ou dès que la fenêtre courante est fermée sans
 *  choisir (renvoie `false`, y compris via une validation ratée dans le formulaire Amélioration).
 *  L'appelant (DndCustomActorSheet#onLevelUp/#onResolvePendingAsi) ne décrémente
 *  `system.attributes.pendingAsiChoices` que si cette fonction renvoie `true` — retour de test :
 *  fermer une des fenêtres sans choisir faisait perdre le choix pour toujours, il reste
 *  maintenant dû et sera reproposé à la prochaine montée de niveau (ou via le bouton de
 *  rattrapage manuel de la fiche tant qu'il reste dû). */
export async function offerAbilityScoreOrFeatDialog(actor) {
  let stage = "choice";
  while (stage) {
    if (stage === "choice") {
      const choice = await DialogV2.wait({
        window: { title: game.i18n.localize("DND_CUSTOM.LevelUp.ChoiceTitle") },
        content: `<p>${game.i18n.localize("DND_CUSTOM.LevelUp.ChoiceHelp")}</p>`,
        buttons: [
          { action: "asi", label: game.i18n.localize("DND_CUSTOM.LevelUp.AbilityScoreOption"), default: true },
          { action: "feat", label: game.i18n.localize("DND_CUSTOM.LevelUp.FeatOption") }
        ],
        rejectClose: false
      });
      if (choice === "asi") stage = "asi";
      else if (choice === "feat") stage = "feat";
      else return false;
    } else if (stage === "asi") {
      const result = await openAbilityScoreImprovementDialog(actor);
      if (result === "applied") return true;
      if (result === "back") stage = "choice";
      else return false;
    } else {
      const result = await openFeatChoiceDialog(actor);
      if (result === "applied") return true;
      if (result === "back") stage = "choice";
      else return false;
    }
  }
  return false;
}

/** Liste les Dons du compendium "Dons" (dnd-custom-ai.dons) que `actor` ne possède pas encore
 *  (par nom, même convention de dédoublonnage que grantClassContent, class-content.js) et
 *  laisse le joueur en choisir un, avec sa description complète affichée pour décider en
 *  connaissance de cause (pas qu'un simple nom dans une liste déroulante). Renvoie `"applied"`/
 *  `"back"`/`null`, même convention que openAbilityScoreImprovementDialog ci-dessus. */
async function openFeatChoiceDialog(actor) {
  const pack = game.packs.get(`${SYSTEM_ID}.dons`);
  const feats = pack ? await pack.getDocuments() : [];
  const ownedNames = new Set(actor.items.contents.map((item) => item.name));
  const available = feats.filter((feat) => !ownedNames.has(feat.name));

  if (!available.length) {
    ui.notifications.warn(
      game.i18n.localize(feats.length ? "DND_CUSTOM.LevelUp.AllFeatsOwned" : "DND_CUSTOM.Wizard.ClassContentMissing")
    );
    return null;
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

  return DialogV2.wait({
    window: { title: game.i18n.localize("DND_CUSTOM.LevelUp.FeatDialogTitle") },
    content: `<div style="display:flex;flex-direction:column;gap:0.6rem;max-height:60vh;overflow-y:auto;">${rows}</div>`,
    rejectClose: false,
    buttons: [
      {
        action: "back",
        label: game.i18n.localize("DND_CUSTOM.LevelUp.Back"),
        callback: () => "back"
      },
      {
        action: "ok",
        label: game.i18n.localize("DND_CUSTOM.LevelUp.FeatConfirm"),
        default: true,
        callback: async (event, button) => {
          const featId = button.form.elements.featId?.value;
          const chosen = available.find((feat) => feat.id === featId);
          if (!chosen) return null;

          await actor.createEmbeddedDocuments("Item", [chosen.toObject()]);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: game.i18n.format("DND_CUSTOM.Chat.FeatGranted", { name: actor.name, feat: chosen.name })
          });
          return "applied";
        }
      }
    ]
  });
}
