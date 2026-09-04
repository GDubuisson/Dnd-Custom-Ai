// Rendu de vérification des 5 onglets : VRAIS templates .hbs + VRAI CSS système, fenêtre 708 px.
// L'en-tête compact + la barre d'onglets sont repris tels quels ; seul l'onglet affiché change.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderTemplate } from "../../tests/support/handlebars-env.js";
import { buildPage } from "../../tests/support/html-page.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const WIDTH = 708;
const HEIGHT = 768;

/* ---------------- contexte commun (en-tête) ---------------- */
const header = {
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
  reactionAvailable: true,
  actionAvailable: true,
  bonusActionAvailable: false,
  subclassAvailable: true,
  subclassLabel: "Collège du Savoir",
  subclassOptions: [{ key: "lore", label: "Collège du Savoir", selected: true }],
  dying: { active: false },
  showCreationWizardButton: false,
  activeConditions: [],
  system: {
    xp: 3400,
    attributes: { level: 5, hp: { value: 27, max: 32, temp: 0 }, ac: { value: 15 }, speed: 30, inspirationPoints: 1 }
  }
};

const headerHtml = renderTemplate("actor/character-sheet.hbs", header);
const TAB_DEFS = [
  ["stats", "fa-chart-simple", "Caractéristiques"],
  ["equipment", "fa-shield-halved", "Équipement"],
  ["inventory", "fa-sack", "Inventaire"],
  ["abilities", "fa-book-sparkles", "Capacités"],
  ["journal", "fa-feather", "Journal"]
];
const tabsHtmlFor = (active) => `<nav class="tabs sheet-tabs">
  ${TAB_DEFS.map(([id, ic, lbl]) => `<a class="item ${id === active ? "active" : ""}" data-tab="${id}"><i class="fa-solid ${ic}"></i>${lbl}</a>`).join("")}
</nav>`;

/* ---------------- contextes par onglet ---------------- */
const img = "";

const equipmentCtx = {
  tab: { cssClass: "active" },
  equipment: {
    mainHand: { id: "w1", img, name: "Rapière", system: { description: "<p>Arme de finesse. Perforant.</p>" } },
    offHand: { id: "w2", img, name: "Dague", system: { description: "" } },
    offHandOccupiedByMainHand: false,
    armor: { id: "a1", img, name: "Armure de cuir clouté", system: { slot: "armor", description: "" } },
    accessories: [{ id: "a2", img, name: "Amulette de santé", system: { description: "<p>CON fixée à 19.</p>" } }]
  },
  weaponStats: {
    w1: { attackLabel: "+6", damageLabel: "1d8+3", proficient: true },
    w2: { attackLabel: "+6", damageLabel: "1d4+3", proficient: true }
  },
  armorStats: {
    a1: { acLabel: "12", typeLabel: "DND_CUSTOM.Item.ArmorTypes.light" },
    a2: { acLabel: "+0", typeLabel: "" }
  }
};

const invItem = (id, name, extra = {}) => ({ id, name, system: { quantity: 1, weight: 1, equipped: false, ...extra } });
const inventoryCtx = {
  tab: { cssClass: "active" },
  system: { currency: { pc: 14, pa: 8, po: 127, pp: 2 } },
  currencyTotalCopper: 128934,
  weaponsAndArmor: [
    invItem("w1", "Rapière", { equipped: true }),
    invItem("w2", "Dague", { quantity: 2, equipped: true }),
    invItem("w3", "Arbalète légère", { weight: 2.5 }),
    invItem("a1", "Armure de cuir clouté", { weight: 6.5, equipped: true })
  ],
  gearAndTools: [
    invItem("g1", "Luth"),
    invItem("g2", "Sac d'aventurier", { capacityBonus: 10, equipped: true, weight: 0 }),
    invItem("g3", "Potion de soins", { quantity: 3, weight: 0.25, consumable: true }),
    invItem("g4", "Torche", { quantity: 5, weight: 0.5 }),
    invItem("g5", "Rations (1 jour)", { quantity: 6 })
  ],
  weaponStats: {
    w1: { damageLabel: "1d8 P", proficient: true },
    w2: { damageLabel: "1d4 P", proficient: true },
    w3: { damageLabel: "1d8 P", proficient: false }
  },
  armorStats: { a1: { acLabel: "12" } },
  carriedWeight: 28.5,
  carryingCapacity: 60,
  carryingCapacityPercent: 47,
  overCapacity: false
};

