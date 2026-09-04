// Vérification avec le VRAI CSS système (dnd-custom-ai.css, via buildPage) sur une structure de
// carte de chat Foundry reconstituée (mêmes classes que le cœur : .chat-message, .message-header,
// .message-sender, .flavor-text, .message-content, .dice-roll > .dice-result > .dice-formula/
// .dice-tooltip/.dice-total).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPage } from "../../tests/support/html-page.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

function chatCard({ sender, flavor, formula, total, styled, withTooltipOpen = false }) {
  return `<li class="chat-message message ${styled ? "dnd-sheet-roll" : ""}" style="margin-bottom:16px;max-width:340px;background:#ededed;border:1px solid #999;border-radius:5px;padding:8px;font-family:Signika,'Segoe UI',sans-serif;font-size:13px;color:#191813;box-shadow:0 1px 3px rgba(0,0,0,.4);">
    <div class="message-header" style="display:flex;justify-content:space-between;font-size:11px;color:#7a7971;margin-bottom:4px;">
      <span class="message-sender" style="font-weight:700;">${sender}</span>
      <span class="message-metadata">à l'instant</span>
    </div>
    <div class="message-content">
      <div class="flavor-text" style="font-style:italic;color:#4b4a44;margin:2px 0 6px;">${flavor}</div>
      <div class="dice-roll">
        <div class="dice-result" style="background:#f5f5f5;border:1px solid #c9c7b8;border-radius:3px;overflow:hidden;">
          <div class="dice-formula" style="background:#e8e6d8;padding:4px 6px;font-family:monospace;font-size:12px;border-bottom:1px solid #c9c7b8;">${formula}</div>
          ${withTooltipOpen ? `<div class="dice-tooltip" style="background:#fff;padding:4px 6px;font-size:11px;border-bottom:1px solid #c9c7b8;">d20 (14) + 7</div>` : ""}
          <div class="dice-total" style="padding:6px;text-align:center;font-size:20px;font-weight:700;">${total}</div>
        </div>
      </div>
    </div>
  </li>`;
}

const html = `<ul class="chat-log" style="list-style:none;margin:0;padding:20px;background:#1e1e22;display:flex;gap:20px;flex-wrap:wrap;">
  <div>
    <p style="color:#c9b072;font-family:Georgia,serif;margin:0 0 8px;">Sans style (jet /r tapé à la main)</p>
    ${chatCard({ sender: "Lyra Chanteprime", flavor: "Persuasion (CHA)", formula: "1d20 + 7", total: "21", styled: false })}
  </div>
  <div>
    <p style="color:#c9b072;font-family:Georgia,serif;margin:0 0 8px;">.dnd-sheet-roll (jet depuis la fiche)</p>
    ${chatCard({ sender: "Lyra Chanteprime", flavor: "Persuasion (CHA)", formula: "1d20 + 7", total: "21", styled: true })}
    ${chatCard({ sender: "Lyra Chanteprime", flavor: "Rapière — Dégâts", formula: "1d8 + 3", total: "9", styled: true })}
    ${chatCard({ sender: "Lyra Chanteprime", flavor: "Persuasion (CHA) (avec le détail ouvert)", formula: "1d20 + 7", total: "21", styled: true, withTooltipOpen: true })}
  </div>
</ul>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 2 });
await page.setContent(buildPage(html));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(dir, "reel-css-systeme.png"), fullPage: true });
console.log("ok");
await browser.close();
