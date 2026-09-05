import { DND_CUSTOM } from "./config.js";
import { sheetRollFlags } from "./rolls.js";
import { applyDamageToTargets, applyHealToTargets } from "./damage-resolution.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Enregistre tous les hooks `renderChatMessageHTML` du système (boutons d'action sur une carte
 *  de jet, style visuel des jets/critiques) — appelé une seule fois depuis dnd-custom-ai.js, au
 *  même endroit où ces hooks étaient historiquement déclarés en direct. Chaque hook reste
 *  indépendant des autres (filtré par son propre flag de message, jamais par un état posé par un
 *  autre hook de cette liste) : l'ordre d'enregistrement ci-dessous n'a pas d'incidence
 *  fonctionnelle, il reflète simplement l'ordre historique. */
export function registerChatMessageHooks() {
  // Ajoute un bouton "Appliquer les dégâts" sur toute carte de chat de jet de dégâts (cf.
  // rollDamage dans rolls.js) : applique le total du jet aux tokens actuellement ciblés par le
  // client qui clique (game.user.targets), PV temporaires absorbés en premier (SRD 5e).
  // Restreint à l'auteur du jet (ou au MJ, toujours habilité) — retour de test : n'importe quel
  // joueur pouvait cliquer sur le bouton d'un autre. Un joueur ciblant un PNJ qu'il ne possède
  // pas (cas courant) n'a de toute façon pas la permission de le modifier lui-même —
  // requestActorUpdate (damage-resolution.js) relaie alors la mise à jour au MJ actif via socket
  // plutôt que de laisser Actor#update lever une erreur de permission. Marqué "déjà appliqué"
  // (flag persistant sur le message) après un premier clic, pour empêcher toute application
  // répétée du même jet — retour de test, le bouton restait cliquable indéfiniment.
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

  // Ajoute un bouton "Appliquer le soin" sur toute carte de chat de jet de soin de sort (cf.
  // rollHeal dans rolls.js) : applique le total du jet aux tokens actuellement ciblés par le
  // client qui clique (game.user.targets) — même mécanique que "Appliquer les dégâts" ci-dessus
  // (auteur/MJ uniquement, marqué "déjà appliqué" après un premier clic), en PV positifs plutôt
  // que négatifs. Pas de blocage PvP (soigner un autre Joueur est toujours légitime) ni
  // d'absorption de PV temporaires (SRD 5e : les PV temporaires n'interagissent qu'avec les
  // dégâts, jamais avec les soins).
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

  // Ajoute un bouton "Appliquer la réduction" sur toute carte de chat de jet de Capacité qui
  // réduit les dégâts subis (ex. Déviation de projectiles, Flamme protectrice — cf.
  // FeatureData#reducesDamage, item-data.js ; #onRollFeature, actor-sheet.js) : réutilise
  // directement applyHealToTargets (même effet mécanique qu'un soin, ajoute des PV à la cible
  // actuellement ciblée, plafonné au max) — seul le libellé du bouton diffère pour rester clair
  // en jeu, aucune nouvelle logique d'application. Fonctionne quel que soit l'ordre réel des
  // dégâts/de la réaction (le MJ peut cliquer avant ou après avoir appliqué les dégâts bruts, le
  // résultat net est le même).
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

  // Don "Chanceux" (SRD 5e, world-items/feats.json) : ajoute un bouton "Point de Chance" sur tout
  // jet de d20 posté via rollCheck (test de caractéristique/compétence, sauvegarde, attaque — cf.
  // flags luckRoll/luckFormula/luckActorId posés dans rolls.js) SI l'acteur qui a lancé possède le
  // don et lui reste au moins une charge (`system.uses.value` de l'Item "Chanceux") — jamais un
  // bouton grisé permanent sur chaque jet, contrairement à "Appliquer le soin"/"Appliquer les
  // dégâts" ci-dessus qui, eux, s'appliquent toujours : ici, pas de charge restante = pas de
  // bouton du tout, pour ne pas polluer le journal de jets d'un personnage n'ayant pas (ou plus)
  // le don. Relance la MÊME formule que le jet d'origine (die + modificateur, avantage/désavantage
  // compris) et garde le meilleur des deux totaux — la règle SRD laisse le joueur choisir lequel
  // des deux d20 utiliser, mais dépenser un point de chance n'a jamais d'intérêt à choisir le plus
  // bas : simplification sans perte réelle de choix. Poste un second message plutôt que de
  // modifier le premier (Foundry ne permet pas de rejouer proprement l'affichage d'un Roll déjà
  // résolu) et marque l'original `luckApplied` pour ne proposer qu'UNE relance par jet (SRD : "un
  // seul point de chance peut être dépensé par jet").
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "luckRoll") || message.getFlag(SYSTEM_ID, "luckApplied")) return;
    // Garde-fou anti-doublon : Foundry peut re-déclencher ce hook pour un même message déjà rendu
    // (ex. la barre latérale re-rend son journal de chat) — sans ce garde, un second appel
    // ajouterait un second bouton identique au même `.message-content`.
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
      const kept = reroll.total > originalTotal ? reroll.total : originalTotal;
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

  // Capacité "Chance du Fiélon" (sous-classe Occultiste, world-items/features.json) : même famille
  // que le don Chanceux ci-dessus (réutilise les mêmes flags luckRoll/luckActorId posés dans
  // rolls.js, indépendant du don lui-même) mais mécanique différente — SRD : "+1d10 au résultat"
  // plutôt qu'une relance complète. Poste un petit message de complément ("+1d10 = X, nouveau
  // total Y") plutôt que de modifier le message d'origine (même raison que Chanceux : Foundry ne
  // permet pas de rejouer proprement l'affichage d'un Roll déjà résolu). Flag dédié
  // (`fiendLuckApplied`, jamais `luckApplied`) : un personnage qui posséderait les deux (don ET
  // Capacité) pourrait en théorie cumuler les deux sur un même jet, chacun avec sa propre limite
  // d'usage — aucune règle SRD ne l'interdit explicitement.
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

  // Capacité "Indomptable" (Guerrier 9, SRD 5e) : même famille que Chanceux/Chance du Fiélon
  // ci-dessus (flag `luckRoll`/`luckActorId`, ignorant du nom de Capacité), mais réservé aux jets
  // de SAUVEGARDE (flag `savingThrowRoll`, posé uniquement par #onRollSave, cf. rolls.js) et
  // mécanique différente — SRD : relance complète, résultat obligatoirement conservé (contrairement
  // à Chanceux qui garde le meilleur des deux). Ce système ne comparant déjà aucune sauvegarde à un
  // DD (le MJ juge à l'œil), le bouton reste proposé sur CHAQUE jet de sauvegarde éligible, au
  // joueur de décider si le résultat "ne lui convient pas" — même logique que Chanceux.
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

  // Points d'inspiration (PI, règle maison — cf. docstring rollCheck dans helpers/rolls.js) :
  // ajoute un bouton "Utiliser un point d'inspiration" sous tout jet de caractéristique/compétence
  // (flag `inspirationEligible`, posé UNIQUEMENT par #onRollAbility/#onRollSkill dans
  // actor-sheet.js — jamais une sauvegarde ou une attaque) SI l'acteur qui a lancé a au moins 1
  // point (`system.attributes.inspirationPoints`, CharacterData uniquement — un PNJ n'a jamais ce
  // champ, la condition échoue silencieusement). Différence volontaire avec Chanceux/Chance du
  // Fiélon/Indomptable ci-dessus (qui gardent le message d'origine et postent une relance à la
  // suite) : ici, `message.delete()` retire le jet d'origine du chat AVANT de poster le nouveau —
  // demande explicite de l'utilisateur ("le jet précédent disparaît"), un seul jet visible à la
  // fois. Résultat du nouveau jet TOUJOURS conservé (jamais le meilleur des deux, contrairement à
  // Chanceux) : ce n'est plus qu'un jet, l'ancien n'existe plus.
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

  // Effet visuel sur les coups/échecs critiques (cf. flags criticalHit/criticalFumble posés par
  // rollCheck/rollDamage, rolls.js) : retour de test (lot 3, point 8) — le libellé texte déjà
  // présent dans le flavor ("Coup critique !"/"Échec critique !") ne suffisait pas, ajoute une
  // bordure/halo + icône sur la carte de jet (`.dice-roll`) elle-même. Styles définis dans
  // dnd-custom-ai.css HORS du bloc `.dnd-custom-ai` (les messages de chat vivent dans la barre
  // latérale, jamais imbriqués dans la fiche de personnage/PNJ) : jamais la couleur seule pour
  // distinguer les deux cas (icône différente), conformément aux règles RGAA/WCAG.
  // Style "parchemin déchiré" (demande explicite de l'utilisateur, 2026-09-04, cf.
  // maquettes/chat-roll-style/) sur toute carte de jet générée par CE système — jamais un jet
  // tapé à la main (`/r`). Flag posé une seule fois à la source par `sheetRollFlags()`
  // (helpers/rolls.js), sur quasiment tout `Roll#toMessage`/`RollTable#toMessage` du système :
  // jamais deviné ici depuis le speaker (un joueur peut très bien taper /r avec son personnage
  // sélectionné, le speaker seul ne prouve rien). Styles dans dnd-custom-ai.css (`.dnd-sheet-roll`,
  // hors du bloc `.dnd-custom-ai`, même raison que les critiques ci-dessous).
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.getFlag(SYSTEM_ID, "sheetRoll")) return;
    html.classList.add("dnd-sheet-roll");

    // Icône de classe du personnage qui lance, en médaillon (retour visuel demandé par
    // l'utilisateur sur inspiration d'une maquette externe, cf. maquettes/chat-roll-style-stitch/)
    // — réutilise DND_CUSTOM.classFlavorIcon (même donnée que l'en-tête d'ambiance de classe de
    // l'onglet Capacités, class-flavor.hbs), résolue depuis le `speaker` natif du message : aucune
    // modification des ~19 sites Roll#toMessage/RollTable#toMessage nécessaire. Rien pour un PNJ
    // (pas de `system.class`) ni une classe non reconnue.
    const speakerActor = game.actors.get(message.speaker?.actor);
    const classIcon =
      speakerActor?.type === "character" ? DND_CUSTOM.classFlavorIcon[speakerActor.system.class] : null;
    if (classIcon) {
      const icon = document.createElement("i");
      icon.className = `fa-solid ${classIcon} dnd-class-icon`;
      icon.setAttribute("aria-hidden", "true");
      html.querySelector(".message-header")?.prepend(icon);
    }

    // Accent de couleur selon le type de jet (cf. .dnd-roll-attack/-save/-damage/-heal,
    // dnd-custom-ai.css) — jamais cumulé avec le halo de coup/échec critique (déjà géré à part,
    // ci-dessous, et déjà visuellement distinct à lui seul).
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
