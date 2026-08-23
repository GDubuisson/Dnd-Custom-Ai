// Suite du chantier "8 sous-classes déjà à ≥1 mécanique" (2026-08-23) — sur demande explicite de
// l'utilisateur d'aller plus loin sur Tactiques défensives (Hunter, Rôdeur), dont seul le CHOIX
// était automatisé jusqu'ici. Couvre les 3 options désormais réellement appliquées aux jets :
// - Volonté de fer : avantage à la sauvegarde d'une cible qui l'a choisi, quand la Capacité qui
//   la force applique Effrayé en cas d'échec (helpers/hunters-defense.js#hasSteadfastAdvantage).
// - Défense contre les attaques multiples : avantage si l'attaquant qui force la sauvegarde a
//   déjà fait un jet d'attaque contre la cible ce round (nouveau
//   system.combat.attackedByThisRound, rempli par #recordAttackOnTargets à chaque jet d'attaque
//   arme/sort, remis à zéro au début du tour propre).
// - Échappée de la horde : désavantage éphémère posé sur le PROCHAIN jet d'un PNJ hostile dont
//   le Rôdeur (avec ce choix) vient de quitter la portée de mêlée — extension du hook
//   `updateToken` d'opportunity-attack.js dans le sens inverse de l'Attaque d'opportunité.

const createdActorIds = [];
const createdCombatIds = [];
const createdSceneItemIds = [];

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

function createActor(win, data) {
  return win.Actor.create(win.JSON.parse(win.JSON.stringify(data))).then((actor) => {
    createdActorIds.push(actor.id);
    return actor;
  });
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

function createToken(win, actorId, x, y) {
  return win.game.actors
    .get(actorId)
    .getTokenDocument(win.JSON.parse(win.JSON.stringify({ x, y })))
    .then((tokenDoc) =>
      win.canvas.scene
        .createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))])
        .then((tokens) => {
          createdSceneItemIds.push(tokens[0].id);
          return tokens[0].id;
        })
    );
}

function targetToken(tokenId) {
  return cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));
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
      return { content: message.content, flavor: message.flavor, formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, "") };
    });
}

let originalGrid;

before(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    originalGrid = { distance: win.canvas.scene.grid.distance, units: win.canvas.scene.grid.units, size: win.canvas.scene.grid.size };
    return win.canvas.scene.update(win.JSON.parse(win.JSON.stringify({ grid: { distance: 1.5, units: "m", size: 100 } })));
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [
      win.Actor.deleteDocuments(createdActorIds),
      win.canvas.scene.update(win.JSON.parse(win.JSON.stringify({ grid: originalGrid })))
    ];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Volonté de fer — avantage à la sauvegarde contre Effrayé", () => {
  let casterId;
  let rangerId;
  let rangerTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Fear Caster", type: "character", system: { class: "cleric" } }))
      .then((actor) => {
        casterId = actor.id;
      });
    cy.window().then((win) =>
      createItem(win, casterId, {
        name: "Test Frighten",
        type: "feature",
        system: { class: "cleric", level: 1, savingThrow: "wis", saveDCAbility: "wis", appliesCondition: "frightened" }
      })
    );
    cy.window()
      .then((win) => createActor(win, { name: "Steadfast Ranger", type: "character", system: { class: "ranger" } }))
      .then((actor) => {
        rangerId = actor.id;
      });
    cy.window()
      .then((win) => createToken(win, rangerId, 1000, 1000))
      .then((tokenId) => {
        rangerTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("cible ayant choisi 'Volonté de fer' : formule 2d20kh1 (T-STEADFAST-001)", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(rangerId), { "system.combat.huntersDefense": "steadfast" }, { dndCustomWizard: true })
    );
    cy.openActorSheet(casterId);
    goToTab("abilities");
    targetToken(rangerTokenId);
    withItemId(casterId, "Test Frighten", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeatureSave"]`).click();
      lastMessage().then((roll) => {
        expect(roll.formula, "avantage : 2d20kh1").to.include("2d20kh1");
      });
    });
  });

  it("cible sans ce choix : formule 1d20 normale (T-STEADFAST-002)", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(rangerId), { "system.combat.huntersDefense": "" }, { dndCustomWizard: true })
    );
    cy.openActorSheet(casterId);
    goToTab("abilities");
    targetToken(rangerTokenId);
    withItemId(casterId, "Test Frighten", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeatureSave"]`).click();
      lastMessage().then((roll) => {
        expect(roll.formula, "aucun avantage sans le choix").to.not.include("2d20kh1");
      });
    });
  });
});

