// T-STATS-001 à 023 : onglet Statistiques (jets, repos, états, Épuisement, agonie). Avantage/désavantage
// vérifiés par la formule du jet ; dés de sauvegarde contre la mort forcés par cy.forceD20.
// Personnage partagé, sauf scénarios nécessitant une classe ou un état d'agonie isolé.

const createdActorIds = [];
const createdCombatIds = [];
let sharedActorId;

// Formules de rules.js pour calculer le résultat attendu.
function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}
function proficiencyBonusFor(level) {
  return Math.ceil(level / 4) + 1;
}
function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function sheetRoot() {
  return cy.get(".application.character");
}

function updateActor(win, actor, data, options = {}) {
  return actor.update(win.JSON.parse(win.JSON.stringify(data)), options);
}

// Formule du dernier nouveau message de jet (sans espaces), attendue via `should()` ;
// `knownMessageCount` garantit un message réellement nouveau.
let knownMessageCount = null;
function resetMessageBaseline() {
  return cy.window().its("game.messages.size").then((size) => {
    knownMessageCount = size;
  });
}
function lastMessageRoll() {
  return cy
    .window()
    .should((win) => {
      expect(win.game.messages.size, "un nouveau message de jet doit être posté").to.be.greaterThan(knownMessageCount);
    })
    .then((win) => {
      knownMessageCount = win.game.messages.size;
      const message = win.game.messages.contents.at(-1);
      return {
        formula: (message.rolls[0]?.formula ?? "").replace(/\s+/g, ""),
        total: message.rolls[0]?.total,
        content: message.content,
        flavor: message.flavor
      };
    });
}

function lastMessageCount() {
  return cy.window().then((win) => win.game.messages.size);
}

