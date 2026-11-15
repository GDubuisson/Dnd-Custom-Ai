import { DND_CUSTOM } from "./config.js";
import { sheetRollFlags } from "./rolls.js";
import { applyDamageToTargets, applyHealToTargets } from "./damage-resolution.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Enregistre les hooks `renderChatMessageHTML` : boutons d'action et style des cartes de jet. */
export function registerChatMessageHooks() {
  // Bouton « Appliquer les dégâts » aux cibles, réservé à l'auteur du jet ou au MJ, utilisable une fois.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "damageRoll")) return;
    const amount = message.rolls?.[0]?.total;
    if (!Number.isFinite(amount)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dnd-apply-damage-btn";
    button.textContent = game.i18n.format("DND_CUSTOM.Chat.ApplyDamage", { amount });

    if (message.getFlag(SYSTEM_ID, "damageApplied")) {
      button.disabled = true;
      button.title = game.i18n.localize("DND_CUSTOM.Chat.DamageAlreadyApplied");
    } else if (message.author?.id !== game.user.id && !game.user.isGM) {
      button.disabled = true;
      button.title = game.i18n.localize("DND_CUSTOM.Chat.ApplyDamageNotAuthor");
    } else {
      button.addEventListener("click", async () => {
        button.disabled = true;
        await applyDamageToTargets(
          amount,
          message.speaker?.actor,
          message.getFlag(SYSTEM_ID, "damageType"),
          Boolean(message.getFlag(SYSTEM_ID, "isSpellDamage")),
          message.getFlag(SYSTEM_ID, "spellName") ?? "",
          Boolean(message.getFlag(SYSTEM_ID, "isMagicalSource"))
        );
        await message.setFlag(SYSTEM_ID, "damageApplied", true);
      });
    }
    html.querySelector(".message-content")?.appendChild(button);
  });

  // Bouton « Appliquer le soin » aux cibles, mêmes restrictions que les dégâts.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "healRoll")) return;
    const amount = message.rolls?.[0]?.total;
    if (!Number.isFinite(amount)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dnd-apply-heal-btn";
    button.textContent = game.i18n.format("DND_CUSTOM.Chat.ApplyHeal", { amount });

    if (message.getFlag(SYSTEM_ID, "healApplied")) {
      button.disabled = true;
      button.title = game.i18n.localize("DND_CUSTOM.Chat.HealAlreadyApplied");
    } else if (message.author?.id !== game.user.id && !game.user.isGM) {
      button.disabled = true;
      button.title = game.i18n.localize("DND_CUSTOM.Chat.ApplyDamageNotAuthor");
    } else {
      button.addEventListener("click", async () => {
        button.disabled = true;
        await applyHealToTargets(amount);
        await message.setFlag(SYSTEM_ID, "healApplied", true);
      });
    }
    html.querySelector(".message-content")?.appendChild(button);
  });

  // Bouton « Appliquer la réduction » des Capacités réduisant les dégâts (appliquée comme un soin).
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "damageReduction")) return;
    const amount = message.rolls?.[0]?.total;
    if (!Number.isFinite(amount)) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dnd-apply-heal-btn";
    button.textContent = game.i18n.format("DND_CUSTOM.Chat.ApplyDamageReduction", { amount });

    if (message.getFlag(SYSTEM_ID, "damageReductionApplied")) {
      button.disabled = true;
      button.title = game.i18n.localize("DND_CUSTOM.Chat.DamageReductionAlreadyApplied");
    } else if (message.author?.id !== game.user.id && !game.user.isGM) {
      button.disabled = true;
      button.title = game.i18n.localize("DND_CUSTOM.Chat.ApplyDamageNotAuthor");
    } else {
      button.addEventListener("click", async () => {
        button.disabled = true;
        await applyHealToTargets(amount);
        await message.setFlag(SYSTEM_ID, "damageReductionApplied", true);
      });
    }
    html.querySelector(".message-content")?.appendChild(button);
  });

  // Don Chanceux : bouton de relance conservant le meilleur total, une fois par jet, si une charge reste.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "luckRoll") || message.getFlag(SYSTEM_ID, "luckApplied")) return;
    // Évite un bouton en double quand le message est rendu à nouveau.
    if (html.querySelector(".dnd-spend-luck-btn")) return;

    const actor = game.actors.get(message.getFlag(SYSTEM_ID, "luckActorId"));
    const luckyFeat = actor?.items.find((item) => item.type === "feature" && item.name === "Chanceux");
    if (!luckyFeat || luckyFeat.system.uses.value <= 0) return;
    if (!actor.isOwner && !game.user.isGM) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dnd-spend-luck-btn";
    button.textContent = game.i18n.format("DND_CUSTOM.Chat.SpendLuck", { remaining: luckyFeat.system.uses.value });
    button.addEventListener("click", async () => {
      button.disabled = true;
      const formula = message.getFlag(SYSTEM_ID, "luckFormula");
      const reroll = new Roll(formula);
      await reroll.evaluate();
      const originalTotal = message.rolls?.[0]?.total ?? -Infinity;
      const kept = Math.max(reroll.total, originalTotal);
      await reroll.toMessage({
        speaker: message.speaker,
        flavor: game.i18n.format("DND_CUSTOM.Chat.LuckyReroll", { name: actor.name, kept }),
        flags: sheetRollFlags()
      });
      await luckyFeat.update({ "system.uses.value": luckyFeat.system.uses.value - 1 });
      await message.setFlag(SYSTEM_ID, "luckApplied", true);
    });
    html.querySelector(".message-content")?.appendChild(button);
  });

  // Chance du Fiélon : bouton ajoutant 1d10 au résultat.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "luckRoll") || message.getFlag(SYSTEM_ID, "fiendLuckApplied")) return;
    if (html.querySelector(".dnd-spend-luck-btn")) return;

    const actor = game.actors.get(message.getFlag(SYSTEM_ID, "luckActorId"));
    const fiendLuckFeat = actor?.items.find((item) => item.type === "feature" && item.name === "Chance du Fiélon");
    if (!fiendLuckFeat || fiendLuckFeat.system.uses.value <= 0) return;
    if (!actor.isOwner && !game.user.isGM) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dnd-spend-luck-btn";
    button.textContent = game.i18n.format("DND_CUSTOM.Chat.SpendFiendLuck", { remaining: fiendLuckFeat.system.uses.value });
    button.addEventListener("click", async () => {
      button.disabled = true;
      const bonus = new Roll("1d10");
      await bonus.evaluate();
      const originalTotal = message.rolls?.[0]?.total ?? 0;
      await bonus.toMessage({
        speaker: message.speaker,
        flavor: game.i18n.format("DND_CUSTOM.Chat.FiendLuckBonus", { name: actor.name, newTotal: originalTotal + bonus.total }),
        flags: sheetRollFlags()
      });
      await fiendLuckFeat.update({ "system.uses.value": fiendLuckFeat.system.uses.value - 1 });
      await message.setFlag(SYSTEM_ID, "fiendLuckApplied", true);
    });
    html.querySelector(".message-content")?.appendChild(button);
  });

  // Indomptable : relance d'une sauvegarde, nouveau résultat conservé.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "savingThrowRoll") || message.getFlag(SYSTEM_ID, "indomitableApplied")) return;
    if (html.querySelector(".dnd-spend-luck-btn")) return;

    const actor = game.actors.get(message.getFlag(SYSTEM_ID, "luckActorId"));
    const indomitableFeat = actor?.items.find((item) => item.type === "feature" && item.name === "Indomptable");
    if (!indomitableFeat || indomitableFeat.system.uses.value <= 0) return;
    if (!actor.isOwner && !game.user.isGM) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dnd-spend-luck-btn";
    button.textContent = game.i18n.format("DND_CUSTOM.Chat.SpendIndomitable", { remaining: indomitableFeat.system.uses.value });
    button.addEventListener("click", async () => {
      button.disabled = true;
      const formula = message.getFlag(SYSTEM_ID, "luckFormula");
      const reroll = new Roll(formula);
      await reroll.evaluate();
      await reroll.toMessage({
        speaker: message.speaker,
        flavor: game.i18n.format("DND_CUSTOM.Chat.IndomitableReroll", { name: actor.name }),
        flags: sheetRollFlags()
      });
      await indomitableFeat.update({ "system.uses.value": indomitableFeat.system.uses.value - 1 });
      await message.setFlag(SYSTEM_ID, "indomitableApplied", true);
    });
    html.querySelector(".message-content")?.appendChild(button);
  });

  // Point d'inspiration : remplace un test de caractéristique ou de compétence par une relance.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "inspirationEligible")) return;
    if (html.querySelector(".dnd-spend-inspiration-btn")) return;

    const actor = game.actors.get(message.getFlag(SYSTEM_ID, "luckActorId"));
    const remaining = actor?.system?.attributes?.inspirationPoints ?? 0;
    if (remaining <= 0) return;
    if (!actor.isOwner && !game.user.isGM) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dnd-spend-inspiration-btn";
    button.textContent = game.i18n.format("DND_CUSTOM.Chat.SpendInspiration", { remaining });
    button.addEventListener("click", async () => {
      button.disabled = true;
      const formula = message.getFlag(SYSTEM_ID, "luckFormula");
      const flavor = message.getFlag(SYSTEM_ID, "checkFlavor") ?? "";
      const speaker = message.speaker;
      await message.delete();
      const reroll = new Roll(formula);
      await reroll.evaluate();
      await reroll.toMessage({
        speaker,
        flavor: game.i18n.format("DND_CUSTOM.Chat.InspirationReroll", { name: actor.name, flavor }),
        flags: sheetRollFlags()
      });
      await actor.update({ "system.attributes.inspirationPoints": remaining - 1 });
    });
    html.querySelector(".message-content")?.appendChild(button);
  });

  // Style « parchemin » des cartes de jet du système (flag posé par `sheetRollFlags()`).
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "sheetRoll")) return;
    html.classList.add("dnd-sheet-roll");

    // Médaillon de l'icône de classe du lanceur.
    const speakerActor = game.actors.get(message.speaker?.actor);
    const classIcon =
      speakerActor?.type === "character" ? DND_CUSTOM.classFlavorIcon[speakerActor.system.class] : null;
    if (classIcon) {
      const icon = document.createElement("i");
      icon.className = `fa-solid ${classIcon} dnd-class-icon`;
      icon.setAttribute("aria-hidden", "true");
      html.querySelector(".message-header")?.prepend(icon);
    }

    // Accent de couleur par type de jet, hors critiques.
    if (!message.getFlag(SYSTEM_ID, "criticalHit") && !message.getFlag(SYSTEM_ID, "criticalFumble")) {
      if (message.getFlag(SYSTEM_ID, "damageRoll")) html.classList.add("dnd-roll-damage");
      else if (message.getFlag(SYSTEM_ID, "healRoll")) html.classList.add("dnd-roll-heal");
      else if (message.getFlag(SYSTEM_ID, "attackRoll")) html.classList.add("dnd-roll-attack");
      else if (message.getFlag(SYSTEM_ID, "savingThrowRoll")) html.classList.add("dnd-roll-save");
    }
  });

  Hooks.on("renderChatMessageHTML", (message, html) => {
    const isCriticalHit = message.getFlag(SYSTEM_ID, "criticalHit");
    const isCriticalFumble = message.getFlag(SYSTEM_ID, "criticalFumble");
    if (!isCriticalHit && !isCriticalFumble) return;

    const diceRoll = html.querySelector(".dice-roll");
    if (!diceRoll) return;
    diceRoll.classList.add(isCriticalHit ? "dnd-critical-hit" : "dnd-critical-fumble");

    const icon = document.createElement("i");
    icon.className = isCriticalHit ? "fa-solid fa-burst dnd-critical-icon" : "fa-solid fa-skull-crossbones dnd-critical-icon";
    icon.setAttribute("aria-hidden", "true");
    html.querySelector(".dice-total")?.prepend(icon);
  });
}