describe("Défense contre les attaques multiples — avantage contre un attaquant qui a déjà attaqué ce round", () => {
  let attackerId;
  let rangerId;
  let rangerTokenId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Multiattack Wizard", type: "character", system: { class: "wizard" } }))
      .then((actor) => {
        attackerId = actor.id;
      });
    cy.window().then((win) =>
      Promise.all([
        createItem(win, attackerId, { name: "Test Attack Cantrip", type: "spell", system: { classes: ["wizard"], level: 0, attack: true, damage: { dice: "1d4" } } }),
        createItem(win, attackerId, { name: "Test Save Capacity", type: "feature", system: { class: "wizard", level: 1, savingThrow: "wis", saveDCAbility: "wis" } })
      ])
    );
    cy.window()
      .then((win) => createActor(win, { name: "Multiattack Ranger", type: "character", system: { class: "ranger" } }))
      .then((actor) => {
        rangerId = actor.id;
      });
    cy.window()
      .then((win) => createToken(win, rangerId, 1000, 1000))
      .then((tokenId) => {
        rangerTokenId = tokenId;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("après une attaque sur la cible ce round, sa sauvegarde a l'avantage contre CET attaquant (T-MULTIDEF-001)", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(rangerId), { "system.combat.huntersDefense": "multiattackDefense" }, { dndCustomWizard: true })
    );
    cy.openActorSheet(attackerId);
    goToTab("abilities");
    targetToken(rangerTokenId);

    withItemId(attackerId, "Test Attack Cantrip", (itemId) => {
      cy.get(`li[data-item-id="${itemId}"] button[data-action="castSpell"]`).click();
    });
    cy.window().should((win) => {
      expect(
        win.game.actors.get(rangerId).system.combat.attackedByThisRound.has(attackerId),
        "attaquant enregistré comme ayant déjà attaqué ce round"
      ).to.be.true;
    });

    withItemId(attackerId, "Test Save Capacity", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeatureSave"]`).click();
      lastMessage().then((roll) => {
        expect(roll.formula, "avantage : 2d20kh1").to.include("2d20kh1");
      });
    });
  });

  it("sans attaque préalable ce round, aucune avantage (T-MULTIDEF-002)", () => {
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(rangerId), { "system.combat.attackedByThisRound": [] }, { dndCustomWizard: true })
    );
    cy.openActorSheet(attackerId);
    goToTab("abilities");
    targetToken(rangerTokenId);
    withItemId(attackerId, "Test Save Capacity", (itemId) => {
      resetMessageBaseline();
      cy.get(`li[data-item-id="${itemId}"] button[data-action="rollFeatureSave"]`).click();
      lastMessage().then((roll) => {
        expect(roll.formula, "aucun avantage sans attaque préalable ce round").to.not.include("2d20kh1");
      });
    });
  });
});

