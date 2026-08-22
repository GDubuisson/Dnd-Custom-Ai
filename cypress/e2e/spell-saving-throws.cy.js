// Implémente le point "sorts/capacités à jet de sauvegarde de cible" d'ANOMALIES_ACTIVES.md
// (lot testeur 2026-08-19), cadré explicitement avec l'utilisateur le 2026-08-21 : root cause
// initiale (SpellData#attack, item-data.js) documentait ce mécanisme comme "hors scope combat
// automatisé" — en réalité, le scope exclu (CONCEPTION_FONCTIONNELLE.md) ne couvre que la grille
// tactique et la réaction en pop-in générique, pas une simple comparaison déterministe à une
// valeur statique (déjà acceptée pour l'attaque vs CA, compareToTargetAc dans rollCheck).
//
// Modèle retenu (cf. SpellData#save, item-data.js ; #onCastSpell, actor-sheet.js) : au lancer,
// le système lance 1d20 + le PROPRE modificateur de sauvegarde de CHAQUE cible actuellement
// ciblée, compare au DD du lanceur, poste le résultat au nom de la cible — jamais une
// interruption du client de la cible, même niveau d'automatisation que le jet d'attaque.
//
// Spell "Test Fireball" créé directement via createEmbeddedDocuments (pas depuis le compendium
// sorts, qui ne contient pas encore de contenu à sauvegarde à cette date) : cantrip (niveau 0)
// pour ne pas dépendre de la gestion des emplacements de sorts, hors sujet ici.

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

function grantSaveSpell(win, actorId, { ability, halfOnSave, damageDice = "" }) {
  return win.game.actors.get(actorId).createEmbeddedDocuments("Item", [
    win.JSON.parse(
      JSON.stringify({
        name: "Test Fireball",
        type: "spell",
        system: {
          classes: ["wizard"],
          level: 0,
          details: "1 action, 45 m, Instantanée",
          save: { ability, halfOnSave },
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
  // Ferme la fiche du personnage qui vient d'être créé (rouverte automatiquement à la fin de
  // l'assistant) avant d'en créer un second : sinon les deux fiches restent ouvertes en même
  // temps et la fiche du premier recouvre le formulaire de l'assistant du second (piège déjà
  // documenté, cf. tab-stats.cy.js > "Aptitudes multiples").
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

    // Force un 20 naturel pour le d20 de sauvegarde de la cible : total = 20 + son modificateur,
    // qui doit dépasser un DD de sort de niveau 1-5 dans tous les cas raisonnables — réussite
    // garantie sans avoir à deviner le DD à l'avance.
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

    // Assertions purement structurelles (jamais un extrait de texte localisé en dur, cf.
    // wizard.cy.js > loadStringsForActiveLocale — le monde de test peut tourner dans une langue
    // différente du français) : bon interlocuteur, bon total de jet, réussite mathématiquement
    // cohérente avec le DD réel.
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

    // 1 naturel : le total (1 + modificateur de la cible, potentiellement négatif) ne peut pas
    // dépasser un DD de sort réaliste — échec garanti.
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

  // Régression 2026-08-22 : NpcData (forme volontairement simplifiée, cf. npc-data.js) n'a NI
  // `.total` sur ses abilities (juste `.mod`, déjà le bonus final) NI de champ `saves` du tout —
  // targetSaveModifier (rules.js) plantait en TypeError sur ce cas, pourtant le plus courant en
  // jeu (un sort à sauvegarde vise en général un monstre). Corrigé en détectant l'absence de
  // `.total` pour retomber directement sur le mod. du PNJ, même convention que le bouton "Sauv"
  // manuel de la fiche PNJ (npc-sheet.js).
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
