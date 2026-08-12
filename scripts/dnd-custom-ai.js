import { CharacterData } from "./data/character-data.js";
import { NpcData } from "./data/npc-data.js";
import { VehicleActorData } from "./data/vehicle-actor-data.js";
import { WeaponData, ArmorData, GearData, FeatureData, ToolData, SpellData, LanguageData } from "./data/item-data.js";
import { OriginData } from "./data/origin-data.js";
import { ClassData } from "./data/class-data.js";
import { DndCustomActorSheet } from "./sheets/actor-sheet.js";
import { CharacterCreationWizard } from "./sheets/character-creation-wizard.js";
import { DndCustomNpcSheet } from "./sheets/npc-sheet.js";
import { VehicleActorSheet } from "./sheets/vehicle-actor-sheet.js";
import {
  WeaponItemSheet,
  ArmorItemSheet,
  GearItemSheet,
  FeatureItemSheet,
  OriginItemSheet,
  ClassItemSheet,
  ToolItemSheet,
  SpellItemSheet,
  LanguageItemSheet
} from "./sheets/item-sheets.js";
import { ensureOriginsJournal } from "./helpers/origins-journal.js";
import { ensurePlayerGuideJournal } from "./helpers/player-guide-journal.js";
import { ensureGmGuideJournal } from "./helpers/gm-guide-journal.js";
import { openAwardXpDialog, ensureAwardXpMacro } from "./helpers/xp.js";
import { importSystemContent, ensureContentImportMacro } from "./helpers/content-import.js";
import { declareDeath } from "./helpers/death.js";
import { registerHandlebarsHelpers } from "./helpers/handlebars-helpers.js";
import {
  equipmentSlots,
  isOffHandEligible,
  abilityModifier,
  proficiencyBonus,
  formatModifier
} from "./helpers/rules.js";
import { DND_CUSTOM } from "./helpers/config.js";

const SYSTEM_ID = "dnd-custom-ai";
// Canal socket (system.json > "socket": true) utilisé pour relayer au MJ actif une mise à jour
// qu'un joueur n'a pas la permission d'effectuer lui-même (cf. requestActorUpdate plus bas —
// PNJ ciblé pour l'application de dégâts, notamment).
const SOCKET_EVENT = `system.${SYSTEM_ID}`;

// Les 14 états SRD 5e (hors Exhaustion, qui a des niveaux 0-6 et vit sur
// system.attributes.exhaustion plutôt qu'en ActiveEffect on/off, cf. character-data.js).
// Remplace la liste générique de Foundry (CONFIG.statusEffects) : icônes réutilisées du
// cœur Foundry quand elles correspondent, libellés propres au système pour coller au
// vocabulaire SRD 5e exact plutôt qu'aux libellés génériques de Foundry.
const DND_CUSTOM_CONDITIONS = [
  { id: "blinded", name: "DND_CUSTOM.Conditions.blinded", img: "icons/svg/blind.svg" },
  { id: "charmed", name: "DND_CUSTOM.Conditions.charmed", img: "icons/svg/aura.svg" },
  { id: "deafened", name: "DND_CUSTOM.Conditions.deafened", img: "icons/svg/deaf.svg" },
  { id: "frightened", name: "DND_CUSTOM.Conditions.frightened", img: "icons/svg/terror.svg" },
  { id: "grappled", name: "DND_CUSTOM.Conditions.grappled", img: "icons/svg/net.svg" },
  { id: "incapacitated", name: "DND_CUSTOM.Conditions.incapacitated", img: "icons/svg/daze.svg" },
  { id: "invisible", name: "DND_CUSTOM.Conditions.invisible", img: "icons/svg/invisible.svg" },
  { id: "paralyzed", name: "DND_CUSTOM.Conditions.paralyzed", img: "icons/svg/paralysis.svg" },
  { id: "petrified", name: "DND_CUSTOM.Conditions.petrified", img: "icons/svg/statue.svg" },
  { id: "poisoned", name: "DND_CUSTOM.Conditions.poisoned", img: "icons/svg/poison.svg" },
  { id: "prone", name: "DND_CUSTOM.Conditions.prone", img: "icons/svg/falling.svg" },
  { id: "restrained", name: "DND_CUSTOM.Conditions.restrained", img: "icons/svg/net.svg" },
  { id: "stunned", name: "DND_CUSTOM.Conditions.stunned", img: "icons/svg/daze.svg" },
  { id: "unconscious", name: "DND_CUSTOM.Conditions.unconscious", img: "icons/svg/unconscious.svg" },
  // Pas un état SRD 5e classique (pas d'avantage/désavantage associé) mais nécessaire pour
  // marquer visuellement un personnage mort sur son token (cf. hook updateActor > mort par
  // échec de jets de sauvegarde, plus bas dans ce fichier).
  { id: "dead", name: "DND_CUSTOM.Conditions.dead", img: "icons/svg/skull.svg" }
];