before(() => {
  cy.loginAsPlayer();
  cy.createReadyCharacter({
    name: "Tab Stats Fighter",
    origin: "ravenmoor", // avantage d'Origine sur investigation/perception (T-STATS-005)
    classKey: "fighter", // maîtrise str/con (T-STATS-004), armure de départ à désavantage Discrétion (T-STATS-006),
    // Second souffle : recharge « shortRest ».
    skills: ["athletics", "intimidation"]
  }).then((id) => {
    sharedActorId = id;
    createdActorIds.push(id);
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

describe("Onglet Statistiques — jets de dés", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    resetMessageBaseline();
  });

  it("jet de caractéristique simple (T-STATS-001)", () => {
    cy.window().then((win) => {
      const mod = abilityModifier(win.game.actors.get(sharedActorId).system.abilities.str.total);
      sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula).to.equal(`1d20${formatModifier(mod)}`);
        expect(roll.total).to.be.within(1 + mod, 20 + mod);
      });
    });
  });

  it("compétence : abréviation localisée de la caractéristique, pas le nom complet ni la clé technique (anomalie 2026-08-19)", () => {
    // Athlétisme, lié à la Force.
    let expectedShort, fullName, athleticsLabel;
    cy.window().then((win) => {
      expectedShort = win.game.i18n.localize("DND_CUSTOM.Abilities.Short.str");
      fullName = win.game.i18n.localize("DND_CUSTOM.Abilities.str");
      athleticsLabel = win.game.i18n.localize("DND_CUSTOM.Skills.athletics");
    });
    cy.then(() => {
      sheetRoot()
        .find(".skill")
        .then(($skills) => {
          const $skillRow = $skills.filter((_, li) => li.textContent.includes(athleticsLabel)).first();
          const tag = $skillRow.find(".ability-tag").text().trim();
          expect(tag, `attendu "(${expectedShort})", obtenu "${tag}"`).to.equal(`(${expectedShort})`);
          expect(tag, "ne doit plus afficher le nom complet de la caractéristique").not.to.include(fullName);
          expect(tag, "ne doit jamais afficher la clé technique brute").not.to.equal("(str)");
        });
    });
  });

  it("jet de caractéristique avec avantage, Maj-clic (T-STATS-002)", () => {
    sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click({ shiftKey: true });
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kh1"));
  });

  it("jet de caractéristique avec désavantage, Ctrl-clic (T-STATS-003)", () => {
    sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click({ ctrlKey: true });
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kl1"));
  });

  it("jet de sauvegarde — bonus de maîtrise appliqué seulement si maîtrisée (T-STATS-004)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const level = actor.system.attributes.level;
      const strMod = abilityModifier(actor.system.abilities.str.total);
      const prof = proficiencyBonusFor(level);
      expect(actor.system.saves.str.proficient, "prérequis : fighter maîtrise Force").to.be.true;

      sheetRoot().find('button[data-action="rollSave"][data-key="str"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula, "sauvegarde maîtrisée : mod + bonus de maîtrise").to.equal(
          `1d20${formatModifier(strMod + prof)}`
        );
      });
    });

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const dexMod = abilityModifier(actor.system.abilities.dex.total);
      expect(actor.system.saves.dex.proficient, "prérequis : fighter NE maîtrise PAS Dextérité").to.be.false;

      sheetRoot().find('button[data-action="rollSave"][data-key="dex"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula, "sauvegarde non maîtrisée : mod seul").to.equal(`1d20${formatModifier(dexMod)}`);
      });
    });
  });

  it("jet de compétence — avantage d'Origine automatique, sans Maj-clic (T-STATS-005)", () => {
    cy.window().then((win) => {
      expect(
        win.game.dndCustomAi.origins.ravenmoor.skillAdvantages,
        "prérequis : Ravenmoor avantage Investigation"
      ).to.include("investigation");
    });
    sheetRoot().find('button[data-action="rollSkill"][data-key="investigation"]').click();
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kh1"));
  });

  it("jet de compétence — désavantage d'armure automatique sur Discrétion (T-STATS-006)", () => {
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      expect(actor.system.stealthDisadvantage, "prérequis : Cotte de mailles équipée (désavantage)").to.be.true;
    });
    sheetRoot().find('button[data-action="rollSkill"][data-key="stealth"]').click();
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kl1"));
  });

  it("Aptitudes multiples (Barde) — demi-bonus sur une compétence non maîtrisée (T-STATS-007)", () => {
    let bardActorId;
    // Ferme la fiche partagée avant d'en créer une autre.
    cy.window().then((win) => win.game.actors.get(sharedActorId).sheet.close());
    cy.createReadyCharacter({
      name: "Tab Stats Bard",
      origin: "fleuraine",
      classKey: "bard",
      skills: ["persuasion", "performance", "deception"] // athletics reste non maîtrisée
    }).then((id) => {
      bardActorId = id;
      createdActorIds.push(id);

      // Aptitudes multiples octroyée depuis le compendium.
      return cy.window().then((win) => {
        const pack = win.game.packs.get("dnd-custom-ai.capacites");
        return pack.getIndex().then(() => {
          const entry = [...pack.index].find((candidate) => candidate.name === "Aptitudes multiples");
          expect(entry, "Capacité 'Aptitudes multiples' introuvable dans le compendium capacites").to.exist;
          return pack.getDocument(entry._id).then((doc) => {
            const actor = win.game.actors.get(bardActorId);
            return actor.createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(doc.toObject()))]);
          });
        });
      });
    });

    cy.window().then((win) => {
      const actor = win.game.actors.get(bardActorId);
      expect(actor.system.skills.athletics.proficient, "prérequis : Athlétisme non maîtrisée").to.be.false;
      const mod = abilityModifier(actor.system.abilities.str.total);
      const halfProf = Math.floor(proficiencyBonusFor(actor.system.attributes.level) / 2);

      sheetRoot().find('button[data-action="rollSkill"][data-key="athletics"]').click();
      lastMessageRoll().then((roll) => {
        expect(roll.formula).to.equal(`1d20${formatModifier(mod + halfProf)}`);
      });
    });
  });

  it("Exhaustion ≥ 1 — désavantage automatique sur les jets de caractéristique/compétence (T-STATS-017)", () => {
    cy.window().then((win) => updateActor(win, win.game.actors.get(sharedActorId), { "system.attributes.exhaustion": 1 }, { dndCustomExhaustionChange: true }));
    sheetRoot().find('button[data-action="rollAbility"][data-key="wis"]').click();
    lastMessageRoll().then((roll) => expect(roll.formula).to.include("2d20kl1"));

    // Épuisement remis à 0.
    cy.window().then((win) => updateActor(win, win.game.actors.get(sharedActorId), { "system.attributes.exhaustion": 0 }, { dndCustomExhaustionChange: true }));
  });

  // Bonus conditionnel du trait d'Origine, proposé par dialogue : « Non » ne change rien,
  // « Oui » ajoute le modificateur de Charisme et nomme le trait.
  it("jet de compétence — bonus conditionnel de trait d'Origine, optionnel via boîte de dialogue (T-STATS-023)", () => {
    let lucentiaActorId;
    cy.window().then((win) => win.game.actors.get(sharedActorId).sheet.close());
    cy.createReadyCharacter({
      name: "Tab Stats Lucentia",
      origin: "lucentia", // Art de la Parole : bonus de Charisme optionnel sur Perspicacité
      classKey: "rogue",
      skills: ["deception", "performance", "stealth", "acrobatics"] // Perspicacité (insight) reste non maîtrisée
    }).then((id) => {
      lucentiaActorId = id;
      createdActorIds.push(id);
      cy.openActorSheet(id);
      resetMessageBaseline();

      cy.window().then((win) => {
        const bonus = win.game.dndCustomAi.origins.lucentia.specialTrait.conditionalBonus;
        expect(bonus, "prérequis : conditionalBonus configuré sur Lucentia").to.deep.equal({
          skill: "insight",
          ability: "cha"
        });
      });

      // « Non » : jet normal.
      sheetRoot().find('button[data-action="rollSkill"][data-key="insight"]').click();
      cy.get("dialog.application.dialog[open] .window-title", { timeout: 10000 }).should("contain.text", "Art de la Parole");
      cy.get('dialog.application.dialog[open] button[data-action="no"]').click();
      // Attend la suppression du dialogue avant d'en rouvrir un.
      cy.get("dialog.application.dialog", { timeout: 10000 }).should("not.exist");
      let baseFormula;
      lastMessageRoll().then((roll) => {
        expect(roll.flavor, "pas de mention du trait si refusé").to.not.include("Art de la Parole");
        baseFormula = roll.formula;
      });

      // « Oui » : modificateur de Charisme ajouté.
      sheetRoot().find('button[data-action="rollSkill"][data-key="insight"]').click();
      cy.get("dialog.application.dialog[open] .window-title", { timeout: 10000 }).should("contain.text", "Art de la Parole");
      cy.get('dialog.application.dialog[open] button[data-action="yes"]').click();
      cy.window().then((win) => {
        const chaMod = abilityModifier(win.game.actors.get(lucentiaActorId).system.abilities.cha.total);
        const baseMod = Number(baseFormula.replace("1d20", "") || 0);
        lastMessageRoll().then((roll) => {
          expect(roll.formula, "modificateur de Charisme ajouté au jet normal").to.equal(`1d20${formatModifier(baseMod + chaMod)}`);
          expect(roll.flavor, "trait nommé dans le libellé si accepté").to.include("Art de la Parole");
        });
      });
    });
  });
});

