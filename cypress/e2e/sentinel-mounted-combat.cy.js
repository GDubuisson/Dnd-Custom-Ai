// Implémente Sentinelle (clause 3) et Combat monté — suite du chantier "Combat automatisé
// avancé" (cadrage du 2026-08-23, cf. opportunity-attack.cy.js pour le cas pilote Attaque
// d'opportunité). Choisi avec l'utilisateur : les deux dons, "Combat monté" inclus malgré
// l'absence de tout lien monture/cavalier préexistant dans ce système.
//
// - Sentinelle (clause 3 seule, cf. helpers/sentinel.js) : quand un PNJ hostile attaque une
//   cible autre qu'un Combattant PJ à 1,50 m possédant Sentinelle avec réaction disponible, un
//   message de chat de rappel est posté. Réutilise le helper de distance d'opportunity-attack.js
//   (extrait dans helpers/tactical-distance.js à cette occasion).
// - Combat monté (cf. #onMount/#onDismount, hasMountedSizeAdvantage, actor-sheet.js) : nouveau
//   lien monture/cavalier (system.combat.mountedActorId, ciblage du token de monture + bouton
//   "Monter") réservé aux Actors de type "mount" (créature vivante, NpcData — jamais "vehicle").
//   2 clauses mécanisées : avantage automatique aux jets d'attaque contre une cible plus petite
//   que la monture ; rappel textuel sur les jets de sauvegarde de Dextérité tant que monté (la
//   clause "rediriger une attaque visant la monture" reste texte, hors scope — interruption
//   synchrone). Grille configurée comme opportunity-attack.cy.js (1,5 m/case, taille 100 px).

const createdActorIds = [];
const createdCombatIds = [];
const createdSceneItemIds = [];

let originalGrid;

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

function createActor(win, data) {
  return win.Actor.create(win.JSON.parse(win.JSON.stringify(data))).then((actor) => {
    createdActorIds.push(actor.id);
    return actor;
  });
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
      return { content: message.content, flavor: message.flavor, formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, "") };
    });
}
// Certaines actions postent PLUSIEURS messages (ex. le jet d'attaque PUIS le rappel Sentinelle,
// #onRollAttack -> checkSentinelReminder) : `lastMessage()` seul est sujet à une course si on
// le vérifie trop tôt (il ne capture que le DERNIER connu au moment où `game.messages.size` a
// grandi d'AU MOINS un, potentiellement avant que le 2e message n'arrive) — retour de test.
// Cherche plutôt le texte attendu parmi TOUS les nouveaux messages depuis la dernière baseline.
function expectMessageContaining(expectedText) {
  return cy.window().should((win) => {
    const newMessages = win.game.messages.contents.slice(knownMessageCount);
    const found = newMessages.some((message) => message.content.includes(expectedText));
    expect(found, `un message contenant "${expectedText}" doit apparaître parmi ${newMessages.length} nouveau(x) message(s)`).to.be.true;
  });
}
// Négatif équivalent à expectMessageContaining : certaines actions postent TOUJOURS au moins un
// message (ex. le jet d'attaque lui-même, #onRollAttack) même quand le rappel conditionnel
// (Sentinelle) ne doit PAS apparaître — `expectNoNewMessage` (aucun message du tout) ne convient
// donc pas à ces cas, seul le texte précis du rappel doit être absent.
function expectNoMessageContaining(unexpectedText) {
  return cy.wait(1500).then(() =>
    cy.window().then((win) => {
      const newMessages = win.game.messages.contents.slice(knownMessageCount);
      const found = newMessages.some((message) => message.content.includes(unexpectedText));
      expect(
        found,
        `aucun message ne doit contenir "${unexpectedText}" (knownMessageCount=${knownMessageCount}, size=${win.game.messages.size}, nouveaux=${JSON.stringify(newMessages.map((m) => m.content))})`
      ).to.be.false;
    })
  );
}

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

