// Implémente la section 10 (T-NPC-001 à T-NPC-005) de tests/E2E_TEST_PLAN.md — fiche PNJ
// (npc-sheet.js, npc-*.hbs). Réutilisée telle quelle pour le type "mount" (cf. commentaire de
// classe DndCustomNpcSheet) : pas testé séparément ici, même fiche/mêmes handlers.
//
// Toutes les interactions de fiche PNJ (jets, bascule d'état, Initiative, XP) sont réservées au
// MJ dans ce système — contrairement à la fiche personnage, un PNJ n'a normalement pas de
// propriétaire Joueur (cf. npc-sheet.hbs > `{{#if isGM}}` pour le bouton XP). Toute la section
// tourne donc en session MJ, sans déroger à la convention "Joueur par défaut" du plan (qui ne
// s'applique qu'aux scénarios où le rôle a un sens).

const createdActorIds = [];
const createdCombatIds = [];
let npcActorId;

function sheetRoot() {
  return cy.get(".application.npc");
}

function openSheet(actorId) {
  cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
  return sheetRoot().should("be.visible");
}

before(() => {
  cy.loginAsGM();
  cy.window()
    .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "Recon Goblin", type: "npc" }))))
    .then((actor) => {
      npcActorId = actor.id;
      createdActorIds.push(actor.id);
    });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => {
    const cleanup = [];
    if (createdCombatIds.length) cleanup.push(win.Combat.deleteDocuments(createdCombatIds));
    if (createdActorIds.length) cleanup.push(win.Actor.deleteDocuments(createdActorIds));
    return Promise.all(cleanup);
  });
});

