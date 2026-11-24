const { DialogV2 } = foundry.applications.api;

/** Crée la macro monde « Attribuer de l'XP » si elle n'existe pas encore. */
export async function ensureAwardXpMacro() {
  if (!game.user.isGM) return;

  const name = game.i18n.localize("DND_CUSTOM.Actions.AwardXp");
  if (game.macros.getName(name)) return;

  await Macro.create({
    name,
    type: "script",
    scope: "global",
    img: "icons/svg/upgrade.svg",
    command: "game.dndCustomAi.openAwardXpDialog();"
  });
}

/**
 * Attribue le montant complet d'XP à chaque personnage et le confirme au MJ seul.
 * @param {number} amount
 * @param {Actor[]} actors
 */
export async function awardXp(amount, actors) {
  const recipients = actors.filter((actor) => actor.type === "character");
  if (!recipients.length || amount <= 0) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoXpAwarded"));
    return;
  }

  // Personnages dont l'XP a buté sur le plafond des pierres brisées (cf. level-cap.js).
  const capped = [];
  for (const actor of recipients) {
    const target = actor.system.xp + amount;
    await actor.update({ "system.xp": target }); // NOSONAR : séquentiel voulu
    if (actor.system.xp < target) capped.push(actor.name);
  }

  const gmIds = game.users.filter((user) => user.isGM).map((user) => user.id);
  let content = game.i18n.format("DND_CUSTOM.Chat.XpAwarded", {
    amount,
    names: recipients.map((actor) => actor.name).join(", ")
  });
  if (capped.length) content += ` ${game.i18n.format("DND_CUSTOM.Chat.XpBlockedByCap", { names: capped.join(", ") })}`;
  await ChatMessage.create({ content, whisper: gmIds });
}

/** Ouvre le dialogue MJ d'attribution d'XP (montant + personnages cochés). */
export async function openAwardXpDialog({ defaultAmount = 0 } = {}) {
  const characters = game.actors.filter((actor) => actor.type === "character");
  if (!characters.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoCharacters"));
    return;
  }

  // Styles inline : le dialogue est hors du conteneur .dnd-custom-ai.
  const rows = characters
    .map(
      (actor) =>
        `<label style="display:flex;align-items:center;gap:0.4rem;margin:0.2rem 0;">
          <input type="checkbox" name="actor" value="${actor.id}" checked> ${actor.name}
        </label>`
    )
    .join("");

  const content = `
    <div style="display:flex;flex-direction:column;gap:0.6rem;">
      <label style="display:flex;flex-direction:column;gap:0.2rem;">
        ${game.i18n.localize("DND_CUSTOM.Chat.XpAmount")}
        <input type="number" name="amount" value="${defaultAmount}" min="0">
      </label>
      <div>${rows}</div>
    </div>
  `;

  await DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.Actions.AwardXp") },
    content,
    ok: {
      label: game.i18n.localize("DND_CUSTOM.Actions.AwardXp"),
      callback: async (event, button) => {
        const form = button.form;
        const amount = Number(form.elements.amount.value) || 0;
        const selectedIds = Array.from(form.querySelectorAll('input[name="actor"]:checked')).map((el) => el.value);
        await awardXp(
          amount,
          selectedIds.map((id) => game.actors.get(id)).filter(Boolean)
        );
      }
    }
  });
}
