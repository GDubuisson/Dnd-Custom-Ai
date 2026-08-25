// Niveau B, cf. ClaudeFiles/MECANIQUES_A_AUTOMATISER.md (2026-08-24) : généralisation de
// `condition-immunity.js` au-delà de Rage sans esprit/Aura de dévotion (déjà couvertes par
// hunter-subclasses-extra-mechanics.cy.js). Deux nouvelles conditions homebrew (cf. config.js),
// posées manuellement par le lanceur sur sa cible (même convention que "blessed"/"guided", aucun
// décompte de durée automatique) :
// - "freedomOfMovement" (Liberté de mouvement) → immunité à Entravé, sans restriction.
// - "protectedFromEvilGood" (Protection contre le mal et le bien) → immunité à Charmé/Effrayé,
//   simplification assumée (pas de restriction par type de créature attaquante, ce système ne
//   trace l'origine d'aucune ActiveEffect — cf. commentaire de isImmuneToCondition).

const createdActorIds = [];

function createActor(win, data) {
  return win.Actor.create(win.JSON.parse(win.JSON.stringify(data))).then((actor) => {
    createdActorIds.push(actor.id);
    return actor;
  });
}

before(() => cy.loginAsGM());

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => win.Actor.deleteDocuments(createdActorIds));
});

describe("Liberté de mouvement — immunité à Entravé (Niveau B)", () => {
  let actorId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Freedom Target", type: "character", system: {} }))
      .then((actor) => {
        actorId = actor.id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("état actif : bloque une nouvelle application d'Entravé", () => {
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("freedomOfMovement", { active: true }));
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("restrained", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(actorId).statuses.has("restrained"), "Entravé bloqué par Liberté de mouvement").to.be.false;
    });
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("freedomOfMovement", { active: false }));
  });

  it("état absent : Entravé s'applique normalement", () => {
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("restrained", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(actorId).statuses.has("restrained"), "sans Liberté de mouvement, Entravé s'applique").to.be
        .true;
    });
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("restrained", { active: false }));
  });

  it("n'accorde aucune immunité à Charmé/Effrayé (portée limitée à Entravé)", () => {
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("freedomOfMovement", { active: true }));
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("frightened", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(actorId).statuses.has("frightened"), "Effrayé non couvert par Liberté de mouvement").to.be
        .true;
    });
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      return Promise.all([
        actor.toggleStatusEffect("frightened", { active: false }),
        actor.toggleStatusEffect("freedomOfMovement", { active: false })
      ]);
    });
  });
});

describe("Protection contre le mal et le bien — immunité à Charmé/Effrayé (Niveau B)", () => {
  let actorId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) => createActor(win, { name: "Protection Target", type: "character", system: {} }))
      .then((actor) => {
        actorId = actor.id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("état actif : bloque une nouvelle application de Charmé ET d'Effrayé", () => {
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("protectedFromEvilGood", { active: true }));
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("charmed", { active: true }));
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("frightened", { active: true }));
    cy.window().should((win) => {
      const actor = win.game.actors.get(actorId);
      expect(actor.statuses.has("charmed"), "Charmé bloqué").to.be.false;
      expect(actor.statuses.has("frightened"), "Effrayé bloqué").to.be.false;
    });
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("protectedFromEvilGood", { active: false }));
  });

  it("état absent : Charmé s'applique normalement", () => {
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("charmed", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(actorId).statuses.has("charmed"), "sans protection, Charmé s'applique").to.be.true;
    });
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("charmed", { active: false }));
  });

  it("n'accorde aucune immunité à Entravé (portée limitée à Charmé/Effrayé)", () => {
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("protectedFromEvilGood", { active: true }));
    cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("restrained", { active: true }));
    cy.window().should((win) => {
      expect(win.game.actors.get(actorId).statuses.has("restrained"), "Entravé non couvert par cette protection").to.be.true;
    });
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      return Promise.all([
        actor.toggleStatusEffect("restrained", { active: false }),
        actor.toggleStatusEffect("protectedFromEvilGood", { active: false })
      ]);
    });
  });
});
