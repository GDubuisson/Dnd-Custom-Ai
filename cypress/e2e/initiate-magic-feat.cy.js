// Implémente le don "Magie d'initié", dernier des 10 dons sans automatisation mécanique
// (ANOMALIES_ACTIVES.md) : choix en 2 étapes (classe lanceuse, puis 2 tours de magie + 1 sort de
// niveau 1 de cette classe), plutôt qu'un simple bonus dérivé — cf. chooseInitiateMagicSpells
// (helpers/initiate-magic-choice.js), #onChooseInitiateMagic/#onCastSpell (actor-sheet.js).
// Cadré avec l'utilisateur le 2026-08-22 : automatise aussi la règle SRD annexe (le sort de
// niveau 1 se lance GRATUITEMENT une fois par repos long, sans dépenser d'emplacement — au-delà,
// redevient un sort normal).
//
// Personnage Guerrier (aucun emplacement de sort propre, jamais 0/0 pour aucun palier) : preuve
// déterministe que le premier cast du sort de niveau 1 réussit malgré ça (bonus du don), et que
// le second cast échoue normalement (plus de charge gratuite, aucun emplacement à dépenser).
//
// "Protection contre le mal et le bien" choisi explicitement comme sort de niveau 1 (plutôt que
// le 1er par défaut) : ni attaque/sauvegarde/dégâts/soin NI réaction (contrairement à "Bouclier",
// écarté ici — sa propre garde-fou de réaction/round aurait bloqué le second cast de ce test pour
// une raison totalement différente de celle testée), il tombe dans la branche générique
// d'#onCastSpell (message "lance {sort}" simple) — assertion la plus simple possible,
// structurelle (i18n), jamais de texte localisé en dur.

const createdActorIds = [];
let actorId;
let featureId;

function sheetRoot() {
  return cy.get(".application.character");
}

before(() => {
  cy.loginAsGM();
  cy.createReadyCharacter({
    name: "Initiate Feat Fighter",
    origin: "fleuraine",
    classKey: "fighter",
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    actorId = id;
    createdActorIds.push(id);
  });
});

after(() => {
  cy.loginAsGM();
  cy.window().then((win) => (createdActorIds.length ? win.Actor.deleteDocuments(createdActorIds) : null));
});

describe("Don Magie d'initié — choix en 2 étapes puis cast gratuit du sort de niveau 1", () => {
  beforeEach(() => cy.loginAsGM());

  it("octroie 2 tours de magie + 1 sort de niveau 1 de la classe choisie, cast gratuit puis normal", () => {
    cy.window()
      .then((win) =>
        win.game.actors.get(actorId).createEmbeddedDocuments("Item", [
          win.JSON.parse(
            JSON.stringify({
              name: "Magie d'initié",
              type: "feature",
              system: { offersSpellChoice: true, source: "PHB" }
            })
          )
        ])
      )
      .then((items) => {
        featureId = items[0].id;
      });

    cy.window().then((win) => win.game.actors.get(actorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();

    sheetRoot().contains("li", "Magie d'initié").find('button[data-action="chooseInitiateMagic"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Abilities.InitiateMagicClassTitle"))
      .then((title) => {
        cy.get("dialog.application.dialog[open] .window-title", { timeout: 10000 }).should("contain.text", title);
      });
    cy.get('dialog.application.dialog[open] select[name="classKey"]').select("wizard");
    cy.get('dialog.application.dialog[open] button[data-action="ok"]').click();

    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.localize("DND_CUSTOM.Abilities.InitiateMagicSpellsTitle"))
      .then((title) => {
        cy.get("dialog.application.dialog[open] .window-title", { timeout: 10000 }).should("contain.text", title);
      });
    // Cantrips laissés à leur valeur par défaut (déjà distincts, cf. chooseInitiateMagicSpells) ;
    // sort de niveau 1 choisi explicitement (cf. commentaire d'en-tête).
    cy.get('dialog.application.dialog[open] select[name="levelOneSpell"]').select("Protection contre le mal et le bien");
    cy.get('dialog.application.dialog[open] button[data-action="ok"]').click();
    cy.get("dialog.application.dialog[open]").should("not.exist");

    cy.window().should((win) => {
      const actor = win.game.actors.get(actorId);
      const feature = actor.items.get(featureId);
      expect(feature.system.chosenSpellClass, "classe choisie enregistrée").to.equal("wizard");
      expect(feature.system.chosenCantrips.length, "2 tours de magie choisis").to.equal(2);
      expect(feature.system.chosenLevelOneSpell, "sort de niveau 1 choisi").to.equal("Protection contre le mal et le bien");
      expect(feature.system.uses.max, "charge de cast gratuit réglée").to.equal(1);
      expect(feature.system.uses.value, "charge encore disponible").to.equal(1);

      const shield = actor.items.find((item) => item.type === "spell" && item.name === "Protection contre le mal et le bien");
      expect(shield, "le sort 'Protection contre le mal et le bien' a bien été octroyé sur la fiche").to.exist;
      const [cantrip1, cantrip2] = feature.system.chosenCantrips;
      for (const name of [cantrip1, cantrip2]) {
        expect(
          actor.items.find((item) => item.type === "spell" && item.name === name),
          `le tour de magie '${name}' a bien été octroyé`
        ).to.exist;
      }
    });

    // Premier cast : gratuit malgré 0 emplacement de sort (Guerrier) — preuve que le
    // contournement d'#onCastSpell fonctionne, pas juste que le sort existe sur la fiche.
    cy.window().then((win) => {
      const actor = win.game.actors.get(actorId);
      const allZero = Object.values(actor.system.spells.slots).every((slot) => slot.value === 0 && slot.max === 0);
      expect(allZero, "prérequis : le Guerrier n'a aucun emplacement de sort").to.be.true;
    });

    let messagesBefore;
    cy.window()
      .then((win) => (messagesBefore = win.game.messages.size))
      .then(() => {
        sheetRoot().contains("li", "Protection contre le mal et le bien").find('button[data-action="castSpell"]').click();
      });
    cy.window()
      .its("game.i18n")
      .then((i18n) => i18n.format("DND_CUSTOM.Chat.CastSpell", { name: "Initiate Feat Fighter", spell: "Protection contre le mal et le bien" }))
      .then((expectedContent) => {
        cy.window().should((win) => {
          expect(win.game.messages.size, "un message de cast posté (cast réussi malgré 0 emplacement)").to.equal(
            messagesBefore + 1
          );
          expect(win.game.messages.contents.at(-1).content).to.include(expectedContent);
          const feature = win.game.actors.get(actorId).items.get(featureId);
          expect(feature.system.uses.value, "charge gratuite consommée par ce cast").to.equal(0);
        });
      });

    // Second cast : plus de charge gratuite, et toujours 0 emplacement -> échoue normalement
    // (avertissement, aucun nouveau message), comme n'importe quel autre sort de niveau 1 sans
    // emplacement disponible.
    cy.window()
      .then((win) => (messagesBefore = win.game.messages.size))
      .then(() => {
        sheetRoot().contains("li", "Protection contre le mal et le bien").find('button[data-action="castSpell"]').click();
      });
    cy.window().should((win) => {
      expect(win.game.messages.size, "aucun nouveau message : cast refusé, faute d'emplacement").to.equal(
        messagesBefore
      );
    });
  });
});
