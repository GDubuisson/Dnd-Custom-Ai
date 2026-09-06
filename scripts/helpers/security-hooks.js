/** Filets de sécurité côté données (`preUpdate*`) : verrouillent pour un non-MJ les champs qui
 *  ne doivent passer que par un flux dédié — champs de "build" du personnage
 *  (caractéristiques/maîtrises/classe/origine/niveau, seuls `dndCustomWizard`/`dndCustomLevelUp`
 *  y dérogent) et définition d'une Capacité de classe (seul `system.uses.value` passe). Complètent
 *  le `disabled` côté template. Extrait de dnd-custom-ai.js (découpe pré-1.0) — appelé une seule
 *  fois, au chargement du module, à la position historique de ces hooks. */
export function registerSecurityHooks() {
  // Champs de "build" du personnage (caractéristiques, maîtrises, classe/origine/niveau) :
  // réservés au MJ. Filet de sécurité côté données, en complément du "disabled" côté UI
  // (cf. templates/actor/character-sheet.hbs et tab-stats.hbs) — empêche toute modification
  // qui ne passerait pas par le formulaire standard (macro, console).
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (actor.type !== "character") return;
    if (game.users.get(userId)?.isGM) return;
    // Exception délibérée : l'assistant de création de personnage (character-creation-
    // wizard.js) est le seul flux autorisé à laisser un joueur fixer TOUS ces champs
    // lui-même, en marquant explicitement son update via cette option — jamais via le
    // formulaire normal de la fiche (qui reste verrouillé/`disabled` côté template pour un
    // non-MJ).
    if (options.dndCustomWizard) return;
  
    const sys = changes.system;
    if (!sys) return;
  
    // Montée de niveau (#onLevelUp, actor-sheet.js) : accessible à tout propriétaire de la
    // fiche depuis 0.16.0 (retour de test — bouton jusqu'ici réservé au MJ), reconnue par
    // cette option dédiée. Seul `level` passe, jamais posée en même temps que class/origin/
    // abilities/saves/skills par ce flux.
    if (options.dndCustomLevelUp) {
      delete sys.class;
      delete sys.origin;
      delete sys.subclass;
      if (sys.abilities) {
        for (const key of Object.keys(sys.abilities)) delete sys.abilities[key].value;
      }
      if (sys.saves) {
        for (const key of Object.keys(sys.saves)) delete sys.saves[key].proficient;
      }
      if (sys.skills) {
        for (const key of Object.keys(sys.skills)) delete sys.skills[key].proficient;
      }
      return;
    }
  
    delete sys.class;
    delete sys.origin;
    // Choix de sous-classe (select "system.subclass", character-sheet.hbs) : accessible à
    // tout propriétaire depuis 0.16.0, mais verrouillé dès qu'une sous-classe est déjà posée
    // (retour de test — le choix doit être définitif une fois fait, le template ne rend le
    // select modifiable que jusque-là). `actor.system.subclass` reflète encore l'état AVANT
    // cet update (preUpdateActor), donc sûr à vérifier ici plutôt qu'une option dédiée.
    if (actor.system.subclass) delete sys.subclass;
    if (sys.attributes) delete sys.attributes.level;
    // Retour de test (bug majeur, sécurité) : un Joueur pouvait s'appliquer lui-même des dégâts
    // en tapant directement une valeur dans le champ PV de l'en-tête (déjà `disabled` côté
    // template pour lui désormais, cf. character-sheet.hbs) — filet de sécurité côté données ici,
    // au cas où l'update viendrait d'ailleurs qu'un vrai clic (macro, console). Seule une BAISSE
    // est bloquée : la guérison (repos, objet de soin, jet de sauvegarde de la mort réussi...)
    // reste un update légitime venant directement du client Joueur, jamais marqué par une option
    // dédiée contrairement à dndCustomWizard/dndCustomLevelUp ci-dessus. `dndCustomDamageApply`
    // (posé par applyDamageToTargets ci-dessous) est la seule exception à cette baisse bloquée :
    // dégâts appliqués via un vrai jet de dés posté en chat, bouton cliqué explicitement — couvre
    // le cas légitime d'un Joueur qui s'inflige lui-même des dégâts narratifs (poison, chute...).
    // `dndCustomHpClamp` : deuxième exception légitime, cf. hook updateActor plus bas (correctif
    // PV > max après une hausse d'Exhaustion, PAS un dégât).
    if (sys.attributes?.hp?.value !== undefined && !options.dndCustomDamageApply && !options.dndCustomHpClamp) {
      if (sys.attributes.hp.value < actor.system.attributes.hp.value) delete sys.attributes.hp.value;
    }
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
}
