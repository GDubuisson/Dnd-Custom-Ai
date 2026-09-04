import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const toUrl = (f) => "file://" + path.join(dir, f).split(path.sep).join("/");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1480, height: 640 }, deviceScaleFactor: 2 });

for (const [src, out] of [
  ["styles-jets-chat-v3.html", "comparatif-styles-jets-v3.png"]
]) {
  await page.goto(toUrl(src));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, out), fullPage: true });
  console.log("ok", out);
}
await browser.close();
