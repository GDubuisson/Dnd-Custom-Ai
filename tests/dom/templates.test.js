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

describe("character-sheet.hbs (en-tête) — indicateur de réaction", () => {
  function render(reactionAvailable) {
    return parse(
      renderTemplate("actor/character-sheet.hbs", {
        actor: { img: "img.webp", name: "Aldric" },
        system: { xp: 0, attributes: { level: 3, hp: { value: 18, max: 24, temp: 0 }, ac: { value: 15 }, speed: 30 } },
        isGM: true,
        levelUpAvailable: false,
        classLabel: "Guerrier",
        originLabel: "Altenmark",
        hpPercent: 75,
        dying: { active: false },
        showCreationWizardButton: false,
        reactionAvailable
      })
    );
  }

  test("réaction disponible : indicateur cliquable, sans la classe 'used'", () => {
    const doc = render(true);
    const indicator = doc.querySelector('[data-action="toggleReaction"]');
    assert.ok(indicator, "indicateur de réaction introuvable");
    assert.equal(indicator.classList.contains("used"), false);
  });

  test("réaction consommée : indicateur marqué 'used'", () => {
    const doc = render(false);
    const indicator = doc.querySelector('[data-action="toggleReaction"]');
    assert.ok(indicator.classList.contains("used"));
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

describe("tab-abilities.hbs — économie de réaction (FeatureData/SpellData#activation)", () => {
  function render(reactionAvailable) {
    return parse(
      renderTemplate("actor/tab-abilities.hbs", {
        tab: {},
        isSpellcaster: true,
        spellcasting: { dc: 14, attackBonusLabel: "+6" },
        spellUses: { value: 0, max: 0 },
        concentratingOn: "",
        originTrait: null,
        reactionAvailable,
        features: [
          { id: "f1", name: "Attaque d'opportunité", system: { source: "", uses: { max: 0 }, requiresRoll: true, rollFormula: "1d8+3", costsResource: "", activation: "reaction", reactionTrigger: "Une créature quitte votre portée" } },
          { id: "f2", name: "Second souffle", system: { source: "", uses: { max: 1, value: 1 }, requiresRoll: false, costsResource: "", activation: "bonusAction" } }
        ],
        spellsByLevel: [
          {
            level: 1,
            label: "Sorts de niveau 1",
            spells: [
              { item: { id: "s1", name: "Bouclier", system: { details: "1 réaction", concentration: false, ritual: false, level: 1, prepared: false, activation: "reaction" } } }
            ]
          }
        ]
      })
    );
  }

  test("badge Réaction affiché uniquement sur les entrées 'reaction', avec le déclencheur en tooltip", () => {
    const doc = render(true);
    const f1 = doc.querySelector('[data-item-id="f1"]');
    const f2 = doc.querySelector('[data-item-id="f2"]');
    assert.ok(f1.querySelector(".reaction-badge"), "badge Réaction manquant sur une Capacité réaction");
    assert.equal(f1.querySelector(".reaction-badge").getAttribute("title"), "Une créature quitte votre portée");
    assert.equal(f2.querySelector(".reaction-badge"), null, "badge Réaction ne devrait pas apparaître sur une Capacité non-réaction");
  });

  test("réaction disponible : le bouton d'utilisation d'une Capacité réaction reste cliquable", () => {
    const doc = render(true);
    const button = doc.querySelector('[data-item-id="f1"] [data-action="rollFeature"]');
    assert.ok(button, "bouton rollFeature introuvable");
    assert.equal(button.hasAttribute("disabled"), false);
  });

  test("réaction déjà consommée : le bouton d'utilisation d'une Capacité réaction est grisé", () => {
    const doc = render(false);
    const button = doc.querySelector('[data-item-id="f1"] [data-action="rollFeature"]');
    assert.ok(button.hasAttribute("disabled"), "le bouton devrait être désactivé, réaction indisponible");
  });

  test("réaction déjà consommée : le bouton 'Lancer' d'un sort réaction est grisé", () => {
    const doc = render(false);
    const button = doc.querySelector('[data-item-id="s1"] [data-action="castSpell"]');
    assert.ok(button.hasAttribute("disabled"), "le bouton Lancer devrait être désactivé, réaction indisponible");
  });

  test("réaction disponible : le bouton 'Lancer' d'un sort réaction reste cliquable", () => {
    const doc = render(true);
    const button = doc.querySelector('[data-item-id="s1"] [data-action="castSpell"]');
    assert.equal(button.hasAttribute("disabled"), false);
  });

  test("une Capacité non-réaction (Second souffle, action bonus) n'est jamais grisée par l'indisponibilité de la réaction", () => {
    const doc = render(false);
    const button = doc.querySelector('[data-item-id="f2"] [data-action="useFeatureCharge"]');
    assert.ok(button, "bouton useFeatureCharge introuvable");
    assert.equal(button.hasAttribute("disabled"), false);
  });
});

describe("tab-abilities.hbs — en-tête spécialisé par classe (templates/actor/abilities/*.hbs)", () => {
  function render(classTabPartial) {
    return parse(
      renderTemplate("actor/tab-abilities.hbs", {
        tab: {},
        isSpellcaster: false,
        concentratingOn: "",
        originTrait: null,
        features: [],
        classTabPartial
      })
    );
  }

  test("chacune des 12 classes a sa propre partial, résolue sans erreur Handlebars", () => {
    for (const key of [
      "barbarian", "bard", "cleric", "druid", "fighter", "monk",
      "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"
    ]) {
      const doc = render(`systems/dnd-custom-ai/templates/actor/abilities/${key}.hbs`);
      const header = doc.querySelector(".class-flavor-header");
      assert.ok(header, `en-tête de classe manquant pour ${key}`);
      assert.ok(header.querySelector(".class-flavor-title").textContent.trim(), `titre vide pour ${key}`);
      assert.ok(header.querySelector(".class-flavor-tagline").textContent.trim(), `accroche vide pour ${key}`);
    }
  });

  test("partial 'default' (pas de classe assignée) : pas d'en-tête de classe, pas d'erreur", () => {
    const doc = render("systems/dnd-custom-ai/templates/actor/abilities/default.hbs");
    assert.equal(doc.querySelector(".class-flavor-header"), null);
  });

  test("classTabPartial absent du contexte (anciens appelants) : rendu inchangé, pas d'erreur", () => {
    const doc = render(undefined);
    assert.equal(doc.querySelector(".class-flavor-header"), null);
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

  test("champ Activation présent, avec les 4 choix (config.activationTypes)", () => {
    const select = doc.querySelector('select[name="system.activation"]');
    assert.ok(select, "select Activation introuvable");
  });

  test("champ Déclencheur absent quand le sort n'est pas une réaction", () => {
    assert.equal(doc.querySelector('input[name="system.reactionTrigger"]'), null);
  });
});

describe("item/spell-sheet.hbs — sort de type Réaction", () => {
  const doc = parse(
    renderTemplate("item/spell-sheet.hbs", {
      item: { img: "spell.webp", name: "Bouclier" },
      config: { activationTypes: { action: "DND_CUSTOM.Item.ActivationTypes.action", reaction: "DND_CUSTOM.Item.ActivationTypes.reaction" } },
      system: {
        classes: "Magicien", level: 1, details: "1 réaction", concentration: false, ritual: false, prepared: false,
        activation: "reaction", reactionTrigger: "Vous êtes touché par une attaque", description: ""
      },
      isReaction: true
    })
  );

  test("le select Activation propose 'Réaction' localisé", () => {
    const select = doc.querySelector('select[name="system.activation"]');
    assert.match(select.innerHTML, /Réaction/);
  });

  test("le champ Déclencheur apparaît, pré-rempli", () => {
    const input = doc.querySelector('input[name="system.reactionTrigger"]');
    assert.ok(input, "champ Déclencheur introuvable");
    assert.equal(input.getAttribute("value"), "Vous êtes touché par une attaque");
  });
});

describe("item/feature-sheet.hbs — champ Activation / Déclencheur", () => {
  function render(isReaction) {
    return parse(
      renderTemplate("item/feature-sheet.hbs", {
        item: { img: "f.webp", name: "Attaque d'opportunité" },
        isGM: true,
        config: { activationTypes: { action: "DND_CUSTOM.Item.ActivationTypes.action", reaction: "DND_CUSTOM.Item.ActivationTypes.reaction" } },
        classOptions: [],
        subclassOptions: [],
        rechargeOptions: { shortRest: "DND_CUSTOM.Item.RechargeTypes.shortRest", longRest: "DND_CUSTOM.Item.RechargeTypes.longRest" },
        system: {
          class: "", subclass: "", level: 1, source: "", requiresRoll: false, costsResource: "",
          uses: { max: 0, value: 0, recharge: "longRest" }, description: "",
          activation: isReaction ? "reaction" : "action", reactionTrigger: isReaction ? "Une créature quitte votre portée" : ""
        },
        isReaction
      })
    );
  }

  test("champ Déclencheur affiché seulement quand Activation = Réaction", () => {
    assert.equal(render(false).querySelector('input[name="system.reactionTrigger"]'), null);
    const input = render(true).querySelector('input[name="system.reactionTrigger"]');
    assert.ok(input, "champ Déclencheur introuvable");
    assert.equal(input.getAttribute("value"), "Une créature quitte votre portée");
  });
});

describe("item/class-sheet.hbs — champs structurés (sauvegardes, compétences, maîtrises)", () => {
  const doc = parse(
    renderTemplate("item/class-sheet.hbs", {
      item: { img: "c.webp", name: "Guerrier" },
      system: { description: "<p>Maître d'armes.</p>", savingThrows: new Set(["str", "con"]), skillChoiceCount: 2, weaponProficiencies: new Set(["meleeSimple", "meleeMartial"]) },
      savingThrowOptions: [
        { key: "str", label: "DND_CUSTOM.Abilities.str", checked: true },
        { key: "dex", label: "DND_CUSTOM.Abilities.dex", checked: false },
        { key: "con", label: "DND_CUSTOM.Abilities.con", checked: true }
      ],
      weaponProficiencyOptions: [
        { key: "meleeSimple", label: "DND_CUSTOM.Item.WeaponTypes.meleeSimple", checked: true },
        { key: "meleeMartial", label: "DND_CUSTOM.Item.WeaponTypes.meleeMartial", checked: true },
        { key: "rangedSimple", label: "DND_CUSTOM.Item.WeaponTypes.rangedSimple", checked: false }
      ]
    })
  );

  test("seules les 2 sauvegardes maîtrisées sont cochées", () => {
    const checked = [...doc.querySelectorAll('input[name="system.savingThrows"]:checked')].map((el) => el.value);
    assert.deepEqual(new Set(checked), new Set(["str", "con"]));
  });

  test("champ nombre de compétences à choisir présent avec la bonne valeur", () => {
    const input = doc.querySelector('input[name="system.skillChoiceCount"]');
    assert.ok(input, "champ skillChoiceCount introuvable");
    assert.equal(input.getAttribute("value"), "2");
  });

  test("maîtrises d'armes cochées correspondent à weaponProficiencyOptions", () => {
    const checked = [...doc.querySelectorAll('input[name="system.weaponProficiencies"]:checked')].map((el) => el.value);
    assert.deepEqual(new Set(checked), new Set(["meleeSimple", "meleeMartial"]));
  });

  test("la description reste un champ narratif distinct", () => {
    assert.ok(doc.querySelector('prose-mirror[name="system.description"]'));
  });
});
