// Implémente les "9 sorts/capacités à rider différé" — revue de conception du 2026-08-21/23,
// ANOMALIES_ACTIVES.md, périmètre "tout faire" choisi explicitement avec l'utilisateur.
//
// Couvre les mécanismes réellement NOUVEAUX introduits pour ce chantier :
// - États homebrew "blessed"/"guided" (Bénédiction/Avis divin) : cf. conditionRollEffects
//   (actor-sheet.js) étendu pour ajouter "+1d4" à la formule d'un jet d'attaque/de sauvegarde
//   (blessed) ou de caractéristique/compétence (guided) tant que l'état est actif — bascule
//   manuelle (onglet États), même esprit que raging/hunted déjà existants.
// - FeatureData#saveDCAbility (item-data.js) : caractéristique de DD explicite quand elle n'est
//   pas celle d'incantation de la classe (ex. Frappe étourdissante, Moine — DD basé sur la
//   Sagesse alors que "monk" est absent de DND_CUSTOM.spellcastingAbility).
// - FeatureData#dealsDamage (item-data.js) : jet de Capacité marqué du même flag `damageRoll`
//   qu'un jet de dégâts d'arme/de sort, pour réutiliser le bouton "Appliquer les dégâts" déjà
//   existant (ex. Disciplines élémentaires, Moine).
//
// Items de test créés DIRECTEMENT (createEmbeddedDocuments), jamais depuis le compendium réel,
// pour les 5 Capacités/Sorts dont le CONTENU existant a été modifié cette session (Chant de
// repos, Malédiction du sorcier, Porte dimensionnelle, Frappe étourdissante, Disciplines
// élémentaires) : piège déjà documenté ailleurs (spell-slot-recovery.cy.js) —
// `importSystemContent` n'importe que les entrées ABSENTES par nom, jamais une mise à jour d'une
// entrée déjà présente dans le compendium persistant de cette instance Docker. "Ki"/"Trait de
// feu" restent inchangés cette session : sans risque à récupérer depuis le compendium réel.
// Effroi psychique (Occultiste) et Pourfendeur de colosses (Rôdeur Chasseur) réutilisent
// respectivement le mécanisme savingThrow/appliesCondition déjà validé par
// turn-undead-feature.cy.js/paladin-channel-divinity.cy.js et le même dealsDamage que
// Disciplines élémentaires ci-dessous : pas de spec dédiée, redondant.

const createdActorIds = [];
const createdSceneItemIds = [];
let clericId; // Béni/Guidé (attaque, sauvegarde, test), Chant de repos, Malédiction du sorcier, Porte dimensionnelle
let monkId; // Frappe étourdissante (saveDCAbility), Disciplines élémentaires (dealsDamage)
let targetActorId;
let targetTokenId;

const CHANT_DE_REPOS = {
  name: "Chant de repos",
  type: "feature",
  system: { class: "bard", level: 2, requiresRoll: true, rollFormula: "1d6", healsTarget: true }
};
const MALEDICTION_DU_SORCIER = {
  name: "Malédiction du sorcier",
  type: "spell",
  system: { classes: ["warlock"], level: 1, damage: { dice: "1d6", type: "necrotic" } }
};
const PORTE_DIMENSIONNELLE = {
  name: "Porte dimensionnelle",
  type: "spell",
  system: { classes: ["wizard"], level: 4, damage: { dice: "4d6", type: "force" } }
};
const FRAPPE_ETOURDISSANTE = {
  name: "Frappe étourdissante",
  type: "feature",
  system: { class: "monk", level: 5, costsResource: "Ki", savingThrow: "con", saveDCAbility: "wis", appliesCondition: "stunned" }
};
const DISCIPLINES_ELEMENTAIRES = {
  name: "Disciplines élémentaires",
  type: "feature",
  system: { class: "monk", subclass: "fourElements", level: 3, requiresRoll: true, rollFormula: "4d6", dealsDamage: true, costsResource: "Ki" }
};

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

function createItem(win, actorId, data) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(data))]);
}

function withItemId(actorId, itemName, callback) {
  return cy
    .window()
    .then((win) => {
      const item = win.game.actors.get(actorId).items.find((candidate) => candidate.name === itemName);
      expect(item, `Item '${itemName}' introuvable sur l'Actor`).to.exist;
      return item.id;
    })
    .then(callback);
}

let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function lastMessage() {
  return cy
    .window()
    .should((win) => {
      expect(win.game.messages.size, "un nouveau message doit être posté").to.be.greaterThan(knownMessageCount);
    })
    .then((win) => {
      knownMessageCount = win.game.messages.size;
      const message = win.game.messages.contents.at(-1);
      return {
        formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, ""),
        content: message.content,
        flags: message.flags?.["dnd-custom-ai"] ?? {}
      };
    });
}

