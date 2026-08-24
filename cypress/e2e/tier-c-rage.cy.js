// Chantier "Niveau C" (2026-08-24, sur demande explicite après revue de
// ClaudeFiles/MECANIQUES_A_AUTOMATISER.md) : première mécanique automatisée du Niveau C — Rage
// (Barbare, SRD 5e). L'état "raging" existait déjà (décompte de durée par round, Frénésie/Rage
// sans esprit/Instincts du totem déjà branchés dessus, cf. tier-a-mechanics.cy.js et
// hunter-subclasses-extra-mechanics.cy.js) ; ce chantier ajoute les 3 effets qui manquaient tant
// que l'état est actif, sans dépendre de la possession de la Capacité "Rage" elle-même (même
// philosophie que les autres bascules homebrew comme "blessed"/"guided" — l'automatisation lit
// l'état, pas la Capacité qui l'a posé) :
// - avantage aux tests ET sauvegardes de Force (conditionRollEffects, actor-sheet.js)
// - +2 dégâts aux attaques d'arme de CORPS À CORPS utilisant la Force (#onRollWeaponDamage) —
//   comparé à strMod (et non simplement "arme de corps à corps") pour exclure le cas d'une arme
//   Finesse effectivement jouée en Dextérité, cf. commentaire du code
// - résistance aux dégâts contondants/perforants/tranchants (isResistantToDamageType,
//   dnd-custom-ai.js)

const createdActorIds = [];
const createdSceneItemIds = [];

function sheetRoot() {
  return cy.get(".application.character");
}

function goToTab(tabId) {
  sheetRoot().find(`nav.tabs [data-tab="${tabId}"]`).click();
  sheetRoot().find(`section.tab[data-tab="${tabId}"]`).should("have.class", "active");
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

function toggleRaging(actorId, active) {
  return cy.window().then((win) => win.game.actors.get(actorId).toggleStatusEffect("raging", { active }));
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
        id: message.id,
        formula: (message.rolls?.[0]?.formula ?? "").replace(/\s+/g, ""),
        total: message.rolls?.[0]?.total
      };
    });
}

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [win.Actor.deleteDocuments(createdActorIds)];
    if (createdSceneItemIds.length) cleanup.push(win.canvas.scene.deleteEmbeddedDocuments("Token", createdSceneItemIds));
    return Promise.all(cleanup);
  });
});

describe("Rage — avantage aux tests/sauvegardes de Force", () => {
  let barbarianId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Rage Advantage Barbarian",
          type: "character",
          system: { class: "barbarian", abilities: { str: { value: 16 }, dex: { value: 12 } } }
        })
      )
      .then((actor) => {
        barbarianId = actor.id;
      });
  });

  beforeEach(() => cy.loginAsGM());

  it("hors Rage : jet de Force normal, sans avantage (T-TIERC-RAGE-001)", () => {
    cy.openActorSheet(barbarianId);
    goToTab("stats");
    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "pas d'avantage hors Rage").to.match(/^1d20/);
    });
  });

  it("en Rage : jet de Force en avantage (2d20kh1), test de Dextérité et sauvegarde de Force (T-TIERC-RAGE-002)", () => {
    toggleRaging(barbarianId, true);
    cy.window().should((win) => {
      expect(win.game.actors.get(barbarianId).statuses.has("raging"), "Rage activée").to.be.true;
    });

    cy.openActorSheet(barbarianId);
    goToTab("stats");

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "avantage au test de Force en Rage").to.include("2d20kh1");
    });

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAbility"][data-key="dex"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "aucun avantage sur un test qui n'est pas de Force").to.match(/^1d20/);
    });

    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollSave"][data-key="str"]').click();
    lastMessage().then((roll) => {
      expect(roll.formula, "avantage à la sauvegarde de Force en Rage").to.include("2d20kh1");
    });

    toggleRaging(barbarianId, false);
  });
});

describe("Rage — +2 dégâts aux attaques de corps à corps à la Force", () => {
  let barbarianId;

  before(() => {
    cy.loginAsGM();
    cy.window()
      .then((win) =>
        createActor(win, {
          name: "Rage Damage Barbarian",
          type: "character",
          system: { class: "barbarian", abilities: { str: { value: 16 } } }
        })
      )
      .then((actor) => {
        barbarianId = actor.id;
      });
    cy.window().then((win) =>
      createItem(win, barbarianId, {
        name: "Test Rage Axe",
        type: "weapon",
        system: { equipped: true, weaponType: "meleeMartial", damage: { dice: "1d8", type: "slashing" } }
      })
    );
  });

  beforeEach(() => cy.loginAsGM());

  it("+2 dégâts ajoutés au jet uniquement quand l'état 'raging' est actif (T-TIERC-RAGE-003)", () => {
    cy.window().then((win) => {
      const strMod = win.game.actors.get(barbarianId).system.abilities.str.mod;
      const baseFormula = `1d8${strMod >= 0 ? "+" + strMod : strMod}`;

      cy.openActorSheet(barbarianId);
      goToTab("equipment");
      resetMessageBaseline();
      cy.get(".equipment-slot").eq(0).find(".equipment-roll-btn-damage").click();
      lastMessage().then((roll) => {
        expect(roll.formula, "hors Rage : pas de bonus").to.equal(baseFormula);
      });

      toggleRaging(barbarianId, true);
      cy.window().should((w) => {
        expect(w.game.actors.get(barbarianId).statuses.has("raging"), "Rage activée").to.be.true;
      });

      resetMessageBaseline();
      cy.get(".equipment-slot").eq(0).find(".equipment-roll-btn-damage").click();
      lastMessage().then((roll) => {
        expect(roll.formula, "en Rage : +2 supplémentaire").to.equal(`${baseFormula}+2`);
      });

      toggleRaging(barbarianId, false);
    });
  });
});