const feat = (id, name, source, extra = {}) => ({ id, name, system: { source, description: `Description de ${name}.`, uses: {}, ...extra } });
const spell = (id, name, extra = {}) => ({ item: { id, name, system: { description: `Description de ${name}.`, ...extra } }, showDamageButton: Boolean(extra.attack) });
const abilitiesCtx = {
  tab: { cssClass: "active" },
  isSpellcaster: true,
  spellcasting: { dc: 15, attackBonusLabel: "+7" },
  languages: [
    { id: "l1", name: "Commun", system: { category: "standard", description: "" } },
    { id: "l2", name: "Elfique", system: { category: "standard", description: "" } },
    { id: "l3", name: "Nain", system: { category: "standard", description: "" } },
    { id: "l4", name: "Gnome", system: { category: "exotic", description: "" } }
  ],
  originTrait: { name: "Ascendance féerique", description: "Avantage aux jets de sauvegarde contre l'état charmé ; la magie ne peut pas vous endormir." },
  spellSlots: [
    { level: 1, value: 3, max: 4 },
    { level: 2, value: 2, max: 3 },
    { level: 3, value: 1, max: 2 }
  ],
  isPactMagic: false,
  concentratingOn: null,
  reactionAvailable: true,
  system: { attributes: { level: 5 } },
  featureChoiceMade: {},
  featureResourceState: {},
  companionAlreadySummoned: false,
  activeStatuses: new Set(),
  conditions: [],
  features: [
    feat("f1", "Inspiration bardique", "Barde", { uses: { value: 3, max: 4 } }),
    feat("f2", "Chant de repos", "Barde"),
    feat("f3", "Expertise", "Barde"),
    feat("f4", "Roublardise", "Collège du Savoir"),
    feat("f5", "Secrets magiques supplémentaires", "Collège du Savoir"),
    feat("f6", "Polyvalence", "Demi-elfe")
  ],
  hasAnySpells: true,
  spellsByLevel: [
    { level: 0, shortLabel: "Tours", label: "Sorts mineurs", active: false, spells: [spell("s0", "Moquerie cruelle", { attack: false })] },
    {
      level: 1, shortLabel: "Niv. 1", label: "Sorts de niveau 1", active: true,
      spells: [
        spell("s1", "Mot de guérison", { ritual: true }),
        spell("s2", "Image silencieuse", { concentration: true }),
        spell("s3", "Charme-personne", {}),
        spell("s4", "Trait dissonant", { attack: true, activation: "reaction", reactionTrigger: "Une créature vous inflige des dégâts" })
      ]
    },
    { level: 2, shortLabel: "Niv. 2", label: "Sorts de niveau 2", active: false, spells: [spell("s5", "Fou rire", { concentration: true })] },
    { level: 3, shortLabel: "Niv. 3", label: "Sorts de niveau 3", active: false, spells: [spell("s6", "Contresort", {})] }
  ]
};

const journalCtx = {
  tab: { cssClass: "active" },
  system: {
    biography: "<p>Née dans une troupe itinérante, Lyra a grandi entre les planches et les bibliothèques poussiéreuses des cités qu'elle traversait.</p><p>Recrutée par le Collège du Savoir de Val-Lumière, elle voyage pour retrouver les fragments d'une ballade capable, dit-on, de réveiller les morts.</p>",
    notes: "<p>• Le marchand de Padhran doit 40 po à la troupe.</p><p>• Ne PAS rejouer « La complainte du roi-liche » près d'un cimetière.</p>"
  }
};

