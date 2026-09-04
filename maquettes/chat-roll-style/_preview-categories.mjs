// Vérification avec le VRAI CSS système (dnd-custom-ai.css, via buildPage) des 5 catégories de
// jet + icône de classe, en simulant ce que pose le hook renderChatMessageHTML (classes
// dnd-roll-attack/-save/-damage/-heal + <i class="dnd-class-icon">, cf. dnd-custom-ai.js).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPage } from "../../tests/support/html-page.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

function chatCard({ sender, sub, flavor, formula, total, kind, classIcon }) {
  const kindClass = kind ? `dnd-roll-${kind}` : "";
  return `<li class="chat-message message dnd-sheet-roll ${kindClass}" style="margin-bottom:16px;width:320px;font-family:Signika,'Segoe UI',sans-serif;font-size:13px;color:#191813;">
    <div class="message-header" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#7a7971;margin-bottom:4px;">
      ${classIcon ? `<i class="fa-solid ${classIcon} dnd-class-icon" aria-hidden="true"></i>` : ""}
      <span class="message-sender" style="font-weight:700;flex:1;">${sender}</span>
      <span class="message-metadata">à l'instant</span>
    </div>
    <div class="message-content">
      <div class="flavor-text">${flavor}${sub ? ` <span style="font-weight:400;font-size:.85em;opacity:.8;">(${sub})</span>` : ""}</div>
      <div class="dice-roll">
        <div class="dice-result">
          <div class="dice-formula">${formula}</div>
          <div class="dice-total">${total}</div>
        </div>
      </div>
    </div>
  </li>`;
}

const cards = [
  chatCard({ sender: "Lyra Chanteprime", flavor: "Persuasion (CHA)", formula: "1d20 + 7", total: "21", kind: null, classIcon: "fa-music" }),
  chatCard({ sender: "Lyra Chanteprime", flavor: "Rapière — Attaque", formula: "1d20 + 6", total: "18", kind: "attack", classIcon: "fa-music" }),
  chatCard({ sender: "Lyra Chanteprime", flavor: "Jet de sauvegarde de la mort", formula: "1d20", total: "14", kind: "save", classIcon: "fa-music" }),
  chatCard({ sender: "Lyra Chanteprime", flavor: "Rapière — Dégâts", formula: "1d8 + 3", total: "9", kind: "damage", classIcon: "fa-music" }),
  chatCard({ sender: "Sire Alden", flavor: "Mot de guérison", formula: "1d4 + 4", total: "8", kind: "heal", classIcon: "fa-cross" }),
  chatCard({ sender: "Bran Sanglier", sub: "PNJ, pas d'icône de classe", flavor: "Morsure — Attaque", formula: "1d20 + 4", total: "16", kind: "attack", classIcon: null })
];

const html = `<ul class="chat-log" style="list-style:none;margin:0;padding:20px;background:#1e1e22;display:flex;gap:20px;flex-wrap:wrap;">${cards.join("")}</ul>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(buildPage(html));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(dir, "reel-categories.png"), fullPage: true });
console.log("ok");
await browser.close();