describe("Rage — résistance aux dégâts contondants/perforants/tranchants", () => {
  let attackerId;

  before(() => {
    cy.loginAsGM();
    // PNJ (pas un second "character") : dnd-custom-ai.js > applyDamageToTargets bloque tout
    // dégât d'un "character" vers un AUTRE "character" (PvP bloqué) — même contournement que
    // "Affinité de la tempête" (tier-a-mechanics.cy.js).
    cy.window()
      .then((win) =>
        win.Actor.create(
          win.JSON.parse(
            win.JSON.stringify({
              name: "Rage Resist Attacker",
              type: "npc",
              system: { attack: { ability: "str", bonus: 5, damage: { dice: "10", bonus: 0, type: "slashing" } } }
            })
          )
        )
      )
      .then((actor) => {
        attackerId = actor.id;
        createdActorIds.push(actor.id);
      });
  });

  beforeEach(() => cy.loginAsGM());

  // Un acteur DIFFÉRENT par test, sans PV forcés à la création (retour de test) :
  // `system.attributes.hp.max` est DÉRIVÉ de classe/niveau (CharacterData#prepareDerivedData,
  // maxHitPoints) et se recalcule à CHAQUE update — un override manuel de `hp.value`/`hp.max` à
  // la création survit jusqu'au premier `Actor#update` quelconque, puis se fait silencieusement
  // écraser par le vrai max dérivé (12 pour un Barbare niveau 1, dé de vie d12) : le garde-fou
  // `dndCustomHpClamp` (dnd-custom-ai.js) clampe alors `hp.value` dessus, faussant tout calcul
  // basé sur un PV de départ imaginaire. Un acteur frais par test (PV par défaut, 10, sous le
  // max réel de 12) évite complètement ce piège plutôt que de forcer un total artificiel.
  function createResistBarbarian(win) {
    return createActor(win, { name: "Rage Resist Barbarian", type: "character", system: { class: "barbarian" } }).then(
      (actor) => createToken(win, actor.id, 100, 100).then((tokenId) => ({ actorId: actor.id, tokenId }))
    );
  }

  it("hors Rage : dégâts tranchants reçus intégralement (T-TIERC-RAGE-004)", () => {
    let barbarianId;
    let hpBefore;
    cy.window()
      .then((win) => createResistBarbarian(win))
      .then(({ actorId, tokenId }) => {
        barbarianId = actorId;
        cy.window().then((win) => {
          hpBefore = win.game.actors.get(actorId).system.attributes.hp.value;
          win.game.actors.get(attackerId).sheet.render(true);
        });
        cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
        targetToken(tokenId);
      });
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    cy.get('button[data-action="rollAttackDamage"]').click();
    lastMessage().then((roll) => {
      const rolledTotal = roll.total;
      cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      // Ciblage par data-message-id + .first() (pas .last() sur .chat-message) : Foundry affiche
      // aussi une notification "toast" éphémère du même message, avec son propre bouton (même
      // data-message-id sur les deux) — seule l'entrée du journal (la première dans le DOM)
      // reste après coup, .last() sur .chat-message peut aussi résoudre vers un ancien message
      // d'un run précédent (le monde de test est persistant entre les runs).
      cy.get(`[data-message-id="${roll.id}"]`, { timeout: 10000 }).first().find("button.dnd-apply-damage-btn").click();
      cy.window().should((win) => {
        expect(win.game.actors.get(barbarianId).system.attributes.hp.value, "hors Rage : dégâts intégraux").to.equal(
          hpBefore - rolledTotal
        );
      });
    });
  });

  it("en Rage : dégâts tranchants réduits de moitié (T-TIERC-RAGE-005)", () => {
    let barbarianId;
    let hpBefore;
    cy.window()
      .then((win) => createResistBarbarian(win))
      .then(({ actorId, tokenId }) => {
        barbarianId = actorId;
        toggleRaging(actorId, true);
        cy.window().should((win) => {
          expect(win.game.actors.get(actorId).statuses.has("raging"), "Rage activée").to.be.true;
        });
        cy.window().then((win) => {
          hpBefore = win.game.actors.get(actorId).system.attributes.hp.value;
          win.game.actors.get(attackerId).sheet.render(true);
        });
        cy.get(".application.npc input.actor-name", { timeout: 15000 }).should("be.visible");
        targetToken(tokenId);
      });
    resetMessageBaseline();
    cy.get('button[data-action="rollAttack"]').click();
    cy.get('button[data-action="rollAttackDamage"]').click();
    lastMessage().then((roll) => {
      const rolledTotal = roll.total;
      cy.window().then((win) => win.game.actors.get(attackerId).sheet.close());
      cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
      cy.get(`[data-message-id="${roll.id}"]`, { timeout: 10000 }).first().find("button.dnd-apply-damage-btn").click();
      cy.window().should((win) => {
        expect(win.game.actors.get(barbarianId).system.attributes.hp.value, "en Rage : moitié des dégâts subie").to.equal(
          hpBefore - Math.floor(rolledTotal / 2)
        );
      });
    });
  });
});