describe("Onglet Statistiques — caractéristiques", () => {
  it("boutons +/- caractéristique réservés au MJ (T-STATS-008)", () => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
    sheetRoot().find('button[data-action="abilityIncrease"]').should("not.exist");
    sheetRoot().find('button[data-action="abilityDecrease"]').should("not.exist");

    cy.loginAsGM();
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const before = win.game.actors.get(sharedActorId).system.abilities.str.value;

      sheetRoot().find('button[data-action="abilityIncrease"][data-key="str"]').click();
      cy.window().then((win2) => {
        expect(win2.game.actors.get(sharedActorId).system.abilities.str.value).to.equal(before + 1);
      });

      sheetRoot().find('button[data-action="abilityDecrease"][data-key="str"]').click();
      cy.window().then((win3) => {
        // Valeur de départ restaurée.
        expect(win3.game.actors.get(sharedActorId).system.abilities.str.value).to.equal(before);
      });
    });
  });
});

describe("Onglet Statistiques — repos", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("Repos court — soin de moitié des PV max (T-STATS-009)", () => {
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      // `dndCustomDamageApply` autorise la baisse de PV simulée.
      return updateActor(win, actor, { "system.attributes.hp.value": 1 }, { dndCustomDamageApply: true });
    });

    lastMessageCount().then((before) => {
      sheetRoot().find('button[data-action="restShort"]').click();
      // Attend la fin de #onRestShort (asynchrone).
      cy.window().should((win) => {
        const actor = win.game.actors.get(sharedActorId);
        const expected = Math.min(1 + Math.floor(actor.system.attributes.hp.max / 2), actor.system.attributes.hp.max);
        expect(actor.system.attributes.hp.value).to.equal(expected);
        expect(win.game.messages.size, "message de chat posté").to.equal(before + 1);
        expect(win.game.messages.contents.at(-1).content).to.include(actor.name);
      });
    });

    // Pleine santé.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
  });

  it("Repos court — restaure les emplacements de sorts de l'Occultiste (T-STATS-010)", () => {
    let warlockId;
    cy.createReadyCharacter({
      name: "Tab Stats Warlock",
      origin: "valdera",
      classKey: "warlock",
      skills: ["arcana", "deception"]
    }).then((id) => {
      warlockId = id;
      createdActorIds.push(id);

      cy.window().then((win) => {
        const actor = win.game.actors.get(warlockId);
        const slots = actor.system.spells.slots;
        expect(
          Object.values(slots).some((slot) => slot.max > 0),
          "prérequis : Occultiste niveau 1 a des emplacements de sorts (Magie de Pacte)"
        ).to.be.true;
        const emptyAllSlots = Object.fromEntries(
          Object.keys(slots).map((level) => [`system.spells.slots.${level}.value`, 0])
        );
        return updateActor(win, actor, emptyAllSlots);
      });

      sheetRoot().find('button[data-action="restShort"]').click();
      cy.window().then((win) => {
        const slots = win.game.actors.get(warlockId).system.spells.slots;
        for (const level of Object.keys(slots)) {
          expect(slots[level].value, `palier ${level} restauré à son max`).to.equal(slots[level].max);
        }
      });
    });
  });

  it("Repos long — soin complet et sorts restaurés (T-STATS-011)", () => {
    let casterId;
    cy.createReadyCharacter({
      name: "Tab Stats Wizard",
      origin: "ashar",
      classKey: "wizard",
      skills: ["arcana", "history"]
    }).then((id) => {
      casterId = id;
      createdActorIds.push(id);

      cy.window().then((win) => {
        const actor = win.game.actors.get(casterId);
        const slots = actor.system.spells.slots;
        expect(
          Object.values(slots).some((slot) => slot.max > 0),
          "prérequis : magicien niveau 1 a des emplacements de sorts"
        ).to.be.true;
        const emptyAllSlots = Object.fromEntries(
          Object.keys(slots).map((level) => [`system.spells.slots.${level}.value`, 0])
        );
        // `dndCustomDamageApply` autorise la baisse de PV simulée.
        return updateActor(
          win,
          actor,
          { "system.attributes.hp.value": 1, ...emptyAllSlots },
          { dndCustomDamageApply: true }
        );
      });

      lastMessageCount().then((before) => {
        sheetRoot().find('button[data-action="restLong"]').click();
        // Attend la fin du repos.
        cy.window().should((win) => {
          const actor = win.game.actors.get(casterId);
          expect(actor.system.attributes.hp.value).to.equal(actor.system.attributes.hp.max);
          const slots = actor.system.spells.slots;
          for (const level of Object.keys(slots)) {
            expect(slots[level].value, `palier ${level} restauré à son max`).to.equal(slots[level].max);
          }
          expect(win.game.messages.size, "message de chat posté").to.equal(before + 1);
        });
      });
    });
  });

  // Les Capacités à charges se rechargent au repos court comme long.
  it("recharge une Capacité à charges au repos, court comme long (T-STATS-012)", () => {
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const secondWind = actor.items.find((item) => item.name === "Second souffle");
      expect(secondWind, "prérequis : le fighter possède 'Second souffle' (uses.recharge shortRest)").to.exist;
      expect(secondWind.system.uses.recharge).to.equal("shortRest");
      return secondWind.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 0 })));
    });

    // Attend la fin de #onRestShort (asynchrone).
    sheetRoot().find('button[data-action="restShort"]').click();
    cy.window().should((win) => {
      const secondWind = win.game.actors.get(sharedActorId).items.find((item) => item.name === "Second souffle");
      expect(secondWind.system.uses.value, "rechargée après un repos court").to.equal(secondWind.system.uses.max);
    });
    cy.window().then((win) => {
      const secondWind = win.game.actors.get(sharedActorId).items.find((item) => item.name === "Second souffle");
      return secondWind.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 0 })));
    });

    sheetRoot().find('button[data-action="restLong"]').click();
    cy.window().should((win) => {
      const secondWind = win.game.actors.get(sharedActorId).items.find((item) => item.name === "Second souffle");
      expect(secondWind.system.uses.value, "rechargée après un repos long aussi").to.equal(secondWind.system.uses.max);
    });
  });

  it("Repos bloqué si le personnage est mort — aucun effet (T-STATS-013)", () => {
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      // `dndCustomDamageApply` autorise la baisse de PV simulée.
      return updateActor(
        win,
        actor,
        { "system.attributes.hp.value": 1, "system.attributes.death.failures": 3 },
        { dndCustomDamageApply: true }
      );
    });

    lastMessageCount().then((before) => {
      // `force` : bouton désactivé ; teste le verrou côté données (`#isDead()`).
      sheetRoot().find('button[data-action="restShort"]').click({ force: true }); // NOSONAR : bouton désactivé (cf. ci-dessus)
      cy.window().then((win) => {
        const actor = win.game.actors.get(sharedActorId);
        expect(actor.system.attributes.hp.value, "aucun soin appliqué").to.equal(1);
        expect(win.game.messages.size, "aucun message posté").to.equal(before);
      });
    });

    // Retire l'état « mort ».
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, {
        "system.attributes.hp.value": actor.system.attributes.hp.max,
        "system.attributes.death.failures": 0
      });
    });
  });

  // À partir du 4e repos court depuis le dernier repos long, +1 point d'Épuisement par repos court.
  it("Épuisement après le 4e repos court sans repos long (anomalie 2026-08-19)", () => {
    cy.openActorSheet(sharedActorId);
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.shortRestCount": 3, "system.attributes.exhaustion": 0 }, { dndCustomExhaustionChange: true });
    });

    lastMessageCount().then((before) => {
      sheetRoot().find('button[data-action="restShort"]').click();
      cy.window().should((win) => {
        const actor = win.game.actors.get(sharedActorId);
        expect(actor.system.attributes.shortRestCount, "compteur incrémenté (4e repos court)").to.equal(4);
        expect(actor.system.attributes.exhaustion, "1 point d'Épuisement gagné").to.equal(1);
        expect(win.game.messages.size, "deux messages : repos + avertissement Épuisement").to.equal(before + 2);
        expect(win.game.messages.contents.at(-1).content, "message cite le personnage").to.include(actor.name);
      });
    });

    // 5e repos court : +1 point.
    lastMessageCount().then((before) => {
      sheetRoot().find('button[data-action="restShort"]').click();
      cy.window().should((win) => {
        const actor = win.game.actors.get(sharedActorId);
        expect(actor.system.attributes.shortRestCount, "5e repos court").to.equal(5);
        expect(actor.system.attributes.exhaustion, "2e point d'Épuisement").to.equal(2);
        expect(win.game.messages.size, "deux nouveaux messages encore").to.equal(before + 2);
      });
    });

    // Plafond de 6.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.shortRestCount": 3, "system.attributes.exhaustion": 6 }, { dndCustomExhaustionChange: true });
    });
    sheetRoot().find('button[data-action="restShort"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).system.attributes.exhaustion, "plafonné à 6").to.equal(6);
    });

    // Le repos long remet le compteur à zéro.
    sheetRoot().find('button[data-action="restLong"]').click();
    cy.window().should((win) => {
      expect(
        win.game.actors.get(sharedActorId).system.attributes.shortRestCount,
        "compteur remis à zéro par le repos long"
      ).to.equal(0);
    });

    // Épuisement remis à 0.
    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      return updateActor(win, actor, { "system.attributes.exhaustion": 0 }, { dndCustomExhaustionChange: true });
    });
  });
});

