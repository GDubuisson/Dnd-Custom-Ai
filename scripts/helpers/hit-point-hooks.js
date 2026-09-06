import { DND_CUSTOM } from "./config.js";
import { SPELL_LEVELS } from "./rules.js";
import { declareDeath } from "./death.js";
import { openAwardXpDialog } from "./xp.js";

/** Hooks PV / mort / XP (`preUpdateActor`/`updateActor`) : pré-remplissage du XP rapporté d'un
 *  PNJ selon son FI, mémorisation des PV avant update, mort et agonie d'un personnage (SRD 5e :
 *  Inconscient à 0 PV, échecs automatiques, réanimation), plafonnement des PV/emplacements de
 *  sorts à leur max après recalcul, mort directe d'un PNJ (statut + Combattant vaincu + dialogue
 *  d'XP), retour automatique à la forme normale d'une Forme sauvage vidée. Extrait de
 *  dnd-custom-ai.js (découpe pré-1.0) — appelé au chargement du module, à la position historique
 *  de ces hooks : le hook `preUpdateActor` qui mémorise `options.dndCustomOldHp` DOIT rester
 *  enregistré avant les `updateActor` qui le lisent (garanti par l'ordre de ce fichier). */
export function registerHitPointHooks() {
  // Pré-remplit le XP rapporté (system.xpReward) selon l'indice de dangerosité, table SRD 5e
  // officielle (cf. DND_CUSTOM.challengeRatingXp) : ne s'applique que si l'indice change SANS
  // que le champ XP lui-même soit modifié dans le même envoi de formulaire, pour laisser le MJ
  // libre de le personnaliser ensuite sans qu'un futur changement de FI ne l'écrase.
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (!["npc", "mount", "wildShapeForm"].includes(actor.type)) return;
    const newChallengeRating = changes.system?.challengeRating;
    if (newChallengeRating === undefined || changes.system?.xpReward !== undefined) return;
  
    const xp = DND_CUSTOM.challengeRatingXp[newChallengeRating];
    if (xp !== undefined) changes.system.xpReward = xp;
  });
  
  // Mémorise les PV avant modification (cf. hooks updateActor ci-dessous, mort/agonie pour un
  // personnage et distribution d'XP pour un PNJ) : preUpdateActor est le seul moment où `actor`
  // reflète encore l'état AVANT l'update.
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (changes.system?.attributes?.hp?.value === undefined) return;
    options.dndCustomOldHp = actor.system.attributes.hp.value;
  });
  
  // Mort et agonie, SRD 5e : tomber à 0 PV rend Inconscient et remet à zéro les jets de
  // sauvegarde de la mort ; subir des dégâts en étant déjà à 0 PV compte comme un échec
  // automatique (3 échecs = mort) ; repasser au-dessus de 0 PV retire Inconscient et
  // réinitialise les compteurs. Ne s'exécute que côté client à l'origine du changement.
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (actor.type !== "character") return;
    if (game.user.id !== userId) return;
    const oldHp = options.dndCustomOldHp;
    if (oldHp === undefined) return;
    const newHp = actor.system.attributes.hp.value;
  
    if (newHp === 0 && oldHp > 0) {
      await actor.update({ "system.attributes.death.successes": 0, "system.attributes.death.failures": 0 });
      if (!actor.statuses.has("unconscious")) await actor.toggleStatusEffect("unconscious", { active: true });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: game.i18n.format("DND_CUSTOM.Chat.FallsUnconscious", { name: actor.name })
      });
    } else if (newHp === 0 && oldHp === 0) {
      const death = actor.system.attributes.death;
      if (death.failures >= 3 || death.successes >= 3) return; // déjà stabilisé ou mort, rien à faire
      const failures = Math.min(3, death.failures + 1);
      await actor.update({ "system.attributes.death.failures": failures });
      if (failures >= 3) await declareDeath(actor);
    } else if (newHp > 0 && oldHp === 0) {
      await actor.update({ "system.attributes.death.successes": 0, "system.attributes.death.failures": 0 });
      if (actor.statuses.has("unconscious")) await actor.toggleStatusEffect("unconscious", { active: false });
      if (actor.statuses.has("dead")) await actor.toggleStatusEffect("dead", { active: false });
    }
  });
  
  // Empêche les PV actuels de dépasser le max, quelle qu'en soit la cause (saisie manuelle
  // directe, mais aussi toute variation du max lui-même : caractéristique, niveau, Exhaustion,
  // création de personnage) : après chaque update, si le max déjà recalculé par
  // prepareDerivedData est désormais inférieur aux PV actuels, un update de correction les
  // ramène au max. Même principe pour chaque palier d'emplacement de sort (system.spells.slots) —
  // retour de test, les deux pouvaient dépasser leur max (ex. changement de classe qui réduit le
  // max d'un palier déjà entamé). Seul le client à l'origine du changement corrige (garde
  // userId), pour ne pas déclencher la même correction depuis chaque client connecté.
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (game.user.id !== userId) return;
    if (!["character", "npc", "mount", "wildShapeForm"].includes(actor.type)) return;
  
    const updates = {};
    const hp = actor.system.attributes?.hp;
    if (hp && hp.value > hp.max) updates["system.attributes.hp.value"] = hp.max;
  
    if (actor.type === "character") {
      const slots = actor.system.spells?.slots;
      for (const level of SPELL_LEVELS) {
        const slot = slots?.[level];
        if (slot && slot.value > slot.max) updates[`system.spells.slots.${level}.value`] = slot.max;
      }
    }
  
    // `dndCustomHpClamp` : ce correctif peut faire BAISSER system.attributes.hp.value (ex. un
    // Joueur augmente lui-même son Exhaustion, cf. exhaustionIncrease/tab-stats.hbs, ce qui réduit
    // son PV max sous ses PV actuels) — à distinguer explicitement d'un vrai dégât pour ne pas se
    // faire bloquer par le filet de sécurité anti-self-dégâts de preUpdateActor ci-dessus.
    if (Object.keys(updates).length) await actor.update(updates, { dndCustomHpClamp: true });
  });
  
  // Mort d'un PNJ, SRD 5e simplifié (contrairement à un personnage : pas d'agonie ni de jet de
  // sauvegarde de la mort pour un PNJ — 0 PV = mort directe) : statut "Mort" (cf. declareDeath,
  // death.js), Combattant marqué "vaincu" dans le Combat Tracker s'il participe au combat en
  // cours, puis distribution d'XP automatique (cf. openAwardXpDialog, xp.js), montant pré-rempli
  // avec system.xpReward, plutôt que d'attendre que le MJ clique le bouton dédié de la fiche PNJ.
  // Se déclenche quel que soit le client à l'origine du changement (dégâts appliqués par un
  // joueur via le bouton du chat, ou modification directe des PV par le MJ) : seul le MJ actif
  // (game.users.activeGM, motif standard Foundry) réagit, pour n'agir qu'une fois même si
  // plusieurs MJ sont connectés.
  Hooks.on("updateActor", async (actor, changes, options) => {
    if (actor.type !== "npc") return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const oldHp = options.dndCustomOldHp;
    if (oldHp === undefined || oldHp === 0) return;
    if (actor.system.attributes.hp.value !== 0) return;
  
    await declareDeath(actor);
  
    const combatant = game.combat?.combatants.find((c) => c.actor?.uuid === actor.uuid);
    if (combatant && !combatant.defeated) await combatant.update({ defeated: true });
  
    if (actor.system.xpReward) openAwardXpDialog({ defaultAmount: actor.system.xpReward });
  });
  
  // Pas de symétrique automatique ici (contrairement au personnage ci-dessus) : un PNJ à 0 PV
  // est mort définitivement par défaut, même si un sort ou un objet de soin le ramène ensuite
  // au-dessus de 0 PV — un soin qui s'applique à un PNJ n'est de toute façon pas garanti de le
  // ramener à la vie (retour de test/décision assumée). Le MJ reste seul juge : pour annuler la
  // mort d'un PNJ, il retire manuellement le statut "Mort" (menu des états du token) et le
  // marqueur "vaincu" (clic droit sur le Combattant dans le Combat Tracker).
  
  // Retour automatique à la forme normale quand les PV d'une Forme sauvage (chantier "Forme
  // sauvage", 2026-08-23) tombent à 0, SRD 5e — les dégâts excédentaires ne sont JAMAIS reportés
  // sur le personnage (contrairement à un PNJ ci-dessus, cette forme n'est jamais "morte" pour de
  // bon : juste vidée, l'Actor wildShapeForm lui-même reste réutilisable). Cherche le personnage
  // qui a actuellement cette forme active (system.combat.wildShapeActorId) et vide ce champ. Même
  // garde MJ actif que la mort de PNJ ci-dessus, pour n'agir qu'une fois même à plusieurs MJ
  // connectés.
  Hooks.on("updateActor", async (actor, changes, options) => {
    if (actor.type !== "wildShapeForm") return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const oldHp = options.dndCustomOldHp;
    if (oldHp === undefined || oldHp === 0) return;
    if (actor.system.attributes.hp.value !== 0) return;
  
    const character = game.actors.find(
      (candidate) => candidate.type === "character" && candidate.system.combat.wildShapeActorId === actor.id
    );
    if (!character) return;
  
    await character.update({ "system.combat.wildShapeActorId": "" });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: character }),
      content: game.i18n.format("DND_CUSTOM.Chat.WildShapeEnded", { name: character.name, form: actor.name })
    });
  });
}
