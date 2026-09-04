import { chromium } from "playwright";
import { renderTemplate } from "../../tests/support/handlebars-env.js";
import { buildPage } from "../../tests/support/html-page.js";
const ctx = {
  actor:{img:"",name:"Gobelin éclaireur"}, isGM:true, hpPercent:70,
  creatureTypeOptions:[{key:"humanoid",label:"Humanoïde",selected:true}],
  sizeOptions:[{key:"small",label:"P",selected:true}],
  challengeRatingOptions:[{value:"1/4",selected:true}],
  system:{attributes:{hp:{value:7,max:10,temp:0},ac:{value:15},speed:30},xpReward:50,creatureType:"humanoid",size:"small",challengeRating:"1/4"}
};
const html = renderTemplate("actor/npc-sheet.hbs", ctx).split("</header>")[0] + "</header>";
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:700,height:400},deviceScaleFactor:2});
await p.setContent(buildPage(`<div class="dnd-custom-ai sheet actor npc" style="width:640px;">${html}</div>`));
await p.waitForTimeout(200);
await p.locator(".sheet-header").screenshot({path:"maquettes/fiche-708x768/reel-npc-header.png"});
console.log("ok"); await b.close();