describe("Onglet Statistiques — Initiative", () => {
  // Initiative en lecture seule (le jet se fait via le Combat Tracker).
  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("le modificateur d'Initiative est affiché en lecture seule, plus de bouton de jet (T-STATS-014)", () => { // NOSONAR : assertions portées par les helpers (sheetRoot()…should)
    cy.openActorSheet(sharedActorId);

    cy.window().then((win) => {
      const actor = win.game.actors.get(sharedActorId);
      const dexMod = abilityModifier(actor.system.abilities.dex.total);
      sheetRoot()
        .find(".derived-stats span")
        .first()
        .invoke("text")
        .should("include", formatModifier(dexMod));
    });

    sheetRoot().find('button[data-action="rollInitiative"]').should("not.exist");
  });
});

describe("Onglet Statistiques — Dons avec effet automatique (anomalie 2026-08-19)", () => {
  let featActorId;

  // Resynchronise une entrée de compendium avant de tester un champ récent.
  function resyncCompendiumEntry(win, packName, itemName) {
    const pack = win.game.packs.get(`dnd-custom-ai.${packName}`);
    return pack
      .getDocuments()
      .then((docs) => {
        const stale = docs.find((doc) => doc.name === itemName);
        expect(stale, `prérequis : '${itemName}' existe dans le compendium ${packName}`).to.exist;
        return win.Item.deleteDocuments([stale.id], { pack: `dnd-custom-ai.${packName}` });
      })
      .then(() => win.game.dndCustomAi.importSystemContent());
  }

  function grantFeat(win, actorId, featName) {
    const pack = win.game.packs.get("dnd-custom-ai.dons");
    return pack.getIndex().then(() => {
      const entry = [...pack.index].find((candidate) => candidate.name === featName);
      expect(entry, `Don '${featName}' introuvable dans le compendium dons`).to.exist;
      return pack
        .getDocument(entry._id)
        .then((doc) => win.game.actors.get(actorId).createEmbeddedDocuments("Item", [win.JSON.parse(win.JSON.stringify(doc.toObject()))]));
    });
  }

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({
      name: "Tab Stats Feats",
      origin: "fleuraine",
      classKey: "fighter",
      skills: ["athletics", "intimidation"]
    }).then((id) => {
      featActorId = id;
      createdActorIds.push(id);
    });
  });

  beforeEach(() => {
    cy.loginAsPlayer();
  });

  it("Doué : +1 Charisme visible sur la fiche, cumulé au-dessus de la valeur de base", () => {
    let baseCha;
    cy.window().then((win) => {
      baseCha = win.game.actors.get(featActorId).system.abilities.cha.total;
      return grantFeat(win, featActorId, "Doué");
    });
    // Attend la valeur dérivée stable avant de rouvrir la fiche.
    cy.window().should((win) => {
      expect(win.game.actors.get(featActorId).system.abilities.cha.total).to.equal(baseCha + 1);
    });
    cy.then(() => cy.openActorSheet(featActorId));
    sheetRoot()
      .find('button[data-action="rollAbility"][data-key="cha"]')
      .closest(".ability-card")
      .find(".ability-value")
      .invoke("text")
      .should((text) => expect(Number(text)).to.equal(baseCha + 1));
  });

  it("Tenace : +2 PV max par niveau, visible dans l'en-tête de la fiche", () => {
    let baseHpMax;
    cy.window().then((win) => {
      baseHpMax = win.game.actors.get(featActorId).system.attributes.hp.max;
      return grantFeat(win, featActorId, "Tenace");
    });
    cy.window().should((win) => {
      const actor = win.game.actors.get(featActorId);
      expect(actor.system.attributes.hp.max).to.equal(baseHpMax + 2 * actor.system.attributes.level);
    });
    cy.then(() => cy.openActorSheet(featActorId));
    sheetRoot()
      .find(".hp-max-value")
      .invoke("text")
      .should((text) => expect(Number(text)).to.equal(baseHpMax + 2));
  });

  it("Alerte : +5 Initiative, visible sur l'onglet Statistiques", () => {
    let baseInitiative;
    cy.window().then((win) => {
      baseInitiative = win.game.actors.get(featActorId).system.attributes.initiativeMod;
      return grantFeat(win, featActorId, "Alerte");
    });
    cy.window().should((win) => {
      expect(win.game.actors.get(featActorId).system.attributes.initiativeMod).to.equal(baseInitiative + 5);
    });
    cy.then(() => cy.openActorSheet(featActorId));
    sheetRoot()
      .find(".derived-stats span")
      .first()
      .invoke("text")
      // Callback : `baseInitiative` n'est connu qu'à l'exécution.
      .should((text) => expect(text).to.include(formatModifier(baseInitiative + 5)));
  });

  it("Résilient : choix de caractéristique réglé via la fiche du don (MJ) -> bonus + maîtrise de sauvegarde appliqués", () => {
    let baseWis;
    let createdItems;
    cy.loginAsGM();
    cy.window().then((win) => resyncCompendiumEntry(win, "dons", "Résilient"));
    cy.window().then((win) => {
      baseWis = win.game.actors.get(featActorId).system.abilities.wis.total;
      return grantFeat(win, featActorId, "Résilient").then((items) => {
        createdItems = items;
      });
    });

    // Caractéristique choisie via le vrai select de la fiche du don (MJ).
    cy.then(() => cy.window().then(() => createdItems[0].sheet.render(true)));
    cy.get(".application.sheet.item", { timeout: 10000 }).should("be.visible").and("contain.text", "Résilient");
    cy.get('select[name="system.chosenAbility"]').select("wis");

    cy.window().should((win) => {
      const actor = win.game.actors.get(featActorId);
      expect(actor.system.abilities.wis.total, "bonus +1 appliqué").to.equal(baseWis + 1);
      expect(actor.system.saves.wis.proficient, "maîtrise de sauvegarde accordée").to.be.true;
    });

    cy.then(() => cy.openActorSheet(featActorId));
    sheetRoot()
      .find('button[data-action="rollAbility"][data-key="wis"]')
      .closest(".ability-card")
      .find(".ability-value")
      .invoke("text")
      .should((text) => expect(Number(text)).to.equal(baseWis + 1));
    sheetRoot().find('input[name="system.saves.wis.proficient"]').should("be.checked");
  });

  it("Guérisseur : le jet réutilise le bouton 'Appliquer le soin' déjà existant pour les sorts de soin", () => {
    let tokenId;
    let hpBefore;
    cy.loginAsGM();
    cy.window().then((win) => resyncCompendiumEntry(win, "dons", "Guérisseur"));
    cy.window().then((win) => {
      hpBefore = Math.max(1, win.game.actors.get(featActorId).system.attributes.hp.max - 5);
      return win.game.actors
        .get(featActorId)
        .getTokenDocument(win.JSON.parse(win.JSON.stringify({ x: 400, y: 400 })))
        .then((tokenDoc) =>
          win.canvas.scene.createEmbeddedDocuments("Token", [win.JSON.parse(win.JSON.stringify(tokenDoc.toObject()))])
        )
        .then((tokens) => {
          tokenId = tokens[0].id;
        });
    });
    cy.window().then((win) => grantFeat(win, featActorId, "Guérisseur"));
    cy.window().then((win) =>
      win.game.actors.get(featActorId).update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": hpBefore })), {
        dndCustomDamageApply: true
      })
    );

    cy.loginAsPlayer();
    cy.then(() => cy.openActorSheet(featActorId));
    sheetRoot().find('nav.tabs [data-tab="abilities"]').click();
    sheetRoot().find('section.tab[data-tab="abilities"]').should("have.class", "active");

    cy.window().then((win) => win.canvas.tokens.get(tokenId).setTarget(true, { releaseOthers: true }));

    cy.window().then((win) => {
      const item = win.game.actors.get(featActorId).items.find((candidate) => candidate.name === "Guérisseur");
      expect(item, "prérequis : don Guérisseur bien octroyé").to.exist;
      sheetRoot().find(`li[data-item-id="${item.id}"] button[data-action="rollFeature"]`).click();
    });

    // Ferme la fiche et ouvre l'onglet Chat.
    cy.window().then((win) => win.game.actors.get(featActorId).sheet.close());
    cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
    cy.get(".chat-message").last().find("button.dnd-apply-heal-btn").should("be.visible").click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(featActorId);
      const healAmount = win.game.messages.contents.at(-1).rolls?.[0]?.total ?? 0;
      expect(healAmount, "un vrai total de soin doit avoir été calculé").to.be.greaterThan(0);
      expect(actor.system.attributes.hp.value, "PV restaurés du montant du jet, plafonnés au max").to.equal(
        Math.min(hpBefore + healAmount, actor.system.attributes.hp.max)
      );
    });

    // PV remis au max, token supprimé.
    cy.loginAsGM();
    cy.window().then((win) => {
      const actor = win.game.actors.get(featActorId);
      return actor.update(win.JSON.parse(win.JSON.stringify({ "system.attributes.hp.value": actor.system.attributes.hp.max })));
    });
    cy.window().then((win) => win.canvas.scene.deleteEmbeddedDocuments("Token", [tokenId]));
  });

  it("Chanceux : bouton 'Dépenser un point de Chance' sur un jet de d20, relance et garde le meilleur total", () => {
    cy.window().then((win) => grantFeat(win, featActorId, "Chanceux"));

    cy.openActorSheet(featActorId);
    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();
    lastMessageRoll();

    cy.window().then((win) => win.game.actors.get(featActorId).sheet.close());
    cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
    cy.get(".chat-message").last().find("button.dnd-spend-luck-btn").should("be.visible").click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(featActorId);
      const luckyFeat = actor.items.find((item) => item.name === "Chanceux");
      expect(luckyFeat.system.uses.value, "1 charge consommée").to.equal(2);

      const messages = win.game.messages.contents;
      const reroll = messages.at(-1);
      const original = messages.at(-2);
      expect(reroll.flavor, "message de relance distinct posté").to.include(actor.name);
      expect(original.getFlag("dnd-custom-ai", "luckApplied"), "jet d'origine marqué, une seule relance par jet").to.be.true;
    });

    // Plus de charge : plus de bouton.
    cy.window().then((win) => {
      const actor = win.game.actors.get(featActorId);
      const luckyFeat = actor.items.find((item) => item.name === "Chanceux");
      return luckyFeat.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": 0 })));
    });
    cy.window().then((win) => win.game.actors.get(featActorId).sheet.render(true));
    cy.get("input.actor-name", { timeout: 15000 }).should("be.visible");
    resetMessageBaseline();
    sheetRoot().find('button[data-action="rollAbility"][data-key="str"]').click();
    lastMessageRoll();
    cy.window().then((win) => win.game.actors.get(featActorId).sheet.close());
    cy.window().then((win) => win.document.querySelector('#sidebar-tabs [data-tab="chat"]')?.click());
    cy.get(".chat-message").last().find("button.dnd-spend-luck-btn").should("not.exist");

    // Charges restaurées.
    cy.window().then((win) => {
      const actor = win.game.actors.get(featActorId);
      const luckyFeat = actor.items.find((item) => item.name === "Chanceux");
      return luckyFeat.update(win.JSON.parse(win.JSON.stringify({ "system.uses.value": luckyFeat.system.uses.max })));
    });
  });
});

