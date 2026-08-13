const { DialogV2 } = foundry.applications.api;

/** Crée (une seule fois, si absente) une Macro monde "Attribuer de l'XP" pour que le MJ
 *  puisse ouvrir la boîte de dialogue sans passer par une fiche PNJ (même principe que
 *  ensureOriginsJournal dans origins-journal.js — jamais écrasée si elle existe déjà, pour
 *  ne pas effacer une personnalisation du MJ). */
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

/** Attribue `amount` XP à CHAQUE Actor `character` fourni (pas de répartition/division du
 *  montant entre eux — retour de test : tout personnage ayant participé au combat doit
 *  recevoir le même montant plein, pas une part) et l'ajoute à leur `system.xp` (compteur
 *  interne, jamais affiché au joueur — cf. PROJECT.md > "Système de progression"). Confirmation
 *  postée en chuchotement MJ uniquement, pour ne jamais exposer de chiffre d'XP aux joueurs via
 *  le chat. */
export async function awardXp(amount, actors) {
  const recipients = actors.filter((actor) => actor.type === "character");
  if (!recipients.length || amount <= 0) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoXpAwarded"));
    return;
  }

  for (const actor of recipients) {
    await actor.update({ "system.xp": actor.system.xp + amount });
  }

  const gmIds = game.users.filter((user) => user.isGM).map((user) => user.id);
  await ChatMessage.create({
    content: game.i18n.format("DND_CUSTOM.Chat.XpAwarded", {
      amount,
      names: recipients.map((actor) => actor.name).join(", ")
    }),
    whisper: gmIds
  });
}

/** Boîte de dialogue MJ : montant d'XP + case à cocher par personnage joueur du monde,
 *  toutes cochées par défaut. Utilisée à la fois par le bouton "Distribuer l'XP" d'une fiche
 *  PNJ (montant pré-rempli avec `xpReward`) et par la macro "Attribuer de l'XP" (cf.
 *  ensureAwardXpMacro dans dnd-custom-ai.js). */
export async function openAwardXpDialog({ defaultAmount = 0 } = {}) {
  const characters = game.actors.filter((actor) => actor.type === "character");
  if (!characters.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoCharacters"));
    return;
  }

  // Dialogue générique Foundry (DialogV2), pas nichée dans une fiche du système : mise en
  // page en style inline plutôt que dépendante des classes .form-row/.checkbox-row scopées
  // à .dnd-custom-ai, qui ne s'appliqueraient pas ici.
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
