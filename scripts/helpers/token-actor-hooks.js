import { CharacterCreationWizard } from "../sheets/character-creation-wizard.js";
import { grantClassContent } from "./class-content.js";

/** Hooks liés au cycle de vie d'un Actor : liaison token↔Actor par défaut d'un personnage,
 *  affichage permanent nom/PV des tokens, suppression du rendu de fiche natif au profit de
 *  l'assistant de création (+ ouverture de cet assistant pour un personnage vierge), et octroi
 *  des Capacités de sous-classe dès qu'une sous-classe est choisie sur la fiche. Extrait de
 *  dnd-custom-ai.js (découpe pré-1.0) — appelé au chargement du module, à la position historique
 *  de ces hooks. */
export function registerTokenActorHooks() {
  // Lie le token à l'Actor par défaut pour un personnage joueur (`prototypeToken.actorLink`,
  // `false` par défaut côté Foundry, quel que soit le type d'Actor) — retour de test :
  // désynchronisation PV constatée entre un token et sa fiche (le token affichait 0 PV, la
  // fiche encore son max), symptôme classique d'un token non lié à son Actor. Pas touché pour
  // les PNJ/montures (`npc`/`mount`) : plusieurs instances indépendantes du même Actor (ex.
  // plusieurs gobelins avec des PV propres) restent un usage volontaire et courant côté MJ.
  Hooks.on("preCreateActor", (actor) => {
    if (actor.type !== "character") return;
    actor.updateSource({ "prototypeToken.actorLink": true });
  });
  
  // Nom et PV affichés en permanence sur les tokens, pour tout le monde, quel que soit le type
  // d'Actor (retour de test : par défaut Foundry n'affiche rien, `DISPLAY_MODES.NONE`, il fallait
  // survoler/sélectionner un token pour identifier qui est qui en combat). `ALWAYS` = visible sans
  // interaction, y compris pour les Joueurs qui ne possèdent pas le token (barre de vie du côté
  // adverse comprise — un choix volontairement permissif, cohérent avec le reste du système qui ne
  // masque déjà aucune information de combat). `bar1.attribute` cible `attributes.hp` (chemin
  // identique sur les 4 types d'Actor, cf. character/npc/vehicle-actor-data.js) pour que la barre
  // de vie ait quelque chose à afficher dès la création, sans réglage manuel du MJ.
  Hooks.on("preCreateActor", (actor) => {
    actor.updateSource({
      "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
      "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.ALWAYS,
      "prototypeToken.bar1.attribute": "attributes.hp"
    });
  });
  
  // Best-effort : empêche le dialogue natif "Créer un acteur" d'ouvrir la fiche de personnage
  // juste après la création (`options.renderSheet`, posé par Document#createDialog) quand
  // l'assistant va de toute façon prendre le relais ci-dessous. Gardé, mais ne plus compter
  // dessus comme seule protection : retour de test répété — insuffisant à lui seul selon la
  // version de Foundry (la fiche flashait quand même par-dessus l'assistant). La vraie protection
  // est désormais `DndCustomActorSheet#render` (actor-sheet.js), qui refuse de se rendre tant que
  // l'assistant est ouvert pour le même Actor, indépendamment de ce flag.
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
  
  // Octroie les Capacités de sous-classe dès que le joueur/MJ choisit une sous-classe sur la
  // fiche (select "system.subclass", cf. character-sheet.hbs) : même mécanique que la montée de
  // niveau (#onLevelUp, actor-sheet.js), rejouée ici pour ne pas attendre le prochain niveau.
  // grantClassContent lit actor.system.subclass directement (pas de paramètre dédié, cf.
  // helpers/class-content.js) donc ce simple ré-appel suffit à octroyer ce qui devient
  // disponible. Ne s'exécute que côté client à l'origine du changement (garde sur userId).
  Hooks.on("updateActor", async (actor, changes, options, userId) => {
    if (game.user.id !== userId) return;
    if (actor.type !== "character") return;
    if (changes.system?.subclass === undefined) return;
  
    await grantClassContent(actor, actor.system.class, actor.system.attributes.level);
  });
}