describe("Onglet Statistiques — états et Exhaustion", () => {
  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(sharedActorId);
  });

  it("plusieurs états cochés pendant que la liste reste ouverte, appliqués en un seul geste à sa fermeture (T-STATS-015)", () => {
    // Deux états cochés, appliqués ensemble à la fermeture de la liste.
    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="poisoned"]').click();
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="prone"]').click();
    sheetRoot().find(".conditions-dropdown").should("have.attr", "open");
    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).statuses.has("poisoned"), "pas encore appliqué, liste toujours ouverte").to.be
        .false;
    });

    sheetRoot().find(".conditions-dropdown summary").click(); // ferme -> applique les 2 d'un coup
    cy.window().should((win) => {
      const actor = win.game.actors.get(sharedActorId);
      expect(actor.statuses.has("poisoned"), "poisoned appliqué à la fermeture").to.be.true;
      expect(actor.statuses.has("prone"), "prone appliqué à la fermeture (multi-sélection)").to.be.true;
    });

    sheetRoot().find(".conditions-dropdown summary").click(); // rouvre
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="poisoned"]').should("have.class", "active");
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="prone"]').should("have.class", "active");
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="poisoned"]').click();
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="prone"]').click();
    sheetRoot().find(".conditions-dropdown summary").click(); // ferme -> retire les 2 d'un coup

    cy.window().should((win) => {
      const actor = win.game.actors.get(sharedActorId);
      expect(actor.statuses.has("poisoned")).to.be.false;
      expect(actor.statuses.has("prone")).to.be.false;
    });

    sheetRoot().find(".conditions-dropdown summary").click();
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="poisoned"]').should("not.have.class", "active");
    sheetRoot().find('button[data-action="toggleConditionSelection"][data-key="prone"]').should("not.have.class", "active");
  });

  it("Exhaustion : pas-à-pas masqué côté Joueur, borné 0-6 côté MJ (T-STATS-016)", () => {
    // Joueur : valeur visible, sans boutons ±.
    sheetRoot().find(".exhaustion-chip .ability-value").should("be.visible");
    sheetRoot().find('.exhaustion-chip button[data-action="exhaustionIncrease"]').should("not.exist");
    sheetRoot().find('.exhaustion-chip button[data-action="exhaustionDecrease"]').should("not.exist");

    // MJ : boutons ± bornés entre 0 et 6.
    cy.loginAsGM();
    cy.openActorSheet(sharedActorId);
    for (let i = 0; i < 7; i += 1) {
      sheetRoot().find('button[data-action="exhaustionIncrease"]').click();
    }
    cy.window().should((win) => {
      expect(win.game.actors.get(sharedActorId).system.attributes.exhaustion).to.equal(6);
    });

    for (let i = 0; i < 8; i += 1) {
      sheetRoot().find('button[data-action="exhaustionDecrease"]').click();
    }
    cy.window().should((win) => {
      // Revenu à 0.
      expect(win.game.actors.get(sharedActorId).system.attributes.exhaustion).to.equal(0);
    });
  });
});

