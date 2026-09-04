// Rendu de vérification : VRAIS templates .hbs + VRAI CSS système, à 708 × 768.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderTemplate } from "../../tests/support/handlebars-env.js";
import { buildPage } from "../../tests/support/html-page.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

const base = {
  actor: { img: "", name: "Lyra Chanteprime" },
  isGM: true,
  levelUpAvailable: true,
  xpNextThreshold: 6500,
  xpPercent: 45,
  classLabel: "Barde",
  originLabel: "Demi-elfe",
  hpPercent: 84,
  initiative: { modLabel: "+3" },
  passivePerception: 14,
  proficiencyBonus: 3,
  reactionAvailable: true,
  actionAvailable: true,
  bonusActionAvailable: false,
  subclassAvailable: true,
  subclassLabel: "Collège du Savoir",
  subclassOptions: [{ key: "lore", label: "Collège du Savoir", selected: true }],
  pendingAsiChoices: 0,
  dying: { active: false },
  showCreationWizardButton: false,
  activeConditions: [],
  system: {
    xp: 3400,
    biography: "",
    notes: "",
    attributes: { level: 5, hp: { value: 27, max: 32, temp: 0 }, ac: { value: 15 }, speed: 30, inspirationPoints: 1, exhaustion: 0 },
    abilities: {
      str: { value: 8, total: 8 }, dex: { value: 16, total: 16 }, con: { value: 14, total: 14 },
      int: { value: 12, total: 12 }, wis: { value: 10, total: 10 }, cha: { value: 18, total: 18 }
    },
    skills: {},
    combat: {}
  }
};

const abilities = [
  ["Force", 8, "−1", "−1", false], ["Dextérité", 16, "+3", "+3", true],
  ["Constitution", 14, "+2", "+2", false], ["Intelligence", 12, "+1", "+1", false],
  ["Sagesse", 10, "+0", "+0", false], ["Charisme", 18, "+4", "+7", true]
].map(([label, total, modLabel, saveMod, proficient]) => ({
  key: label.slice(0, 3).toLowerCase(), label, value: total, total, originBonus: 0,
  mod: 0, modLabel, save: { proficient, mod: saveMod }
}));

const skillNames = [
  "Acrobaties", "Arcanes", "Athlétisme", "Discrétion", "Dressage", "Escamotage", "Histoire",
  "Intimidation", "Investigation", "Médecine", "Nature", "Perception", "Persuasion", "Religion",
  "Représentation", "Survie", "Tromperie"
];
const skills = skillNames.map((label, i) => ({
  key: `s${i}`, label, ability: ["FOR", "DEX", "CON", "INT", "SAG", "CHA"][i % 6],
  proficient: [3, 4, 6, 7, 8, 11, 12, 14].includes(i),
  originAdvantage: false, armorDisadvantage: false, jackOfAllTrades: false,
  mod: 0, modLabel: [3, 4, 6, 7, 8, 11, 12, 14].includes(i) ? "+7" : "+2"
}));

const statsContext = {
  ...base,
  tab: { cssClass: "active" },
  conditions: [], activeConditions: [], damageAffinityGroups: [], damageAffinitySummary: [],
  abilities, skills,
  proficiencyBonus: 3, passivePerception: 14, initiative: { modLabel: "+3" }
};

const headerHtml = renderTemplate("actor/character-sheet.hbs", base);
const navHtml = `<nav class="tabs sheet-tabs">
  ${["Caractéristiques", "Équipement", "Inventaire", "Capacités", "Journal"].map((t, i) =>
    `<a class="item ${i === 0 ? "active" : ""}"><i class="fa-solid fa-chart-simple"></i>${t}</a>`).join("")}
</nav>`;
const statsHtml = renderTemplate("actor/tab-stats.hbs", statsContext);

const page = `<div class="dnd-custom-ai sheet actor character" style="width:708px;height:768px;display:flex;flex-direction:column;">
  ${headerHtml}
  ${navHtml}
  <div class="tab stats active" data-tab="stats" style="flex:1 1 auto;min-height:0;overflow-y:auto;">${statsHtml}</div>
</div>`;

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 760, height: 820 }, deviceScaleFactor: 2 });
await p.setContent(buildPage(page));
await p.waitForTimeout(300);
await p.locator(".dnd-custom-ai.sheet.actor.character").screenshot({ path: path.join(dir, "reel-stats-708x768.png") });
console.log("ok");
await browser.close();
