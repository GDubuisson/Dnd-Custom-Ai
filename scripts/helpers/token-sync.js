const { DialogV2 } = foundry.applications.api;

/** Crée la macro MJ « Resynchroniser un token » si elle n'existe pas encore. */
export async function ensureTokenResyncMacro() {
  if (!game.user.isGM) return;

  const name = game.i18n.localize("DND_CUSTOM.Macros.ResyncToken");
  if (game.macros.getName(name)) return;

  await Macro.create({
    name,
    type: "script",
    scope: "global",
    img: "icons/svg/regen.svg",
    command: "await game.dndCustomAi.resyncControlledToken();"
  });
}

/** Relie le token de personnage sélectionné à sa fiche, en demandant au MJ quels PV garder s'ils divergent. */
export async function resyncControlledToken() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.TokenSync.GmOnly"));
    return;
  }

  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length !== 1) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.TokenSync.SelectOneToken"));
    return;
  }

  const tokenDoc = controlled[0].document;
  if (tokenDoc.actor?.type !== "character") {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.TokenSync.NotACharacter"));
    return;
  }
  if (tokenDoc.actorLink) {
    ui.notifications.info(game.i18n.format("DND_CUSTOM.TokenSync.AlreadyLinked", { name: tokenDoc.name }));
    return;
  }

  const masterActor = game.actors.get(tokenDoc.actorId);
  if (!masterActor) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.TokenSync.NoMasterActor"));
    return;
  }

  const tokenHp = tokenDoc.actor.system.attributes.hp;
  const masterHp = masterActor.system.attributes.hp;

  if (tokenHp.value === masterHp.value) {
    await tokenDoc.update({ actorLink: true });
    ui.notifications.info(game.i18n.format("DND_CUSTOM.TokenSync.Linked", { name: tokenDoc.name }));
    return;
  }

  const choice = await DialogV2.prompt({
    window: { title: game.i18n.localize("DND_CUSTOM.TokenSync.ChooseHpTitle") },
    content: `<div style="display:flex;flex-direction:column;gap:0.4rem;">
      <label class="checkbox-row">
        <input type="radio" name="keepHp" value="token" checked>
        ${game.i18n.format("DND_CUSTOM.TokenSync.KeepTokenHp", { value: tokenHp.value, max: tokenHp.max })}
      </label>
      <label class="checkbox-row">
        <input type="radio" name="keepHp" value="sheet">
        ${game.i18n.format("DND_CUSTOM.TokenSync.KeepSheetHp", { value: masterHp.value, max: masterHp.max })}
      </label>
    </div>`,
    ok: {
      label: game.i18n.localize("DND_CUSTOM.TokenSync.ChooseHpConfirm"),
      callback: (event, button) => button.form.elements.keepHp?.value
    }
  });
  if (!choice) return;

  if (choice === "token") await masterActor.update({ "system.attributes.hp.value": tokenHp.value });
  await tokenDoc.update({ actorLink: true });
  ui.notifications.info(game.i18n.format("DND_CUSTOM.TokenSync.Linked", { name: tokenDoc.name }));
}
