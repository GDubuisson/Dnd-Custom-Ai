/** Retire un champ de chaque entrée d'un groupe (caractéristiques, sauvegardes, compétences). */
function stripGroupField(group, field) {
  if (!group) return;
  for (const key of Object.keys(group)) delete group[key][field];
}

/** Retire les valeurs de caractéristiques et les maîtrises, jamais modifiables par un joueur. */
function stripBuildScores(sys) {
  stripGroupField(sys.abilities, "value");
  stripGroupField(sys.saves, "proficient");
  stripGroupField(sys.skills, "proficient");
}

/** Retire niveau, épuisement et baisse directe de PV, hors flux autorisés par `options`. */
function stripLockedAttributes(actor, attributes, options) {
  if (!attributes) return;
  delete attributes.level;
  // Épuisement modifiable par un joueur uniquement via les repos.
  if (!options.dndCustomExhaustionChange) delete attributes.exhaustion;
  // Un joueur ne peut pas baisser ses PV directement, sauf dégâts appliqués depuis le chat
  // (`dndCustomDamageApply`) ou plafonnement au maximum (`dndCustomHpClamp`).
  const hpValue = attributes.hp?.value;
  if (hpValue === undefined || options.dndCustomDamageApply || options.dndCustomHpClamp) return;
  if (hpValue < actor.system.attributes.hp.value) delete attributes.hp.value;
}

/** Enregistre les verrous `preUpdate*` qui protègent les données réservées au MJ. */
export function registerSecurityHooks() {
  // Champs de « build » du personnage réservés au MJ, hors flux dédiés.
  Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
    if (actor.type !== "character") return;
    if (game.users.get(userId)?.isGM) return;
    // L'assistant de création peut définir tous ces champs.
    if (options.dndCustomWizard) return;

    const sys = changes.system;
    if (!sys) return;

    delete sys.class;
    delete sys.origin;
    stripBuildScores(sys);
    // La montée de niveau ne peut modifier que `level`.
    if (options.dndCustomLevelUp) {
      delete sys.subclass;
      return;
    }
    // Sous-classe définitive une fois choisie.
    if (actor.system.subclass) delete sys.subclass;
    stripLockedAttributes(actor, sys.attributes, options);
  });

  // Capacité de classe : un joueur ne peut modifier que `system.uses.value`.
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