const statsCtx = (() => {
  const abilityRow = (label, total, modLabel, saveMod, prof) => ({
    key: label.slice(0, 3).toLowerCase(), label, value: total, total, originBonus: 0, mod: 0, modLabel,
    save: { proficient: prof, mod: saveMod }
  });
  const skillRow = (label, ab, prof) => ({
    key: label, label, ability: ab, proficient: prof, originAdvantage: false, armorDisadvantage: false,
    jackOfAllTrades: false, mod: 0, modLabel: prof ? "+7" : "+2"
  });
  return {
    tab: { cssClass: "active" },
    conditions: [], activeConditions: [], damageAffinityGroups: [], damageAffinitySummary: [],
    proficiencyBonus: 3, passivePerception: 14, initiative: { modLabel: "+3" },
    system: { attributes: { exhaustion: 0 }, combat: {} },
    abilities: [
      abilityRow("Force", 8, "−1", "−1", false), abilityRow("Dextérité", 16, "+3", "+3", true),
      abilityRow("Constitution", 14, "+2", "+2", false), abilityRow("Intelligence", 12, "+1", "+1", false),
      abilityRow("Sagesse", 10, "+0", "+0", false), abilityRow("Charisme", 18, "+4", "+7", true)
    ],
    skills: [
      skillRow("Acrobaties", "DEX", false), skillRow("Arcanes", "INT", false), skillRow("Athlétisme", "FOR", false),
      skillRow("Discrétion", "DEX", true), skillRow("Dressage", "SAG", true), skillRow("Escamotage", "DEX", false),
      skillRow("Histoire", "INT", true), skillRow("Intimidation", "CHA", true), skillRow("Investigation", "INT", true),
      skillRow("Médecine", "SAG", false), skillRow("Nature", "INT", false), skillRow("Perception", "SAG", true),
      skillRow("Persuasion", "CHA", true), skillRow("Religion", "INT", false), skillRow("Représentation", "CHA", true),
      skillRow("Survie", "SAG", false), skillRow("Tromperie", "CHA", true)
    ]
  };
})();

const tabs = {
  stats: renderTemplate("actor/tab-stats.hbs", statsCtx),
  equipment: renderTemplate("actor/tab-equipment.hbs", equipmentCtx),
  inventory: renderTemplate("actor/tab-inventory.hbs", inventoryCtx),
  abilities: renderTemplate("actor/tab-abilities.hbs", abilitiesCtx),
  journal: renderTemplate("actor/tab-journal.hbs", journalCtx)
};

// <prose-mirror> est un élément Foundry : on le remplace par une zone de texte figée pour la capture.
tabs.journal = tabs.journal.replace(
  /<prose-mirror class="content-sized" name="system\.(\w+)" value="([^"]*)"><\/prose-mirror>/g,
  (_m, _name, value) => `<div class="content-sized" style="min-height:8rem;border:1px solid var(--dca-outline-variant);border-radius:0.3rem;padding:0.6rem 0.8rem;background:var(--dca-surface-lowest);">${value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')}</div>`
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH + 40, height: HEIGHT + 60 }, deviceScaleFactor: 2 });

for (const [id, tabHtml] of Object.entries(tabs)) {
  const html = `<div class="dnd-custom-ai sheet actor character" style="width:${WIDTH}px;height:${HEIGHT}px;display:flex;flex-direction:column;overflow:hidden;">
    ${headerHtml}
    ${tabsHtmlFor(id)}
    <div class="tab ${id} active" data-tab="${id}" style="flex:1 1 auto;min-height:0;overflow-y:auto;">${tabHtml}</div>
  </div>`;
  await page.setContent(buildPage(html));
  await page.waitForTimeout(250);
  await page.locator(".dnd-custom-ai.sheet.actor.character").screenshot({ path: path.join(dir, `reel-${id}-708.png`) });
  console.log("ok", id);
}

await browser.close();
