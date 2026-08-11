// Tests visuels : seule couche de cette suite capable d'attraper les bugs de CSS/layout
// (éléments qui retombent à la ligne, cases qui se chevauchent, défilement qui ne s'active
// pas) — exactement la classe de bugs trouvée et corrigée manuellement plus tôt sur ce système
// (boutons Attaque/Dégâts, cases de monnaie, fiche d'Arme non scrollable). Utilise un vrai
// moteur de rendu (Chromium via Playwright) : jsdom (cf. tests/dom) ne calcule pas de layout
// réel et ne peut pas détecter ces régressions-là.
//
// Nécessite `npx playwright install chromium` une fois (cf. package.json > test:visual:install).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { renderTemplate } from "../support/handlebars-env.js";
import { buildPage, wrapActorTab, wrapItemSheet } from "../support/html-page.js";

let browser;
let page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

after(async () => {
  await browser.close();
});

describe("Onglet Équipement — Attaque/Dégâts sur la même ligne que leur valeur", () => {
  test("le bouton +5 n'est pas repoussé sur sa propre ligne (bug historique : bouton plein-largeur)", async () => {
    const html = renderTemplate("actor/tab-equipment.hbs", {
      equipment: {
        mainHand: { id: "w1", img: "", name: "Épée longue", system: { description: "" } },
        offHandOccupiedByMainHand: false,
        offHand: null,
        armor: null,
        accessories: []
      },
      weaponStats: { w1: { attackLabel: "+5", damageLabel: "1d8+3", proficient: true } },
      armorStats: {}
    });
    await page.setViewportSize({ width: 800, height: 600 });
    await page.setContent(buildPage(wrapActorTab(html), { includeFoundryCoreBaseline: true }));

    const line = page.locator('[data-item-id="w1"] .item-stats-line');
    const attackButton = line.locator('[data-action="rollWeaponAttack"]');
    const damageButton = line.locator('[data-action="rollWeaponDamage"]');

    const [lineBox, attackBox, damageBox] = await Promise.all([
      line.boundingBox(),
      attackButton.boundingBox(),
      damageButton.boundingBox()
    ]);

    // Une seule ligne de texte : hauteur du <p> nettement sous 2 lignes (marge large pour la
    // police de secours utilisée en environnement headless sans les polices du thème).
    assert.ok(lineBox.height < 30, `hauteur de la ligne = ${lineBox.height}px, attendu < 30px (une seule ligne)`);
    // Les deux boutons doivent partager (à peu près) le même axe vertical que le texte qui les
    // précède : un bouton "tombé" sur sa propre ligne aurait un `top` décalé vers le bas.
    assert.ok(
      Math.abs(attackBox.y - lineBox.y) < 8,
      `bouton Attaque décalé verticalement (y=${attackBox.y} vs ligne y=${lineBox.y}) — probablement retombé à la ligne`
    );
    assert.ok(
      Math.abs(damageBox.y - attackBox.y) < 8,
      `bouton Dégâts pas sur la même ligne que le bouton Attaque (y=${damageBox.y} vs ${attackBox.y})`
    );
  });
});

describe("Onglet Inventaire — les 4 cases de monnaie ne se chevauchent pas", () => {
  test("chaque champ de monnaie garde une largeur exploitable et ne recouvre pas le suivant", async () => {
    const html = renderTemplate("actor/tab-inventory.hbs", {
      system: { currency: { pc: 10, pa: 5, po: 2, pp: 1 } },
      currencyTotalCopper: 1250,
      weaponsAndArmor: [],
      gearAndTools: [],
      weaponStats: {},
      armorStats: {},
      carriedWeight: 10,
      carryingCapacity: 75,
      carryingCapacityPercent: 13,
      overCapacity: false
    });
    await page.setViewportSize({ width: 800, height: 600 });
    await page.setContent(buildPage(wrapActorTab(html)));

    const inputs = page.locator(
      'input[name="system.currency.pc"], input[name="system.currency.pa"], input[name="system.currency.po"], input[name="system.currency.pp"]'
    );
    const boxes = await inputs.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect()).map((rect) => ({ x: rect.x, width: rect.width, y: rect.y }))
    );
    assert.equal(boxes.length, 4);

    for (const box of boxes) {
      assert.ok(box.width > 10, `champ de monnaie écrasé à ${box.width}px de large (bug historique : chevauchement)`);
    }

    // Triées par position horizontale : chaque case doit se terminer avant que la suivante
    // commence (tolérance de 1px pour l'arrondi sous-pixel du navigateur).
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      assert.ok(
        sorted[i].x >= sorted[i - 1].x + sorted[i - 1].width - 1,
        `chevauchement détecté entre les cases de monnaie ${i - 1} et ${i}`
      );
    }
  });
});

describe("Fiche d'objet Arme — défilement interne quand le contenu dépasse", () => {
  test("le contenu déborde et devient scrollable plutôt que coupé sans accès (bug historique)", async () => {
    // Contexte "maximal" : active tous les champs optionnels (portée, rechargement...) pour
    // forcer le débordement, comme une vraie arme à distance rechargeable complètement remplie.
    const html = renderTemplate("item/weapon-sheet.hbs", {
      item: { img: "", name: "Arbalète lourde" },
      system: {
        weaponType: "rangedMartial",
        slot: "mainHand",
        price: { pp: 0, po: 50, pa: 0, pc: 0 },
        damage: { dice: "1d10", type: "piercing" },
        damageVersatile: { dice: "" },
        weight: 9,
        quantity: 1,
        equipped: true,
        properties: {
          handedness: "twoHanded",
          versatile: false,
          finesse: false,
          light: false,
          thrown: false,
          heavy: true,
          reach: false,
          reload: true,
          reloadValue: 1,
          range: { normal: 30, long: 120 },
          special: ""
        },
        description: "<p>".repeat(1) + "Une arbalète massive.</p>"
      },
      config: {
        weaponTypes: { meleeSimple: "x", meleeMartial: "x", rangedSimple: "x", rangedMartial: "x" },
        weaponHandedness: { oneHanded: "x", twoHanded: "x" },
        damageTypes: { bludgeoning: "x", piercing: "x", slashing: "x" }
      },
      showSlotSelect: true,
      slotOptions: { mainHand: "DND_CUSTOM.Equipment.MainHand" },
      offHandRequiresLightNote: false,
      isRanged: true,
      showRange: true,
      showReloadValue: true
    });

    // Fenêtre volontairement basse (comme une petite fenêtre Foundry) : 600px de haut, donc
    // max-height:85vh (cf. styles/dnd-custom-ai.css > .dnd-custom-ai.sheet.item) plafonne le
    // panneau à 510px, bien en dessous du contenu réel du formulaire ci-dessus.
    await page.setViewportSize({ width: 480, height: 600 });
    await page.setContent(buildPage(wrapItemSheet(html)));

    const panel = page.locator(".dnd-custom-ai.sheet.item");
    const { scrollHeight, clientHeight, overflowY } = await panel.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY
    }));

    assert.ok(scrollHeight > clientHeight, `contenu (${scrollHeight}px) ne dépasse pas le panneau (${clientHeight}px) — le test ne force pas assez de contenu`);
    assert.ok(["auto", "scroll"].includes(overflowY), `overflow-y calculé = "${overflowY}", attendu auto/scroll pour permettre le défilement`);

    // Défilement réellement utilisable : la position peut être déplacée vers le bas du contenu.
    await panel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const scrollTop = await panel.evaluate((element) => element.scrollTop);
    assert.ok(scrollTop > 0, "le panneau ne défile pas (scrollTop reste à 0 après tentative)");
  });
});