Hooks.once("init", async () => {
  console.log(`${SYSTEM_ID} | Initialisation du système`);

  // Types déclarés dans system.json ("documentTypes") ; le schéma de chaque type
  // vient de son DataModel, pas d'un template.json (approche dépréciée depuis la V12/V13).
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = NpcData;
  // Montures vivantes : même modèle de données que "npc" (bloc de stats de créature), cf.
  // scripts/sheets/npc-sheet.js — seul le type d'Actor et le libellé de fiche diffèrent.
  CONFIG.Actor.dataModels.mount = NpcData;
  CONFIG.Actor.dataModels.vehicle = VehicleActorData;
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gear = GearData;
  CONFIG.Item.dataModels.feature = FeatureData;
  CONFIG.Item.dataModels.tool = ToolData;
  CONFIG.Item.dataModels.spell = SpellData;
  CONFIG.Item.dataModels.language = LanguageData;
  // Destinés aux compendiums (system.json > packs), remplis à la main par le MJ depuis
  // l'interface Foundry (cf. données actuelles dans scripts/data/origins.json pour "origin").
  CONFIG.Item.dataModels.origin = OriginData;
  CONFIG.Item.dataModels.class = ClassData;

  // CONFIG.statusEffects est un Proxy (cf. foundry/client/config.mjs) qui maintient aussi un
  // accès par id (`CONFIG.statusEffects["prone"]`, utilisé en interne par
  // Actor#toggleStatusEffect) : le vider puis le repeupler par push() plutôt que de
  // l'écraser par une simple affectation, sous peine de perdre cet accès par id.
  CONFIG.statusEffects.length = 0;
  for (const condition of DND_CUSTOM_CONDITIONS) CONFIG.statusEffects.push(condition);

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DndCustomActorSheet, {
    types: ["character"],
    makeDefault: true,
    width: 726,
    label: "DND_CUSTOM.SheetLabels.Character"
  });

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DndCustomNpcSheet, {
    types: ["npc"],
    makeDefault: true,
    width: 726,
    label: "DND_CUSTOM.SheetLabels.Npc"
  });

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DndCustomNpcSheet, {
    types: ["mount"],
    makeDefault: true,
    width: 726,
    label: "DND_CUSTOM.SheetLabels.Mount"
  });

  DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, VehicleActorSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "DND_CUSTOM.SheetLabels.Vehicle"
  });

  // Une fiche Handlebars dédiée par type d'Item (cf. ClaudeFiles/ITEMS.md).
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WeaponItemSheet, { types: ["weapon"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ArmorItemSheet, { types: ["armor"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GearItemSheet, { types: ["gear"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, FeatureItemSheet, { types: ["feature"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, OriginItemSheet, { types: ["origin"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ClassItemSheet, { types: ["class"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ToolItemSheet, { types: ["tool"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, SpellItemSheet, { types: ["spell"], makeDefault: true });
  DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, LanguageItemSheet, { types: ["language"], makeDefault: true });

  registerHandlebarsHelpers();

  // Données de jeu externalisées en JSON (cf. convention "pas en dur dans le JS").
  game.dndCustomAi = {
    origins: await loadOrigins(),
    spellSlotTables: await loadSpellSlotTables(),
    openAwardXpDialog,
    importSystemContent
  };
});

// Journal de référence (MJ) récapitulant les différences entre Origines, Guide du Joueur, Guide
// du MJ (visible du MJ uniquement, cf. gm-guide-journal.js), Macro monde "Attribuer de l'XP"
// (cf. scripts/helpers/xp.js) : créés une seule fois, au premier chargement du monde. Le
// contenu de référence (classes, origines, sorts, capacités de
// classe, armes/armures/objets/outils, cf. content-import.js) est importé automatiquement à
// chaque chargement du monde ci-dessous — dédoublonné par nom, donc sans risque même si déjà
// importé. ensureContentImportMacro reste créée en secours (re-déclenchement manuel possible),
// mais n'est plus l'unique moyen de peupler les compendiums Classes/Origines/Sorts/Capacités.
Hooks.once("ready", async () => {
  await ensureOriginsJournal();
  await ensurePlayerGuideJournal();
  await ensureGmGuideJournal();
  await ensureAwardXpMacro();
  await ensureContentImportMacro();
  await importSystemContent({ notifyIfEmpty: false });
});

// Écoute du canal socket (cf. requestActorUpdate) : un joueur sans permission de modification
// sur l'Actor ciblé (PNJ non possédé, le cas courant) délègue sa mise à jour au MJ actif, seul
// habilité à l'appliquer — même motif game.users.activeGM que les hooks updateActor plus bas,
// pour qu'un seul des MJ éventuellement connectés traite chaque requête.
Hooks.once("ready", () => {
  game.socket.on(SOCKET_EVENT, async ({ uuid, updates } = {}) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    const doc = await fromUuid(uuid);
    if (doc) await doc.update(updates);
  });
});

/** Applique `updates` à `actor` : directement si le client a la permission, sinon relayée au MJ
 *  actif via socket (cf. écoute ci-dessus) — nécessaire pour un PNJ dont un joueur n'est pas
 *  propriétaire (cas courant : dégâts appliqués à un monstre ciblé, cf.
 *  applyDamageToTargets plus bas), sans quoi Actor#update lève une erreur de permission
 *  ("User lacks permission...") côté joueur au lieu d'échouer silencieusement comme espéré. */
async function requestActorUpdate(actor, updates) {
  if (actor.isOwner) {
    await actor.update(updates);
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoGmOnline"));
    return;
  }
  game.socket.emit(SOCKET_EVENT, { uuid: actor.uuid, updates });
}

// Champs de "build" du personnage (caractéristiques, maîtrises, classe/origine/niveau) :
// réservés au MJ. Filet de sécurité côté données, en complément du "disabled" côté UI
// (cf. templates/actor/character-sheet.hbs et tab-stats.hbs) — empêche toute modification
// qui ne passerait pas par le formulaire standard (macro, console).
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (actor.type !== "character") return;
  if (game.users.get(userId)?.isGM) return;
  // Exception délibérée : l'assistant de création de personnage (character-creation-
  // wizard.js) est le seul flux autorisé à laisser un joueur fixer ces champs lui-même,
  // en marquant explicitement son update via cette option — jamais via le formulaire
  // normal de la fiche (qui reste verrouillé/`disabled` côté template pour un non-MJ).
  if (options.dndCustomWizard) return;

  const sys = changes.system;
  if (!sys) return;

  delete sys.class;
  delete sys.origin;
  if (sys.attributes) delete sys.attributes.level;
  if (sys.abilities) {
    for (const key of Object.keys(sys.abilities)) delete sys.abilities[key].value;
  }
  if (sys.saves) {
    for (const key of Object.keys(sys.saves)) delete sys.saves[key].proficient;
  }
  if (sys.skills) {
    for (const key of Object.keys(sys.skills)) delete sys.skills[key].proficient;
  }
});

// Une Capacité de classe (feature) n'est modifiable que par le MJ (définition figée par la
// classe, cf. world-items/features.json) — un joueur ne peut agir dessus qu'en dépensant une
// charge via le bouton dédié de l'onglet Capacités (cf. #onUseFeatureCharge, actor-sheet.js),
// jamais en éditant le formulaire de sa fiche Item (verrouillée/`disabled` côté template pour
// un non-MJ, cf. feature-sheet.hbs). Filet de sécurité côté données en complément, même
// principe que le verrou preUpdateActor ci-dessus : ne laisse passer que system.uses.value.
Hooks.on("preUpdateItem", (item, changes, options, userId) => {
  if (item.type !== "feature") return;
  if (game.users.get(userId)?.isGM) return;

  const sys = changes.system;
  if (!sys) return;

  const usesValue = sys.uses?.value;
  for (const key of Object.keys(sys)) delete sys[key];
  if (usesValue !== undefined) sys.uses = { value: usesValue };
});

// Empêche le dialogue natif "Créer un acteur" d'ouvrir la fiche de personnage juste après
// la création (`options.renderSheet`, posé par Document#createDialog) quand l'assistant va de
// toute façon prendre le relais ci-dessous : preCreateActor s'exécute avant que Foundry ne
// décide d'ouvrir cette fiche, donc désactiver le flag ici l'empêche réellement de s'afficher
// (contrairement à une fermeture après coup dans createActor, qui laissait un flash visible).
Hooks.on("preCreateActor", (actor, data, options, userId) => {
  if (actor.type !== "character") return;
  if (game.user.id !== userId) return;
  if (actor.system.class || actor.system.origin) return;
  options.renderSheet = false;
});

// Point d'entrée découvrable de l'assistant de création (retour de test — le bouton "Créer un
// personnage" n'existait que sur une fiche Actor déjà créée, sans lien depuis le dialogue
// natif "Créer un acteur") : à la création d'un nouvel Actor "character" encore vierge
// (Origine et Classe non définies — un import/duplicata d'un personnage déjà construit ne
// déclenche donc rien), on ouvre directement l'assistant pour guider le choix Origine/Classe/
// caractéristiques. Ne s'ouvre que pour le client à l'origine de la création (garde userId),
// pas pour tous les clients connectés.
Hooks.on("createActor", (actor, options, userId) => {
  if (actor.type !== "character") return;
  if (game.user.id !== userId) return;
  if (actor.system.class || actor.system.origin) return;

  new CharacterCreationWizard(actor).render(true);
});

// Un seul contenant (sac...) équipé à la fois : équiper un objet `gear` porteur d'un bonus
// de charge déséquipe automatiquement tout autre contenant déjà équipé sur le même Actor.
// Ne s'exécute que côté client à l'origine du changement (garde sur userId), pour éviter
// que chaque client connecté ne relance le même correctif en double.
Hooks.on("updateItem", async (item, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (item.type !== "gear") return;
  if (changes.system?.equipped !== true) return;
  if (!(item.system.capacityBonus > 0)) return;
  if (!(item.parent instanceof Actor)) return;

  const others = item.parent.items.contents.filter(
    (other) => other.id !== item.id && other.type === "gear" && other.system.equipped && other.system.capacityBonus > 0
  );
  if (others.length) {
    await item.parent.updateEmbeddedDocuments(
      "Item",
      others.map((other) => ({ _id: other.id, "system.equipped": false }))
    );
  }
});

// Un emplacement d'équipement (main principale, main secondaire, armure) ne peut être occupé
// que par un seul objet à la fois : contrairement aux sacs (déséquipement automatique de
// l'ancien), équiper une arme/armure dont l'emplacement est déjà pris est ici bloqué — il
// faut déséquiper l'objet en place avant, comme demandé. Une arme à deux mains occupe les
// deux mains (cf. equipmentSlots) : impossible de l'équiper si l'une des deux est prise, et
// impossible d'équiper autre chose dans l'autre main tant qu'elle est équipée.
Hooks.on("preUpdateItem", (item, changes, options, userId) => {
  if (game.user.id !== userId) return;
  if (!["weapon", "armor"].includes(item.type)) return;
  if (changes.system?.equipped !== true) return;
  if (!(item.parent instanceof Actor)) return;

  const incomingSystem = {
    slot: changes.system?.slot ?? item.system.slot,
    properties: {
      handedness: changes.system?.properties?.handedness ?? item.system.properties?.handedness,
      light: changes.system?.properties?.light ?? item.system.properties?.light
    }
  };

  // Main secondaire réservée aux armes Légères (SRD 5e, combat à deux armes) : bloque avant
  // même de vérifier une éventuelle collision d'emplacement.
  if (item.type === "weapon" && incomingSystem.slot === "offHand" && !isOffHandEligible(incomingSystem)) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Equipment.OffHandRequiresLight"));
    return false;
  }

  const incomingSlots = equipmentSlots(item.type, incomingSystem).filter((slot) => slot !== "accessory");
  if (!incomingSlots.length) return;

  const conflict = item.parent.items.contents.find((other) => {
    if (other.id === item.id || !["weapon", "armor"].includes(other.type) || !other.system.equipped) return false;
    return equipmentSlots(other.type, other.system).some((slot) => incomingSlots.includes(slot));
  });

  if (conflict) {
    ui.notifications.warn(game.i18n.format("DND_CUSTOM.Equipment.SlotOccupied", { item: conflict.name }));
    return false;
  }
});

// Pré-remplit le XP rapporté (system.xpReward) selon l'indice de dangerosité, table SRD 5e
// officielle (cf. DND_CUSTOM.challengeRatingXp) : ne s'applique que si l'indice change SANS
// que le champ XP lui-même soit modifié dans le même envoi de formulaire, pour laisser le MJ
// libre de le personnaliser ensuite sans qu'un futur changement de FI ne l'écrase.
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
  if (!["npc", "mount"].includes(actor.type)) return;
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


// Ajoute un bouton "Appliquer les dégâts" sur toute carte de chat de jet de dégâts (cf.
// rollDamage dans rolls.js) : applique le total du jet aux tokens actuellement ciblés par le
// client qui clique (game.user.targets), PV temporaires absorbés en premier (SRD 5e).
// Aucune restriction MJ/joueur ici : un joueur ciblant un PNJ qu'il ne possède pas (cas
// courant) n'a pas la permission de le modifier lui-même — requestActorUpdate relaie alors la
// mise à jour au MJ actif via socket plutôt que de laisser Actor#update lever une erreur de
// permission.
Hooks.on("renderChatMessageHTML", (message, html) => {
  if (!message.getFlag(SYSTEM_ID, "damageRoll")) return;
  const amount = message.rolls?.[0]?.total;
  if (!Number.isFinite(amount)) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dnd-apply-damage-btn";
  button.textContent = game.i18n.format("DND_CUSTOM.Chat.ApplyDamage", { amount });
  button.addEventListener("click", () => applyDamageToTargets(amount));
  html.querySelector(".message-content")?.appendChild(button);
});

async function applyDamageToTargets(amount) {
  const targets = Array.from(game.user.targets);
  if (!targets.length) {
    ui.notifications.warn(game.i18n.localize("DND_CUSTOM.Chat.NoTarget"));
    return;
  }

  for (const token of targets) {
    const actor = token.actor;
    const hp = actor?.system.attributes?.hp;
    if (!hp) continue;

    let remaining = amount;
    const updates = {};
    const temp = hp.temp ?? 0;
    if (temp > 0) {
      const absorbed = Math.min(temp, remaining);
      updates["system.attributes.hp.temp"] = temp - absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) updates["system.attributes.hp.value"] = Math.max(0, hp.value - remaining);

    if (Object.keys(updates).length) await requestActorUpdate(actor, updates);
    if (amount > 0 && actor.type === "character" && actor.system.spells.concentratingOn) {
      await checkConcentration(actor, amount);
    }
  }
}

/** Jet de sauvegarde de Constitution pour maintenir la concentration, SRD 5e : DD = 10 ou
 *  la moitié des dégâts subis (arrondi à l'inférieur), le plus élevé des deux. Échec = perte
 *  immédiate de la concentration en cours. Automatique (pas de bouton) : la DD ne dépend que
 *  des dégâts déjà connus au moment de l'application, pas d'un choix du joueur. */
async function checkConcentration(actor, damageAmount) {
  const spellName = actor.system.spells.concentratingOn;
  const dc = Math.max(10, Math.floor(damageAmount / 2));
  const conMod = abilityModifier(actor.system.abilities.con.total);
  const profBonus = actor.system.saves.con.proficient ? proficiencyBonus(actor.system.attributes.level) : 0;

  const roll = new Roll(`1d20${formatModifier(conMod + profBonus)}`);
  await roll.evaluate();
  const success = roll.total >= dc;

  if (!success) await requestActorUpdate(actor, { "system.spells.concentratingOn": "" });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format(success ? "DND_CUSTOM.Chat.ConcentrationSuccess" : "DND_CUSTOM.Chat.ConcentrationFailed", {
      name: actor.name,
      spell: spellName,
      dc
    })
  });
}

async function loadOrigins() {
  const response = await fetch(`systems/${SYSTEM_ID}/scripts/data/origins.json`);
  return response.json();
}

async function loadSpellSlotTables() {
  const response = await fetch(`systems/${SYSTEM_ID}/scripts/data/spell-slots.json`);
  return response.json();
}
