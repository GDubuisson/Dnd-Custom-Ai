// Sorts à sauvegarde : jet automatique de chaque cible (1d20 + son modificateur) contre le DD,
// au nom de la cible. Tour de magie de test créé sur l'Actor.

const createdActorIds = [];
const createdSceneItemIds = [];
let casterId;
let targetId;
let targetTokenId;

function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}
function proficiencyBonusFor(level) {
  return Math.ceil(level / 4) + 1;
}

function grantSaveSpell(win, actorId, { ability, halfOnSave, damageDice = "", appliesCondition = "", name = "Test Fireball" }) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [
    win.JSON.parse(
      JSON.stringify({
        name,
        type: "spell",
        system: {
          classes: ["wizard"],
          level: 0,
          details: "1 action, 45 m, Instantanée",
          save: { ability, halfOnSave, appliesCondition },
          damage: { dice: damageDice, type: damageDice ? "fire" : "" }
        }
      })
    )
  ]);
}

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Save Caster",
    origin: "ashar",
    classKey: "wizard",
    skills: ["arcana", "investigation"]
  }).then((id) => {
    casterId = id;
    createdActorIds.push(id);
  });
  // Ferme la fiche avant de créer un second personnage.
  cy.window().then((win) => win.game.actors.get(casterId).sheet.close());
  cy.createReadyCharacter({
    name: "Save Target",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    targetId = id;
    createdActorIds.push(id);
  });
  cy.window()
    .then((win) => win.game.actors.get(targetId).getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 450, y: 450 }))))
    .then((tokenDoc) =>
      cy.window().then((win) =>
        win.canvas.scene.createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))]).then((tokens) => {
          targetTokenId = tokens[0].id;
          createdSceneItemIds.push(targetTokenId);
        })
      )
    );
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    if (createdActorIds.length) cleanup.push(win.Actor.deleteDocuments(createdActorIds));
    return Promise.all(cleanup);
  });
});

describe("Sort à sauvegarde de la cible — auto-jet côté lanceur", () => {
  beforeEach(() => cy.loginAsGM());

  it("réussite (halfOnSave) : jette POUR la cible, compare au DD, message posté au nom de la cible", () => {
    cy.window().then((win) => grantSaveSpell(win, casterId, { ability: "dex", halfOnSave: true, damageDice: "2d6" }));
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));

    let expectedDc;
    let expectedTargetMod;
    cy.window().then((win) => {
      const caster = win.game.actors.get(casterId);
      const intMod = abilityModifier(caster.system.abilities.int.total);
      expectedDc = 8 + proficiencyBonusFor(caster.system.attributes.level) + intMod;

      const targetActor = win.game.actors.get(targetId);
      const dexMod = abilityModifier(targetActor.system.abilities.dex.total);
      const proficient = targetActor.system.saves.dex.proficient;
      expectedTargetMod = dexMod + (proficient ? proficiencyBonusFor(targetActor.system.attributes.level) : 0);
    });

    // 20 naturel : réussite garantie.
    cy.forceD20(20);
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character")
      .find('nav.tabs [data-tab="abilities"]')
      .click();
    cy.get(".application.character")
      .contains("li", "Test Fireball")
      .find('button[data-action="castSpell"]')
      .click();

    // Assertions structurelles, indépendantes de la locale.
    cy.window().should((win) => {
      const message = win.game.messages.contents.at(-1);
      expect(message.speaker.actor, "message posté au nom de la CIBLE, pas du lanceur").to.equal(targetId);
      expect(message.rolls[0].total, "20 naturel + propre modificateur de la cible").to.equal(20 + expectedTargetMod);
      expect(message.rolls[0].total, "un 20 naturel doit dépasser le DD d'un sort de si bas niveau").to.be.at.least(
        expectedDc
      );
      expect(message.flavor, "le nom de la cible doit apparaître dans le message").to.include("Save Target");
    });
  });

  it("échec : jet forcé au minimum, message d'échec posté", () => {
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));
    let expectedDc;
    cy.window().then((win) => {
      const caster = win.game.actors.get(casterId);
      const intMod = abilityModifier(caster.system.abilities.int.total);
      expectedDc = 8 + proficiencyBonusFor(caster.system.attributes.level) + intMod;
    });

    // 1 naturel : échec garanti.
    cy.forceD20(1);
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character")
      .find('nav.tabs [data-tab="abilities"]')
      .click();
    cy.get(".application.character")
      .contains("li", "Test Fireball")
      .find('button[data-action="castSpell"]')
      .click();

    cy.window().should((win) => {
      const message = win.game.messages.contents.at(-1);
      expect(message.speaker.actor, "message posté au nom de la CIBLE").to.equal(targetId);
      expect(message.rolls[0].total, "1 naturel doit rester sous le DD (échec)").to.be.below(expectedDc);
    });
  });

  it("aucune cible sélectionnée : aucun jet automatique, message informatif seul (DD affiché)", () => {
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(false, { releaseOthers: true }));
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character")
      .find('nav.tabs [data-tab="abilities"]')
      .click();

    cy.window().then((win) => (win.game.messages.size));
    cy.window()
      .its("game.messages.size")
      .then((before) => {
        cy.get(".application.character")
          .contains("li", "Test Fireball")
          .find('button[data-action="castSpell"]')
          .click();
        cy.window().should((win) => {
          expect(win.game.messages.size, "un seul nouveau message, informatif").to.equal(before + 1);
          const message = win.game.messages.contents.at(-1);
          expect(message.speaker.actor, "message informatif posté au nom du LANCEUR, pas d'une cible").to.equal(casterId);
        });
      });
  });

  // Cible PNJ : sauvegarde avec son bonus direct.
  it("cible PNJ (NpcData) : jette avec le mod. direct, sans planter (régression 2026-08-22)", () => {
    let npcId;
    let npcTokenId;

    cy.window()
      .then((win) =>
        win.Actor.create(
          win.JSON.parse(JSON.stringify({ name: "Save Target NPC", type: "npc", system: { abilities: { dex: { mod: 4 } } } }))
        )
      )
      .then((actor) => {
        npcId = actor.id;
        createdActorIds.push(npcId);
      });
    cy.window()
      .then((win) => win.game.actors.get(npcId).getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 500, y: 500 }))))
      .then((tokenDoc) =>
        cy.window().then((win) =>
          win.canvas.scene.createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))]).then((tokens) => {
            npcTokenId = tokens[0].id;
            createdSceneItemIds.push(npcTokenId);
          })
        )
      );
    cy.window().then((win) => win.canvas.tokens.get(npcTokenId).setTarget(true, { releaseOthers: true }));

    cy.forceD20(20);
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character")
      .find('nav.tabs [data-tab="abilities"]')
      .click();
    cy.get(".application.character")
      .contains("li", "Test Fireball")
      .find('button[data-action="castSpell"]')
      .click();

    cy.window().should((win) => {
      const message = win.game.messages.contents.at(-1);
      expect(message.speaker.actor, "message posté au nom du PNJ cible").to.equal(npcId);
      expect(message.rolls[0].total, "20 naturel + mod. direct du PNJ (pas de .total/.saves à lire)").to.equal(24);
    });
  });
});