function grantCompendiumItem(win, actorId, packName, itemName) {
  const pack = win.game.packs.get(`dnd-custom-ai.${packName}`);
  return pack.getIndex().then(() => {
    const entry = [...pack.index].find((candidate) => candidate.name === itemName);
    expect(entry, `Item '${itemName}' introuvable dans le compendium ${packName}`).to.exist;
    return pack.getDocument(entry._id).then((doc) =>
      win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(doc.toObject()))])
    );
  });
}

before(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.game.dndCustomAi.importSystemContent({ notifyIfEmpty: false }));

  cy.loginAsPlayer();
  cy.createReadyCharacter({ name: "Rider Cleric", origin: "ravenmoor", classKey: "cleric", skills: ["religion", "medicine"] }).then(
    (id) => {
      clericId = id;
      createdActorIds.push(id);
      cy.window().then((win) =>
        Promise.all([
          grantCompendiumItem(win, id, "sorts", "Trait de feu"),
          createItem(win, id, CHANT_DE_REPOS),
          createItem(win, id, MALEDICTION_DU_SORCIER),
          createItem(win, id, PORTE_DIMENSIONNELLE)
        ])
      );
    }
  );
  cy.window().then((win) => win.game.actors.get(clericId)?.sheet?.close());

  cy.createReadyCharacter({ name: "Rider Monk", origin: "altenmark", classKey: "monk", skills: ["acrobatics", "athletics"] }).then(
    (id) => {
      monkId = id;
      createdActorIds.push(id);
      cy.window().then((win) =>
        Promise.all([
          grantCompendiumItem(win, id, "capacites", "Ki"),
          createItem(win, id, FRAPPE_ETOURDISSANTE),
          createItem(win, id, DISCIPLINES_ELEMENTAIRES)
        ])
      );
    }
  );
  cy.window().then((win) => win.game.actors.get(monkId)?.sheet?.close());

  // NPC cible (Frappe étourdissante) créée en session MJ : Player1 n'a pas la permission de
  // créer un Token sur la scène (retour de test), même pattern que
  // metamagic-careful-heightened.cy.js > createNpcWithToken.
  cy.loginAsGM();
  cy.window()
    .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "Rider Stun Target", type: "npc" }))))
    .then((actor) =>
      cy.window().then((win) =>
        actor
          .getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 400, y: 400 })))
          .then((tokenDoc) =>
            win.canvas.scene
              .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))])
              .then((tokens) => {
                targetActorId = actor.id;
                targetTokenId = tokens[0].id;
                createdActorIds.push(actor.id);
                createdSceneItemIds.push(tokens[0].id);
              })
          )
      )
    );
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("États homebrew Béni/Guidé — bonus +1d4 automatique (Bénédiction/Avis divin)", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("Béni : +1d4 sur un jet de sauvegarde", () => {
    cy.window().then((win) => win.game.actors.get(clericId).toggleStatusEffect("blessed", { active: true }));
    cy.openActorSheet(clericId);
    goToTab("stats");
    resetMessageBaseline();

    sheetRoot().find('[data-action="rollSave"][data-key="wis"]').click();
    lastMessage().then((message) => {
      expect(message.formula, "formule de sauvegarde incluant le bonus Béni").to.include("+1d4");
    });

    cy.window().then((win) => win.game.actors.get(clericId).toggleStatusEffect("blessed", { active: false }));
  });

  it("Béni : +1d4 sur un jet d'attaque (sort)", () => {
    cy.window().then((win) => win.game.actors.get(clericId).toggleStatusEffect("blessed", { active: true }));
    cy.openActorSheet(clericId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(clericId, "Trait de feu", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "formule d'attaque incluant le bonus Béni").to.include("+1d4");
      });
    });

    cy.window().then((win) => win.game.actors.get(clericId).toggleStatusEffect("blessed", { active: false }));
  });

  it("Guidé : +1d4 sur un test de caractéristique, jamais sans l'état actif", () => {
    cy.openActorSheet(clericId);
    goToTab("stats");
    resetMessageBaseline();

    sheetRoot().find('[data-action="rollAbility"][data-key="wis"]').click();
    lastMessage().then((message) => {
      expect(message.formula, "aucun bonus sans l'état Guidé").to.not.include("1d4");
    });

    cy.window().then((win) => win.game.actors.get(clericId).toggleStatusEffect("guided", { active: true }));
    resetMessageBaseline();
    sheetRoot().find('[data-action="rollAbility"][data-key="wis"]').click();
    lastMessage().then((message) => {
      expect(message.formula, "formule de test incluant le bonus Guidé").to.include("+1d4");
    });

    cy.window().then((win) => win.game.actors.get(clericId).toggleStatusEffect("guided", { active: false }));
  });
});

