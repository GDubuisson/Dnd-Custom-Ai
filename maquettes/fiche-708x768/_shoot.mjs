import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const file = 'file://' + path.join(dir, 'maquette-fiche-708x768.html').replace(/\\/g, '/');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 2 });
await page.goto(file);
await page.waitForTimeout(600); // fonts

const frame = page.locator('#frame');
const tabs = ['stats', 'equipment', 'inventory', 'abilities', 'journal'];

for (const t of tabs) {
  await page.locator(`#tabs button[data-tab="${t}"]`).click();
  await page.waitForTimeout(150);
  await frame.screenshot({ path: path.join(dir, `apercu-${t}.png`) });
  console.log('ok', t);
}

// vue "confortable" sur l'onglet stats
await page.locator('#tabs button[data-tab="stats"]').click();
await page.locator('[data-density="cozy"]').click();
await page.waitForTimeout(150);
await frame.screenshot({ path: path.join(dir, 'apercu-confortable-stats.png') });
console.log('ok cozy');

await browser.close();