describe("Sentinelle — rappel automatique quand un PNJ hostile attaque un allié à 1,50 m", () => {
  let fighterId;
  let enemyId;
  let victimId;
  let victimTokenId;
  let fighterTokenId;
  let enemyTokenId;
  // tokenId RÉEL du Combattant "Sentinel Fighter" une fois créé — retour de test :
  // `Combatant#tokenId` peut différer du `fighterTokenId` explicitement fourni à
  // createEmbeddedDocuments (résolution Foundry non garantie identique) ; se fier au résultat
  // de la création elle-même plutôt qu'à `game.combat` relu plus tard (autre piège : `game.combat`
  // — le combat actuellement "viewed" — ne pointe pas de façon fiable vers le combat fraîchement
  // créé de CE test précis une fois plusieurs combats créés au fil des tests précédents).
  let fighterCombatantTokenId;

  beforeEach(() => {
    cy.loginAsGM();
  });

  // Recrée le Guerrier (Sentinelle), le PNJ hostile attaquant et une victime à chaque test :
  // évite toute dépendance à l'historique (réserve/réaction/combat) d'un test précédent, même
  // logique que les autres specs de ce chantier. Supprime tout Combat déjà créé par un test
  // PRÉCÉDENT avant d'en recréer un : retour de test, `game.combat` ("viewed") ne pointe pas de
  // façon fiable vers le combat fraîchement créé tant qu'un ancien combat coexiste sur la même
  // scène (même Actors "Sentinel Fighter"/"Sentinel Enemy" par NOM, mais un id différent —
  // l'ancien combat déclenchait à tort le rappel avec son propre Combattant, jamais réellement
  // affecté par la mise à jour du test en cours).
  function setup() {
    return cy
      .window()
      .then((win) => (createdCombatIds.length ? win.Combat.deleteDocuments(createdCombatIds.splice(0)) : null))
      .then(() => cy.window())
      .then((win) => createActor(win, { name: "Sentinel Fighter", type: "character" }))
      .then((actor) => {
        fighterId = actor.id;
        return cy.window().then((win) =>
          Promise.all([grantCompendiumItem(win, fighterId, "dons", "Sentinelle"), createToken(win, fighterId, 1000, 1000)])
        );
      })
      .then(([, tokenId]) => {
        fighterTokenId = tokenId;
        return cy.window().then((win) =>
          updateActor(win, win.game.actors.get(fighterId), { "system.combat.reactionAvailable": true }, { dndCustomWizard: true })
        );
      })
      .then(() => cy.window().then((win) => createActor(win, { name: "Sentinel Enemy", type: "npc", system: { attacks: [{ ability: "str", bonus: 5 }] } })))
      .then((actor) => {
        enemyId = actor.id;
        return cy.window().then((win) => createToken(win, enemyId, 1060, 1000)); // 0,9 m du Guerrier
      })
      .then((tokenId) => {
        enemyTokenId = tokenId;
        return cy
          .window()
          .then((win) => win.canvas.tokens.get(enemyTokenId).document.update(win.JSON.parse(win.JSON.stringify({ disposition: win.CONST.TOKEN_DISPOSITIONS.HOSTILE }))));
      })
      .then(() => cy.window().then((win) => createActor(win, { name: "Sentinel Victim", type: "npc", system: {} })))
      .then((actor) => {
        victimId = actor.id;
        return cy.window().then((win) => createToken(win, victimId, 1400, 1400));
      })
      .then((tokenId) => {
        victimTokenId = tokenId;
        return cy.window().then((win) =>
          win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then((combat) => {
            createdCombatIds.push(combat.id);
            return combat.createEmbeddedDocuments(
              "Combatant",
              win.JSON.parse(
                win.JSON.stringify([
                  { actorId: fighterId, tokenId: fighterTokenId, initiative: 10 },
                  { actorId: enemyId, tokenId: enemyTokenId, initiative: 5 }
                ])
              )
            );
          })
        );
      })
      .then((combatants) => {
        fighterCombatantTokenId = combatants.find((c) => c.actor?.id === fighterId)?.tokenId;
      });
  }

  it("le PNJ hostile attaque la victime (pas le Guerrier) : message de rappel posté", () => {
    setup().then(() => {
      cy.window().then((win) => win.canvas.tokens.get(victimTokenId).setTarget(true, { releaseOthers: true }));
      resetMessageBaseline();
      cy.openActorSheet(enemyId); // ouvre la fiche PNJ pour cliquer le bouton d'attaque
      sheetRoot().find('button[data-action="rollAttack"]').click();

      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.format("DND_CUSTOM.Chat.SentinelAvailable", { reactor: "Sentinel Fighter", attacker: "Sentinel Enemy" }))
        .then((expected) => expectMessageContaining(expected));
    });
  });

  it("le PNJ hostile attaque le Guerrier lui-même : aucun rappel Sentinelle", () => {
    setup().then(() => {
      // Cible le token RÉEL du Combattant "Sentinel Fighter" (fighterCombatantTokenId, capturé
      // à la création dans setup() — cf. son commentaire).
      cy.window().then((win) => win.canvas.tokens.get(fighterCombatantTokenId).setTarget(true, { releaseOthers: true }));
      resetMessageBaseline();
      cy.openActorSheet(enemyId);
      sheetRoot().find('button[data-action="rollAttack"]').click();
      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.format("DND_CUSTOM.Chat.SentinelAvailable", { reactor: "Sentinel Fighter", attacker: "Sentinel Enemy" }))
        .then((unexpected) => expectNoMessageContaining(unexpected));
    });
  });

  it("réaction déjà consommée : aucun rappel Sentinelle", () => {
    setup().then(() => {
      cy.window().then((win) =>
        updateActor(win, win.game.actors.get(fighterId), { "system.combat.reactionAvailable": false }, { dndCustomWizard: true })
      );
      cy.window().then((win) => win.canvas.tokens.get(victimTokenId).setTarget(true, { releaseOthers: true }));
      cy.window().should((win) => {
        expect(win.game.actors.get(fighterId).system.combat.reactionAvailable, "réaction bien désactivée avant le clic").to.equal(false);
      });
      resetMessageBaseline();
      cy.openActorSheet(enemyId);
      sheetRoot().find('button[data-action="rollAttack"]').click();
      cy.window()
        .its("game.i18n")
        .then((i18n) => i18n.format("DND_CUSTOM.Chat.SentinelAvailable", { reactor: "Sentinel Fighter", attacker: "Sentinel Enemy" }))
        .then((unexpected) => expectNoMessageContaining(unexpected));
    });
  });
});

