// Illustration : rendu réel de l'en-tête + une infobulle de glossaire (style approché de
// celle de Foundry) affichée au survol du libellé "PV", pour visualiser le rendu final.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { renderTemplate } from "../../tests/support/handlebars-env.js";
import { buildPage } from "../../tests/support/html-page.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const glossary = new Map(
  JSON.parse(readFileSync(path.join(dir, "..", "..", "scripts", "data", "glossary.json"), "utf8")).map((e) => [e.key, e.definition])
);

const header = renderTemplate("actor/character-sheet.hbs", {
  actor: { img: "", name: "Lyra Chanteprime" },
  system: { xp: 3400, attributes: { level: 5, hp: { value: 27, max: 32, temp: 0 }, ac: { value: 15 }, speed: 30, inspirationPoints: 1 } },
  isGM: false, xpPercent: 45, levelUpAvailable: true, classLabel: "Barde", originLabel: "Demi-elfe",
  subclassAvailable: true, subclassLabel: "Collège du Savoir",
  subclassOptions: [{ key: "lore", label: "Collège du Savoir", selected: true }],
  hpPercent: 84, initiative: { modLabel: "+3" }, passivePerception: 14,
  dying: { active: false }, showCreationWizardButton: false
});

const tip = glossary.get("ca");
const page = `<div class="dnd-custom-ai sheet actor character" style="width:708px;position:relative;">
  ${header}
  <div style="position:absolute;left:355px;top:120px;max-width:320px;background:#111;color:#f0f0f0;
       border:1px solid #000;border-radius:4px;padding:7px 10px;font:13px/1.45 system-ui;
       box-shadow:0 6px 20px rgba(0,0,0,.5);z-index:10;">
    ${tip}
    <div style="position:absolute;left:36px;top:-6px;width:10px;height:10px;background:#111;
         border-left:1px solid #000;border-top:1px solid #000;transform:rotate(45deg);"></div>
  </div>
</div>`;

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 760, height: 400 }, deviceScaleFactor: 2 });
await p.setContent(buildPage(page));
await p.waitForTimeout(250);
await p.locator(".dnd-custom-ai.sheet.actor.character").screenshot({ path: path.join(dir, "reel-tooltip-exemple.png") });
console.log("ok");
await browser.close();