describe("Fiche PNJ, session MJ", () => {
  beforeEach(() => {
    cy.loginAsGM();
    openSheet(npcActorId);
  });

  it("navigue entre les 3 onglets Statistiques/Capacités/Butin (T-NPC-001)", () => {
    const tabs = ["stats", "abilities", "loot"];
    sheetRoot().find('section.tab[data-tab="stats"]').should("have.class", "active");

    tabs
      .filter((tab) => tab !== "stats")
      .forEach((tab) => {
        sheetRoot().find(`nav.tabs [data-tab="${tab}"]`).click();
        sheetRoot().find(`section.tab[data-tab="${tab}"]`).should("have.class", "active").and("be.visible");
      });
  });

  it("jet de caractéristique poste 1d20 + le modificateur en chat (T-NPC-002)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(npcActorId);
      const mod = actor.system.abilities.str.mod;
      const modLabel = mod >= 0 ? `+${mod}` : `${mod}`;
      const before = win.game.messages.size;

      sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();

      cy.window().should((win2) => {
        expect(win2.game.messages.size, "un nouveau message de jet doit être posté").to.be.greaterThan(before);
        const message = win2.game.messages.contents.at(-1);
        expect((message.rolls[0]?.formula ?? "").replace(/\s+/g, "")).to.equal(`1d20${modLabel}`);
      });
    });
  });

  it("bascule d'un état : l'ActiveEffect est créée puis retirée (T-NPC-003)", () => {
    // Liste déroulante repliée par défaut (retour de test, cf. tab-stats.cy.js > T-STATS-015) :
    // rouverte avant chaque clic, un re-render complet suivant chaque bascule.
    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(npcActorId).statuses.has("poisoned"), "état actif après le 1er clic").to.be.true;
    });
    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleCondition"][data-key="poisoned"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(npcActorId).statuses.has("poisoned"), "état retiré après le 2e clic").to.be.false;
    });
  });

  it("jet d'Initiative crée/mets à jour un Combattant sur le combat en cours (T-NPC-004)", () => {
    cy.window().then((win) => {
      if (win.game.combat) return null;
      return win.Combat.create(win.JSON.parse(win.JSON.stringify({ scene: win.canvas.scene.id, active: true }))).then(
        (combat) => {
          createdCombatIds.push(combat.id);
        }
      );
    });

    sheetRoot().find('button[data-action="rollInitiative"]').click();

    cy.window({ timeout: 10000 }).should((win) => {
      const combatant = win.game.combat?.combatants.find((c) => c.actor?.id === npcActorId);
      expect(combatant, "un Combattant doit exister pour ce PNJ").to.exist;
      expect(combatant.initiative, "le Combat Tracker doit afficher un résultat").to.be.a("number");
    });
  });

  it("octroie l'XP rapporté aux personnages cochés dans la boîte de dialogue (T-NPC-005)", () => {
    let playerActorId;
    let xpBefore;

    cy.window()
      .then((win) => win.Actor.create(win.JSON.parse(win.JSON.stringify({ name: "PERM XP Recipient", type: "character" }))))
      .then((actor) => {
        playerActorId = actor.id;
        createdActorIds.push(actor.id);
        return cy.window().then((win) => {
          xpBefore = actor.system.xp;
          return actor.update(win.JSON.parse(win.JSON.stringify({ "system.xp": 0 })), { dndCustomWizard: true });
        });
      });

    cy.window().then((win) =>
      win.game.actors.get(npcActorId).update(win.JSON.parse(win.JSON.stringify({ "system.xpReward": 50 })))
    );
    openSheet(npcActorId);

    sheetRoot().find('button[data-action="awardXp"]').click();

    cy.get('dialog.application.dialog input[name="amount"]', { timeout: 10000 }).should("have.value", "50");
    // Assure que le personnage créé pour ce test est bien coché (déjà le cas par défaut, cf.
    // openAwardXpDialog > `checked` posé sur chaque ligne) et confirme.
    cy.window()
      .then((win) => win.document.querySelector(`dialog.application.dialog input[name="actor"][value="${playerActorId}"]`))
      .should("exist");
    cy.get('dialog.application.dialog button[data-action="ok"]').click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(playerActorId);
      expect(actor.system.xp, "l'XP rapporté (50) doit avoir été ajouté").to.equal(50);
    });
  });

  // Retour de test (2026-08-16) : nom/PV toujours visibles par défaut, "quels que soient les
  // tokens" (dixit le retour) — pas seulement les personnages joueurs. Le hook `preCreateActor`
  // qui pose ces valeurs (dnd-custom-ai.js) n'est pas restreint par type d'Actor, contrairement
  // à `prototypeToken.actorLink` (cf. commentaire du hook) qui ne concerne que les PJ.
  it("configure le token PNJ (nom/PV toujours visibles) dès sa création (T-NPC-006)", () => {
    cy.window().should((win) => {
      const actor = win.game.actors.get(npcActorId);
      expect(actor.prototypeToken.displayName).to.equal(win.CONST.TOKEN_DISPLAY_MODES.ALWAYS);
      expect(actor.prototypeToken.displayBars).to.equal(win.CONST.TOKEN_DISPLAY_MODES.ALWAYS);
      expect(actor.prototypeToken.bar1.attribute).to.equal("attributes.hp");
    });
  });

  // Retour de test (lot 3, point 6 "Fiche PNJ") : impossible d'attaquer avec un PNJ jusqu'ici —
  // profil d'attaque simplifié (NpcData#attack, npc-data.js), configuré ici par le MJ (Force,
  // bonus +2, dégâts 1d6+1 tranchant), vérifie le jet d'attaque (1d20 + mod Force + bonus) et de
  // dégâts (dé + mod Force + bonus), même mécanique que #onRollWeaponAttack/#onRollWeaponDamage
  // côté fiche personnage (rollCheck/rollDamage, rolls.js).
  it("jet d'attaque et de dégâts du profil simplifié, dégâts doublés sur coup critique (T-NPC-007)", () => {
    cy.window().then((win) =>
      win.game.actors.get(npcActorId).update(
        win.JSON.parse(
          win.JSON.stringify({
            "system.attack": { name: "Griffe", ability: "str", bonus: 2, damage: { dice: "1d6", bonus: 1, type: "slashing" } }
          })
        )
      )
    );
    openSheet(npcActorId);

    cy.window().then((win) => {
      const strMod = win.game.actors.get(npcActorId).system.abilities.str.mod;
      const expectedBonus = strMod + 2;
      const before = win.game.messages.size;

      sheetRoot().find('button[data-action="rollAttack"]').click();

      cy.window().should((win2) => {
        expect(win2.game.messages.size, "un nouveau message de jet doit être posté").to.be.greaterThan(before);
        const message = win2.game.messages.contents.at(-1);
        expect((message.rolls[0]?.formula ?? "").replace(/\s+/g, "")).to.equal(
          `1d20${expectedBonus >= 0 ? "+" : ""}${expectedBonus}`
        );
        expect(message.flavor).to.include("Griffe");
      });
    });

    cy.window().then((win) => {
      const strMod = win.game.actors.get(npcActorId).system.abilities.str.mod;
      const expectedBonus = strMod + 1;
      const before = win.game.messages.size;

      sheetRoot().find('button[data-action="rollAttackDamage"]').should("exist").click();

      cy.window().should((win2) => {
        expect(win2.game.messages.size).to.be.greaterThan(before);
        const message = win2.game.messages.contents.at(-1);
        expect((message.rolls[0]?.formula ?? "").replace(/\s+/g, "")).to.equal(
          `1d6${expectedBonus >= 0 ? "+" : ""}${expectedBonus}`
        );
      });
    });

    // Coup critique posé directement (plutôt que d'attendre un 20 naturel aléatoire) : vérifie
    // seulement le branchement du flag transitoire sur l'Actor (cf. #onRollAttack/
    // #onRollAttackDamage, npc-sheet.js) — le doublement des dés lui-même (Roll#alter) est déjà
    // couvert ailleurs (combat-criticals.cy.js) pour la mécanique partagée rollDamage.
    cy.window().then((win) => win.game.actors.get(npcActorId).setFlag("dnd-custom-ai", "pendingAttackCritical", true));
    cy.window().then((win) => {
      const before = win.game.messages.size;
      sheetRoot().find('button[data-action="rollAttackDamage"]').click();
      cy.window().should((win2) => {
        expect(win2.game.messages.size).to.be.greaterThan(before);
        const message = win2.game.messages.contents.at(-1);
        expect(message.rolls[0]?.formula ?? "", "dé doublé sur coup critique (2d6)").to.match(/^2d6/);
        expect(win2.game.actors.get(npcActorId).getFlag("dnd-custom-ai", "pendingAttackCritical"), "flag consommé après usage").to.be.undefined;
      });
    });

    // Remet le profil d'attaque à vide pour ne pas fausser un futur run de cette spec.
    cy.window().then((win) =>
      win.game.actors.get(npcActorId).update(
        win.JSON.parse(
          win.JSON.stringify({ "system.attack": { name: "", ability: "str", bonus: 0, damage: { dice: "", bonus: 0, type: "" } } })
        )
      )
    );
  });
});