function sheetRoot() {
  return cy.get(".application.npc, .application.character");
}

describe("Combat monté — avantage vs cible plus petite, rappel sur sauvegarde de Dextérité", () => {
  let riderId;
  let mountId;
  let smallTargetTokenId;
  let sameSizeTargetTokenId;

  before(() => {
    // "Mounted Rider" créé en session Joueur (comme combat-criticals.cy.js/eldritch-invocations.cy.js,
    // cf. leur en-tête) : un Actor créé sous une session MJ n'est PAS automatiquement lié au
    // Joueur — le mettre à jour ensuite en session Joueur (#onMount, mountedActorId) échouerait
    // sinon par manque de permission.
    cy.loginAsPlayer();
    cy.window()
      .then((win) => createActor(win, { name: "Mounted Rider", type: "character" }))
      .then((actor) => {
        riderId = actor.id;
        return cy.window().then((win) => grantCompendiumItem(win, riderId, "dons", "Combat monté"));
      });

    // Monture/cibles créées en session MJ (création d'Actor réservée au MJ) : jamais mises à
    // jour depuis la session Joueur ensuite, seulement lues (taille) ou ciblées.
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "War Horse", type: "mount", system: { size: "g" } }))
      .then((actor) => {
        mountId = actor.id;
      });
    cy.window()
      .then((win) => createActor(win, { name: "Small Prey", type: "npc", system: { size: "p" } }))
      .then((actor) => cy.window().then((win) => createToken(win, actor.id, 1500, 1500)))
      .then((tokenId) => {
        smallTargetTokenId = tokenId;
      });
    cy.window()
      .then((win) => createActor(win, { name: "Same Size Foe", type: "npc", system: { size: "g" } }))
      .then((actor) => cy.window().then((win) => createToken(win, actor.id, 1700, 1700)))
      .then((tokenId) => {
        sameSizeTargetTokenId = tokenId;
      });
  });

  beforeEach(() => {
    cy.loginAsPlayer();
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(riderId), { "system.combat.mountedActorId": mountId }, { dndCustomWizard: true })
    );
  });

  it("attaque contre une cible plus petite que la monture : avantage automatique (2d20kh1)", () => {
    cy.window().then((win) => win.canvas.tokens.get(smallTargetTokenId).setTarget(true, { releaseOthers: true }));
    cy.openActorSheet(riderId);
    resetMessageBaseline();
    cy.get('nav.tabs [data-tab="abilities"]').click();
    // Test de caractéristique Force comme substitut d'un jet d'attaque : le don s'applique à
    // TOUT jet d'attaque, arme ou sort — ce personnage de test n'a ni arme ni sort équipé,
    // vérifié directement via #onRollWeaponAttack serait redondant avec combat-criticals.cy.js.
    // -> on utilise un sort de test à la place (attack: true), plus fidèle au mécanisme réel.
    cy.window().then((win) =>
      win.game.actors.get(riderId).createEmbeddedDocuments("Item", [
        win.JSON.parse(win.JSON.stringify({ name: "Test Mounted Attack Spell", type: "spell", system: { classes: ["fighter"], level: 0, attack: true } }))
      ])
    );
    cy.window().then((win) => {
      const item = win.game.actors.get(riderId).items.find((i) => i.name === "Test Mounted Attack Spell");
      cy.get(`.application.character li[data-item-id="${item.id}"] button[data-action="castSpell"]`).click();
    });
    lastMessage().then((message) => {
      expect(message.formula, "avantage automatique (Combat monté)").to.include("2d20kh1");
    });
  });

  it("attaque contre une cible de même taille que la monture : pas d'avantage automatique", () => {
    cy.window().then((win) => win.canvas.tokens.get(sameSizeTargetTokenId).setTarget(true, { releaseOthers: true }));
    cy.openActorSheet(riderId);
    resetMessageBaseline();
    cy.get('nav.tabs [data-tab="abilities"]').click();
    cy.window().then((win) =>
      win.game.actors.get(riderId).createEmbeddedDocuments("Item", [
        win.JSON.parse(win.JSON.stringify({ name: "Test Mounted Attack Spell 2", type: "spell", system: { classes: ["fighter"], level: 0, attack: true } }))
      ])
    );
    cy.window().then((win) => {
      const item = win.game.actors.get(riderId).items.find((i) => i.name === "Test Mounted Attack Spell 2");
      cy.get(`.application.character li[data-item-id="${item.id}"] button[data-action="castSpell"]`).click();
    });
    lastMessage().then((message) => {
      expect(message.formula, "pas d'avantage (même taille que la monture)").to.not.include("2d20");
    });
  });

  it("jet de sauvegarde de Dextérité monté : rappel textuel mentionnant la monture", () => {
    cy.openActorSheet(riderId);
    resetMessageBaseline();
    cy.get('nav.tabs [data-tab="stats"]').click();
    cy.get('[data-action="rollSave"][data-key="dex"]').click();
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Roll.MountedDexSaveNote", { mount: "War Horse" }))
      .then((expected) => {
        lastMessage().then((message) => {
          expect(message.flavor).to.include(expected);
        });
      });
  });

  it("jet de sauvegarde de Force monté : aucun rappel (clause Dextérité uniquement)", () => {
    cy.openActorSheet(riderId);
    resetMessageBaseline();
    cy.get('nav.tabs [data-tab="stats"]').click();
    cy.get('[data-action="rollSave"][data-key="str"]').click();
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Roll.MountedDexSaveNote", { mount: "War Horse" }))
      .then((unexpected) => {
        lastMessage().then((message) => {
          expect(message.flavor).to.not.include(unexpected);
        });
      });
  });
});