describe("Contenu réutilisant des mécanismes déjà existants", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("Chant de repos : jet de soin avec bouton 'Appliquer le soin' (healsTarget)", () => {
    cy.openActorSheet(clericId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(clericId, "Chant de repos", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "1d6, sans modificateur").to.equal("1d6");
        expect(message.flags.healRoll, "flag healRoll pour le bouton Appliquer le soin").to.be.true;
      });
    });
  });

  it("Malédiction du sorcier : bouton 'Jet de dégâts' indépendant (1d6 nécrotique)", () => {
    cy.openActorSheet(clericId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(clericId, "Malédiction du sorcier", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "1d6 nécrotique, indépendant du jet d'attaque").to.equal("1d6");
        expect(message.flags.damageRoll, "flag damageRoll pour le bouton Appliquer les dégâts").to.be.true;
      });
    });
  });

  it("Porte dimensionnelle : bouton 'Jet de dégâts' disponible (4d6 force)", () => {
    cy.openActorSheet(clericId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(clericId, "Porte dimensionnelle", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollSpellDamage"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "4d6").to.equal("4d6");
      });
    });
  });
});

describe("FeatureData#saveDCAbility — DD hors caractéristique d'incantation (Frappe étourdissante, Moine)", () => {
  // Session MJ (pas Joueur) : la cible est un PNJ non possédé par Player1, et l'échec du jet de
  // sauvegarde applique la condition "stunned" (ActiveEffect) sur son Actor synthétique — même
  // contrainte de permission que turn-undead-feature.cy.js (toujours en session MJ pour cette
  // raison), retour de test rencontré ici aussi (« User Player1 lacks permission to create
  // ActiveEffect »).
  beforeEach(() => {
    cy.loginAsGM();
  });

  it("le DD utilise la Sagesse (saveDCAbility), pas 0 (Moine absent de spellcastingAbility)", () => {
    // Sagesse basse et connue (8, mod -1) : si saveDCAbility était ignoré (retombant sur
    // spellcastingAbility["monk"], absent -> mod 0), le DD afficherait 8+prof+0 au lieu de
    // 8+prof-1 — les deux valeurs sont distinguables dans le message de sauvegarde de la cible.
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(monkId), { "system.abilities.wis.value": 8 }, { dndCustomWizard: true })
    );
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));
    cy.openActorSheet(monkId);
    goToTab("abilities");
    resetMessageBaseline();
    cy.forceD20(1); // jet de sauvegarde de la CIBLE : échec garanti, formule/DD restent vérifiables
    withItemId(monkId, "Frappe étourdissante", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeatureSave"]`).click();
      // DD attendu : 8 + bonus de maîtrise (niveau 1 -> 2) + mod. de Sagesse (8 -> -1) = 9,
      // JAMAIS 8+2+0=10 (ce que donnerait un `saveDCAbility` ignoré, retombant sur
      // spellcastingAbility["monk"], absent -> mod 0). Formule construite via i18n (comme
      // metamagic-careful-heightened.cy.js) plutôt qu'un texte en dur : robuste à la locale
      // active de cette instance Docker (anglais ici, cf. retour de test).
      cy.window()
        .its("game.i18n")
        .then((i18n) =>
          i18n.format("DND_CUSTOM.Roll.SaveFail", {
            name: "Rider Stun Target",
            ability: i18n.localize("DND_CUSTOM.Abilities.con"),
            dc: 9,
            spell: "Frappe étourdissante"
          })
        )
        .then((expected) => {
          cy.window().should((win) => {
            const message = win.game.messages.contents.at(-1);
            expect(message.flavor).to.equal(expected);
          });
        });
    });
  });
});

describe("FeatureData#dealsDamage — bouton 'Appliquer les dégâts' sur un jet de Capacité (Disciplines élémentaires)", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("jet de 4d6 marqué damageRoll (bouton dédié), Ki décompté séparément (bouton dédié existant)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(monkId).items.find((i) => i.name === "Ki"), { "system.uses.value": 5 }));
    cy.openActorSheet(monkId);
    goToTab("abilities");
    resetMessageBaseline();

    withItemId(monkId, "Disciplines élémentaires", (itemId) => {
      // Bouton "rollFeature" (dé) : jet de dégâts, indépendant de la réserve de Ki.
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeature"]`).click();
      lastMessage().then((message) => {
        expect(message.formula, "4d6").to.equal("4d6");
        expect(message.flags.damageRoll, "flag damageRoll (bouton Appliquer les dégâts)").to.be.true;
      });

      // Bouton "useResourceTechnique" (Ki) : mécanisme déjà éprouvé ailleurs (cf.
      // tab-abilities.cy.js > "technique consommant la réserve d'une autre Capacité"), vérifié
      // ici seulement pour confirmer qu'il coexiste bien avec le bouton de jet ci-dessus sur
      // cette même Capacité (costsResource + requiresRoll en même temps, cas nouveau).
      cy.get(`li[data-item-id="${itemId}"] button[data-action="useResourceTechnique"]`).click();
      cy.window().should((win) => {
        const ki = win.game.actors.get(monkId).items.find((i) => i.name === "Ki");
        expect(ki.system.uses.value, "1 point de Ki décompté par ce clic").to.equal(4);
      });
    });
  });
});
