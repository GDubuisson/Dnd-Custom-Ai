// Rend les VRAIS templates .hbs du système (Handlebars réel + nos vrais helpers, cf.
// tests/support/handlebars-env.js) et vérifie la structure du HTML produit via jsdom :
// présence/absence des bons éléments, attributs `name=`/`data-action=`, etc. Ne vérifie PAS le
// rendu visuel (positionnement, chevauchement...) — cf. tests/visual pour cette partie, qui a
// besoin d'un vrai moteur de layout (navigateur).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderTemplate } from "../support/handlebars-env.js";

function parse(html) {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

describe("character-sheet.hbs (en-tête)", () => {
  const context = {
    actor: { img: "img.webp", name: "Aldric" },
    system: {
      xp: 1200,
      attributes: {
        level: 3,
        hp: { value: 18, max: 24, temp: 2 },
        ac: { value: 15 },
        speed: 30
      }
    },
    isGM: true,
    levelUpAvailable: false,
    xpNextThreshold: 2700,
    classLabel: "Guerrier",
    originLabel: "Altenmark",
    hpPercent: 75,
    dying: { active: false },
    showCreationWizardButton: false
  };
  const doc = parse(renderTemplate("actor/character-sheet.hbs", context));

  test("vitesse affichée en mètres (formatSpeed), pas la valeur brute en pieds", () => {
    const speedLabel = [...doc.querySelectorAll("label")].find((label) => label.textContent.includes("Vitesse"));
    assert.ok(speedLabel, "libellé Vitesse introuvable");
    assert.match(speedLabel.querySelector(".computed-value").textContent, /^9 m$/);
    assert.doesNotMatch(speedLabel.textContent, /\b30\b/);
  });

  test("aucun bouton Initiative dans l'en-tête (retiré, redondant avec l'onglet Statistiques)", () => {
    assert.equal(doc.querySelector('[data-action="rollInitiative"]'), null);
  });

  test("champs Niveau / PV actuels / PV temporaires sont bien des <input type=number>", () => {
    assert.ok(doc.querySelector('input[name="system.attributes.level"]'));
    assert.ok(doc.querySelector('input[name="system.attributes.hp.value"]'));
    assert.ok(doc.querySelector('input[name="system.attributes.hp.temp"]'));
  });

  test("bouton Assistant absent quand Classe et Origine sont déjà définies", () => {
    assert.equal(doc.querySelector('[data-action="openCreationWizard"]'), null);
  });

  test("XP visible côté MJ, avec le total et le seuil du prochain niveau", () => {
    const xpField = doc.querySelector(".xp-gm-field");
    assert.ok(xpField, "bloc XP MJ introuvable");
    assert.match(xpField.textContent, /1200/);
    assert.match(xpField.textContent, /2700/);
  });

  test("niveau 20 (aucun seuil suivant) : affiche 'niveau maximum' plutôt qu'un seuil vide", () => {
    const maxLevelDoc = parse(renderTemplate("actor/character-sheet.hbs", { ...context, xpNextThreshold: null }));
    const xpField = maxLevelDoc.querySelector(".xp-gm-field");
    assert.match(xpField.textContent, /niveau maximum/);
  });
});

describe("character-sheet.hbs (en-tête) — vue joueur (pas MJ)", () => {
  const context = {
    actor: { img: "img.webp", name: "Aldric" },
    system: { xp: 1200, attributes: { level: 3, hp: { value: 18, max: 24, temp: 2 }, ac: { value: 15 }, speed: 30 } },
    isGM: false,
    levelUpAvailable: true,
    xpNextThreshold: 2700,
    classLabel: "Guerrier",
    originLabel: "Altenmark",
    hpPercent: 75,
    xpPercent: 60,
    dying: { active: false },
    showCreationWizardButton: false
  };
  const doc = parse(renderTemplate("actor/character-sheet.hbs", context));

  test("XP jamais affiché côté joueur (total/seuil), même si un niveau est disponible", () => {
    assert.equal(doc.querySelector(".xp-gm-field"), null);
    assert.doesNotMatch(doc.body.textContent, /1200/);
    assert.doesNotMatch(doc.body.textContent, /2700/);
  });

  test("la barre de progression XP (visuelle, sans chiffre) reste visible côté joueur", () => {
    const fill = doc.querySelector(".xp-bar-fill");
    assert.ok(fill, "barre XP introuvable");
    assert.match(fill.getAttribute("style"), /width: 60%/);
  });

  test("le badge 'niveau disponible' et son bouton sont accessibles au joueur, pas seulement au MJ", () => {
    assert.ok(doc.querySelector(".level-up-badge"), "badge niveau disponible introuvable");
    assert.ok(doc.querySelector('[data-action="levelUp"]'), "bouton de montée de niveau introuvable côté joueur");
  });
});

describe("tab-stats.hbs", () => {
  const context = {
    tab: {},
    isGM: true,
    conditions: [{ id: "prone", label: "À terre", img: "icons/svg/falling.svg", active: false }],
    system: { attributes: { exhaustion: 0 } },
    abilities: [
      {
        key: "str",
        label: "DND_CUSTOM.Abilities.str",
        total: 16,
        originBonus: 1,
        modLabel: "+3",
        save: { proficient: true, mod: 5 }
      }
    ],
    skills: [
      { key: "athletics", label: "Athlétisme", ability: "str", proficient: true, originAdvantage: false, armorDisadvantage: false, modLabel: "+5" },
      { key: "arcana", label: "Arcanes", ability: "int", proficient: false, originAdvantage: false, armorDisadvantage: false, jackOfAllTrades: true, modLabel: "+1" }
    ],
    proficiencyBonus: 2,
    initiative: { modLabel: "+2" },
    passivePerception: 13
  };
  const doc = parse(renderTemplate("actor/tab-stats.hbs", context));

  test("chaque case de caractéristique affiche un libellé Mod et un libellé Sauv.", () => {
    const labels = [...doc.querySelectorAll(".ability-side-label")].map((el) => el.textContent.trim());
    assert.ok(labels.some((text) => text.startsWith("Mod")), `pas de libellé Mod dans ${JSON.stringify(labels)}`);
    assert.ok(labels.some((text) => text.startsWith("Sauv")), `pas de libellé Sauv. dans ${JSON.stringify(labels)}`);
  });

  test("la case à cocher de maîtrise de sauvegarde est bien reliée au bon champ", () => {
    assert.ok(doc.querySelector('input[name="system.saves.str.proficient"]'));
  });

  test("Aptitudes multiples : une pastille apparaît sur une compétence non maîtrisée qui en bénéficie", () => {
    const arcana = [...doc.querySelectorAll(".skill")].find((li) => li.textContent.includes("Arcanes"));
    assert.ok(arcana.querySelector(".origin-advantage-tag"), "pastille Aptitudes multiples manquante");
  });
});

describe("tab-equipment.hbs", () => {
  const context = {
    tab: {},
    equipment: {
      mainHand: { id: "w1", img: "w.webp", name: "Épée longue", system: { description: "" } },
      offHandOccupiedByMainHand: false,
      offHand: null,
      armor: null,
      accessories: []
    },
    weaponStats: {
      w1: { attackLabel: "+5", damageLabel: "1d8+3", proficient: true }
    },
    armorStats: {}
  };
  const doc = parse(renderTemplate("actor/tab-equipment.hbs", context));

  test("la ligne d'arme principale contient le bouton Attaque ET le bouton Dégâts, avec icônes", () => {
    const line = doc.querySelector('[data-item-id="w1"] .item-stats-line');
    assert.ok(line, "ligne de stats d'arme introuvable");
    const attack = line.querySelector('[data-action="rollWeaponAttack"]');
    const damage = line.querySelector('[data-action="rollWeaponDamage"]');
    assert.match(attack?.textContent.trim() ?? "", /\+5/);
    assert.match(damage?.textContent.trim() ?? "", /1d8\+3/);
    assert.ok(attack?.querySelector("i.fa-dice-d20"), "icône du bouton Attaque introuvable");
    assert.ok(damage?.querySelector("i.fa-droplet"), "icône du bouton Dégâts introuvable");
  });
});

describe("tab-inventory.hbs", () => {
  const context = {
    tab: {},
    system: { currency: { pc: 10, pa: 5, po: 2, pp: 0 } },
    currencyTotalCopper: 250,
    weaponsAndArmor: [],
    gearAndTools: [],
    weaponStats: {},
    armorStats: {},
    carriedWeight: 12.5,
    carryingCapacity: 75,
    carryingCapacityPercent: 17,
    overCapacity: false
  };
  const doc = parse(renderTemplate("actor/tab-inventory.hbs", context));

  test("les 4 champs de monnaie (pc/pa/po/pp) sont tous présents", () => {
    for (const denomination of ["pc", "pa", "po", "pp"]) {
      assert.ok(doc.querySelector(`input[name="system.currency.${denomination}"]`), `champ ${denomination} manquant`);
    }
  });
});

describe("tab-abilities.hbs — pool de sorts simplifié", () => {
  function render(spellUses) {
    return parse(
      renderTemplate("actor/tab-abilities.hbs", {
        tab: {},
        isSpellcaster: true,
        spellcasting: { dc: 14, attackBonusLabel: "+6" },
        spellUses,
        concentratingOn: "",
        originTrait: null,
        features: [],
        spellsByLevel: [
          {
            level: 1,
            label: "Sorts de niveau 1",
            spells: [
              {
                item: {
                  id: "s1",
                  name: "Projectile magique",
                  system: { details: "1 action, 36 m, Instantanée", concentration: false, ritual: false, level: 1, prepared: false }
                }
              }
            ]
          }
        ]
      })
    );
  }

  test("une seule pastille 'Sorts par repos' (pas d'emplacement par niveau)", () => {
    const doc = render({ value: 2, max: 4 });
    const chips = doc.querySelectorAll(".spell-slot-chip");
    assert.equal(chips.length, 1, `attendu 1 pastille, trouvé ${chips.length}`);
    const input = chips[0].querySelector("input");
    assert.equal(input.getAttribute("name"), "system.spells.uses.value");
    assert.equal(input.getAttribute("max"), "4");
  });

  test("aucune pastille affichée quand le personnage n'a pas de sorts par repos (max=0)", () => {
    const doc = render({ value: 0, max: 0 });
    assert.equal(doc.querySelectorAll(".spell-slot-chip").length, 0);
  });

  test("le détail du sort (temps/portée/durée fusionnés) est affiché entre parenthèses", () => {
    const doc = render({ value: 2, max: 4 });
    const details = doc.querySelector(".spell-details");
    assert.equal(details.textContent.trim(), "(1 action, 36 m, Instantanée)");
  });

  test("aucune trace de l'ancien système d'emplacements par niveau dans le HTML rendu", () => {
    const doc = render({ value: 2, max: 4 });
    assert.equal(doc.body.innerHTML.includes("system.spells.slots"), false);
  });
});

describe("tab-abilities.hbs — technique consommant la réserve d'une autre Capacité (ex. Ki)", () => {
  function render(remaining) {
    return parse(
      renderTemplate("actor/tab-abilities.hbs", {
        tab: {},
        isSpellcaster: false,
        concentratingOn: "",
        originTrait: null,
        features: [
          { id: "ki", name: "Ki", system: { source: "", uses: { max: 2, value: remaining }, requiresRoll: false, costsResource: "" } },
          { id: "flurry", name: "Rafale de coups", system: { source: "", uses: { max: 0, value: 0 }, requiresRoll: false, costsResource: "Ki" } }
        ],
        featureResourceState: {
          flurry: { resourceName: "Ki", techniqueName: "Rafale de coups", remaining, max: 2 }
        }
      })
    );
  }

  test("bouton cliquable ('Ki : Rafale de coups') tant qu'il reste des charges", () => {
    const doc = render(1);
    const button = doc.querySelector('[data-action="useResourceTechnique"]');
    assert.ok(button, "bouton de technique introuvable");
    assert.equal(button.hasAttribute("disabled"), false);
    assert.match(button.textContent.trim(), /Ki\s*:\s*Rafale de coups/);
  });

  test("bouton grisé/non cliquable une fois la réserve épuisée", () => {
    const doc = render(0);
    const button = doc.querySelector('[data-action="useResourceTechnique"]');
    assert.ok(button.hasAttribute("disabled"), "le bouton devrait être désactivé à 0 charge");
  });
});

describe("item/spell-sheet.hbs — schéma simplifié", () => {
  const context = {
    item: { img: "spell.webp", name: "Boule de feu" },
    system: {
      classes: "Ensorceleur, Magicien",
      level: 3,
      details: "1 action, 45 m, Instantanée",
      concentration: false,
      ritual: false,
      prepared: false,
      description: "<p>Explosion de flammes.</p>"
    }
  };
  const doc = parse(renderTemplate("item/spell-sheet.hbs", context));

  test("champ Classes et champ Détails (fusionné) présents", () => {
    assert.ok(doc.querySelector('input[name="system.classes"]'));
    assert.ok(doc.querySelector('input[name="system.details"]'));
  });

  test("aucun champ obsolète (école, composantes, temps/portée/durée séparés)", () => {
    const html = doc.body.innerHTML;
    for (const removed of ["system.school", "system.castingTime", "system.range", "system.components", "system.duration"]) {
      assert.equal(html.includes(`name="${removed}`), false, `champ obsolète encore présent : ${removed}`);
    }
  });
});