// Sort à sauvegarde avec état appliqué sur échec, sans restriction de type de créature.
describe("Sort à sauvegarde de la cible — appliesCondition (Niveau B)", () => {
  beforeEach(() => cy.loginAsGM());

  it("échec du jet (1 naturel) : la condition configurée est appliquée à la cible", () => {
    cy.window().then((win) =>
      grantSaveSpell(win, casterId, { ability: "wis", appliesCondition: "paralyzed", name: "Test Hold Person" })
    );
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).actor.toggleStatusEffect("paralyzed", { active: false }));
    cy.forceD20(1);
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character").find('nav.tabs [data-tab="abilities"]').click();
    cy.get(".application.character").contains("li", "Test Hold Person").find('button[data-action="castSpell"]').click();

    cy.window().should((win) => {
      const target = win.canvas.tokens.get(targetTokenId).actor;
      expect(target.statuses.has("paralyzed"), "condition configurée appliquée sur échec").to.be.true;
    });
  });

  it("réussite du jet (20 naturel) : aucune condition appliquée", () => {
    cy.window().then((win) =>
      grantSaveSpell(win, casterId, { ability: "wis", appliesCondition: "paralyzed", name: "Test Hold Person Success" })
    );
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).actor.toggleStatusEffect("paralyzed", { active: false }));
    cy.forceD20(20);
    cy.window().then((win) => win.canvas.tokens.get(targetTokenId).setTarget(true, { releaseOthers: true }));
    cy.window().then((win) => win.game.actors.get(casterId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    cy.get(".application.character").find('nav.tabs [data-tab="abilities"]').click();
    cy.get(".application.character")
      .contains("li", "Test Hold Person Success")
      .find('button[data-action="castSpell"]')
      .click();

    cy.window().should((win) => {
      const target = win.canvas.tokens.get(targetTokenId).actor;
      expect(target.statuses.has("paralyzed"), "aucun effet en cas de réussite").to.be.false;
    });
  });
});