describe("Échappée de la horde — désavantage éphémère sur l'ennemi dont on s'éloigne", () => {
  let rangerId;
  let rangerTokenId;
  let enemyId;
  let enemyTokenId;

  beforeEach(() => cy.loginAsGM());

  it("le Rôdeur s'éloigne d'un PNJ hostile à 1,50 m : désavantage sur son prochain jet d'attaque (T-MOBILE-001)", () => {
    cy.window().then((win) => (createdCombatIds.length ? win.Combat.deleteDocuments(createdCombatIds.splice(0)) : null));

    // Découvert en testant : un token nouvellement créé hérite d'une disposition HOSTILE par
    // défaut (comportement natif Foundry, pas de préréglage côté ce système) — sans corriger la
    // disposition du PROTOTYPE dès la création (`prototypeToken.disposition`, jamais un update du
    // token séparé ensuite), le déplacement du Rôdeur serait pris pour le sens "PNJ hostile
    // s'éloigne" (branche existante d'opportunity-attack.js) plutôt que le nouveau sens
    // "Échappée de la horde" testé ici.
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Mobile Ranger",
          type: "character",
          system: { class: "ranger", combat: { huntersDefense: "mobile" } },
          prototypeToken: { disposition: win.CONST.TOKEN_DISPOSITIONS.FRIENDLY }
        })
      )
      .then((actor) => {
        rangerId = actor.id;
      });
    cy.window()
      .then((win) => createToken(win, rangerId, 1000, 1000))
      .then((tokenId) => {
        rangerTokenId = tokenId;
      });

    cy.window()
      .then((win) => createActor(win, { name: "Mobile Enemy", type: "npc", system: { attack: { ability: "str", bonus: 5 } } }))
      .then((actor) => {
        enemyId = actor.id;
      });
    cy.window()
      .then((win) => createToken(win, enemyId, 1060, 1000)) // 60 px = 0,9 m du Rôdeur
      .then((tokenId) => {
        enemyTokenId = tokenId;
      });
    cy.window().then((win) =>
      win.canvas.tokens
        .get(enemyTokenId)
        .document.update(win.JSON.parse(win.JSON.stringify({ disposition: win.CONST.TOKEN_DISPOSITIONS.HOSTILE })))
    );

    // `Combatant#tokenId` peut différer du tokenId explicitement fourni ici (résolution Foundry
    // non garantie identique, piège déjà documenté ailleurs dans cette suite) : se fier au
    // résultat RÉEL de la création pour savoir quel token déplacer ensuite, pas la variable
    // suivie séparément. `tokenId` explicite pour les DEUX Combattants (piège découvert ici :
    // omis pour l'ennemi, Foundry le laisse à `null` — `combatant.token` (getter) renvoie alors
    // `undefined`, faisant échouer silencieusement le hook `updateToken` qui s'appuie dessus).
    let rangerCombatantTokenId;
    cy.window()
      .then((win) =>
        win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
          createdCombatIds.push(combat.id);
          return combat.createEmbeddedDocuments(
            "Combatant",
            win.JSON.parse(
              win.JSON.stringify([
                { actorId: rangerId, tokenId: rangerTokenId, initiative: 10 },
                { actorId: enemyId, tokenId: enemyTokenId, initiative: 5 }
              ])
            )
          );
        })
      )
      .then((combatants) => {
        rangerCombatantTokenId = combatants.find((c) => c.actorId === rangerId).tokenId;
      });

    // Attend que `game.combat` reflète bien les 2 Combattants avant de déplacer le token : piste
    // de course potentielle entre la création du Combat/des Combattants et le hook `updateToken`
    // qui lit `game.combat.combatants` (cf. commentaire du chantier ci-dessus).
    cy.window().should((win) => {
      expect(win.game.combat?.combatants.size, "les 2 Combattants doivent être enregistrés avant le déplacement").to.equal(2);
    });

    // Le Rôdeur s'éloigne à 4,50 m (hors de la portée de mêlée de 1,50 m).
    cy.window().then((win) =>
      win.canvas.tokens.get(rangerCombatantTokenId).document.update(win.JSON.parse(win.JSON.stringify({ x: 1300, y: 1000 })))
    );

    // Token PNJ non lié (`actorLink: false` par défaut, cf. turn-undead-feature.cy.js) : le flag
    // est posé par le hook sur l'acteur SYNTHÉTIQUE propre à ce token
    // (`combatant.actor` == `canvas.tokens.get(id).actor`), jamais sur l'acteur "prototype" du
    // monde (`game.actors.get(id)`) — piège rencontré en écrivant ce test, cf. même remarque déjà
    // faite pour Repousser les morts-vivants.
    cy.window({ timeout: 10000 }).should((win) => {
      expect(
        win.canvas.tokens.get(enemyTokenId).actor.getFlag("dnd-custom-ai", "pendingOpportunityDisadvantage"),
        "flag de désavantage posé sur l'ennemi"
      ).to.be.true;
    });

    cy.window().then((win) => win.canvas.tokens.get(enemyTokenId).actor.sheet.render(true));
    cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "désavantage : 2d20kl1").to.include("2d20kl1");
    });

    cy.window().should((win) => {
      expect(
        win.canvas.tokens.get(enemyTokenId).actor.getFlag("dnd-custom-ai", "pendingOpportunityDisadvantage"),
        "flag consommé après le jet"
      ).to.be.undefined;
    });
  });
});