describe("Onglet Statistiques — Agonie et jets de sauvegarde de la mort", () => {
  // Personnage dédié aux scénarios d'agonie.
  let dyingActorId;

  before(() => {
    cy.loginAsPlayer();
    cy.createReadyCharacter({ name: "Tab Stats Dying", origin: "altenmark", classKey: "cleric", skills: ["religion", "insight"] }).then(
      (id) => {
        dyingActorId = id;
        createdActorIds.push(id);
      }
    );
  });

  beforeEach(() => {
    cy.loginAsPlayer();
    cy.openActorSheet(dyingActorId);
  });

  // Place le personnage à 0 PV (vraie transition, pour Inconscient) puis pose les compteurs
  // dans un update séparé, après celui du hook.
  function setDyingState(successes, failures) {
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
    // `dndCustomDamageApply` autorise la baisse de PV simulée.
    cy.window().then((win) =>
      updateActor(win, win.game.actors.get(dyingActorId), { "system.attributes.hp.value": 0 }, { dndCustomDamageApply: true })
    );
    cy.window().should((win) => {
      const death = win.game.actors.get(dyingActorId).system.attributes.death;
      expect(death.successes).to.equal(0);
      expect(death.failures).to.equal(0);
    });
    return cy.window().then((win) =>
      updateActor(win, win.game.actors.get(dyingActorId), {
        "system.attributes.death.successes": successes,
        "system.attributes.death.failures": failures
      })
    );
  }

  it("le panneau Agonie apparaît à 0 PV, pastilles à zéro (T-STATS-018)", () => {
    // La transition vers 0 PV pose Inconscient.
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": Math.max(1, actor.system.attributes.hp.max) });
    });
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": 0 }, { dndCustomDamageApply: true });
    });

    cy.get(".death-panel").should("be.visible");
    cy.get(".death-pips i.filled").should("have.length", 0);
    cy.get(".death-pips.failures i.filled").should("have.length", 0);
    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).statuses.has("unconscious")).to.be.true;
    });
  });

  it("jet de sauvegarde de la mort — réussite, échec, et cas critiques (T-STATS-019)", () => {
    // 20 naturel : 1 PV, fin de l'agonie.
    setDyingState(0, 0);
    cy.forceD20(20);
    cy.get('button[data-action="rollDeathSave"]').click();
    cy.window().should((win) => {
      const actor = win.game.actors.get(dyingActorId);
      expect(actor.system.attributes.hp.value).to.equal(1);
      expect(actor.system.attributes.death.successes).to.equal(0);
      expect(actor.system.attributes.death.failures).to.equal(0);
    });
    cy.get(".death-panel").should("not.exist");

    // 1 naturel : deux échecs.
    setDyingState(0, 0);
    cy.forceD20(1);
    cy.get('button[data-action="rollDeathSave"]').click();
    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).system.attributes.death.failures).to.equal(2);
    });

    // 10+ : une réussite.
    setDyingState(0, 0);
    cy.forceD20(15);
    cy.get('button[data-action="rollDeathSave"]').click();
    cy.window().should((win) => {
      const death = win.game.actors.get(dyingActorId).system.attributes.death;
      expect(death.successes).to.equal(1);
      expect(death.failures).to.equal(0);
    });

    // Moins de 10 : un échec.
    setDyingState(0, 0);
    cy.forceD20(5);
    cy.get('button[data-action="rollDeathSave"]').click();
    cy.window().should((win) => {
      const death = win.game.actors.get(dyingActorId).system.attributes.death;
      expect(death.failures).to.equal(1);
      expect(death.successes).to.equal(0);
    });

    // Santé normale restaurée.
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
  });

  it("troisième échec — le personnage meurt, le Repos est ensuite bloqué (T-STATS-020)", () => {
    setDyingState(0, 2); // déjà deux échecs (ex. un nat 1 précédent, cf. T-STATS-019)
    cy.forceD20(5); // un échec simple suffit à atteindre 3
    cy.get('button[data-action="rollDeathSave"]').click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(dyingActorId);
      expect(actor.system.attributes.death.failures).to.equal(3);
      expect(actor.statuses.has("dead")).to.be.true;
    });

    // Seuls les PV sont vérifiés (le message de mort peut encore arriver).
    cy.get('[data-action="restShort"]').click({ force: true }); // NOSONAR : bouton désactivé, teste le verrou côté données
    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).system.attributes.hp.value, "Repos sans effet une fois mort").to.equal(
        0
      );
    });

    // Retire « mort », santé restaurée.
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return actor.toggleStatusEffect("dead", { active: false }).then(() =>
        updateActor(win, actor, {
          "system.attributes.hp.value": actor.system.attributes.hp.max,
          "system.attributes.death.successes": 0,
          "system.attributes.death.failures": 0
        })
      );
    });
  });

  // Troisième réussite : retire Inconscient et remet 1 PV (le panneau d'agonie disparaît).
  it("trois réussites — stabilisé : retire Inconscient et remet 1 PV (T-STATS-021)", () => {
    setDyingState(2, 0); // déjà deux réussites
    cy.forceD20(15); // une réussite simple suffit à atteindre 3
    cy.get('button[data-action="rollDeathSave"]').click();

    cy.window().should((win) => {
      const actor = win.game.actors.get(dyingActorId);
      expect(actor.system.attributes.hp.value, "1 PV remis automatiquement à la stabilisation").to.equal(1);
      expect(actor.system.attributes.death.successes, "compteurs réinitialisés (hook updateActor)").to.equal(0);
      expect(actor.system.attributes.death.failures).to.equal(0);
      expect(actor.statuses.has("unconscious"), "Inconscient retiré à la stabilisation").to.be.false;
    });

    cy.get(".death-panel").should("not.exist");

    // Santé normale restaurée.
    cy.window().then((win) => {
      const actor = win.game.actors.get(dyingActorId);
      return updateActor(win, actor, { "system.attributes.hp.value": actor.system.attributes.hp.max });
    });
  });

  it("remonter au-dessus de 0 PV réinitialise l'état de mort (T-STATS-022)", () => {
    setDyingState(1, 1); // 0 PV (Inconscient posé), quelques réussites/échecs déjà encaissés
    cy.get(".death-panel").should("be.visible");
    cy.window().should((win) => {
      expect(win.game.actors.get(dyingActorId).statuses.has("unconscious")).to.be.true;
    });

    cy.window().then((win) => updateActor(win, win.game.actors.get(dyingActorId), { "system.attributes.hp.value": 5 }));

    cy.get(".death-panel").should("not.exist");
    cy.window().should((win) => {
      const actor = win.game.actors.get(dyingActorId);
      expect(actor.system.attributes.death.successes).to.equal(0);
      expect(actor.system.attributes.death.failures).to.equal(0);
      expect(actor.statuses.has("unconscious")).to.be.false;
    });
  });
});
