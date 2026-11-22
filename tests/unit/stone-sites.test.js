import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stoneSitePageContent } from "../../scripts/helpers/stone-sites-journal.js";

const SITES = JSON.parse(readFileSync(new URL("../../scripts/data/stone-sites.json", import.meta.url), "utf8"));
const NPC_NAMES = new Set(
  JSON.parse(readFileSync(new URL("../../world-items/npcs.json", import.meta.url), "utf8")).map((npc) => npc.name)
);

describe("stoneSitePageContent — page MJ d'un site de pierre", () => {
  test("titres, paragraphes, liste à intitulés et tableau, texte échappé", () => {
    const html = stoneSitePageContent({
      sections: [
        { title: "Le site", paragraphs: ["Froid <mordant> & vent"] },
        { title: "Fins", items: [{ label: "Bonne fin", text: "Kisaeth renaît." }] },
        { title: "Rencontres", table: { head: ["PJ", "Bande"], rows: [["niv. 3-4", "Porteur"]] } }
      ]
    });
    assert.equal(
      html,
      "<h2>Le site</h2><p>Froid &lt;mordant&gt; &amp; vent</p>" +
        "<h2>Fins</h2><ul><li><strong>Bonne fin.</strong> Kisaeth renaît.</li></ul>" +
        "<h2>Rencontres</h2><table><thead><tr><th>PJ</th><th>Bande</th></tr></thead><tbody><tr><td>niv. 3-4</td><td>Porteur</td></tr></tbody></table>"
    );
  });
});

describe("scripts/data/stone-sites.json — pages des sites de pierre", () => {
  test("chaque site a un nom et des sections titrées non vides", () => {
    assert.ok(SITES.length > 0);
    for (const site of SITES) {
      assert.ok(site.name, "site sans nom");
      for (const section of site.sections) {
        assert.ok(section.title, `${site.name} : section sans titre`);
        assert.ok(section.paragraphs?.length || section.items?.length || section.table, `${site.name} > ${section.title} vide`);
        if (section.table) {
          for (const row of section.table.rows) assert.equal(row.length, section.table.head.length, `${site.name} : ligne de tableau incomplète`);
        }
      }
    }
  });

  test("Tirwen : les fiches citées existent, avec les fins et le cas du capitaine", () => {
    for (const name of ["Capitaine pirate", "Fidèle du capitaine", "Traître de l'équipage", "Pilote du passage", "Sentinelle de la base", "Singe géant de Tirwen", "Tertre errant de Tirwen", "Crocodile géant de Tirwen", "Araignée géante de Tirwen", "Ronce-aiguille de Tirwen", "Liane étrangleuse de Tirwen", "Scorpion géant de Tirwen", "Guêpe géante de Tirwen", "Hyène géante de Tirwen"]) {
      assert.ok(NPC_NAMES.has(name), `fiche absente : ${name}`);
    }
    const text = JSON.stringify(SITES.find((site) => site.name === "Île de Tirwen"));
    for (const word of ["Bonne fin", "Mauvaise fin", "Rattraper la mauvaise fin", "Le capitaine saute le pas", "Quelle que soit l'issue"]) {
      assert.ok(text.includes(word), `Tirwen : « ${word} » manquant`);
    }
  });

  test("Zahir : les fiches citées existent, avec l'apaisement et les fins", () => {
    for (const name of ["Le sage du Zahir", "Momie invoquée", "Squelette invoqué", "Guide de Bir Azraq", "Vautour géant du Zahir", "Serpent venimeux géant du Zahir", "Scorpion géant du Zahir"]) {
      assert.ok(NPC_NAMES.has(name), `fiche absente : ${name}`);
    }
    const text = JSON.stringify(SITES.find((site) => site.name === "Désert de Zahir"));
    for (const word of ["Apaiser le sage", "Annoncer son nom", "Bonne fin", "Mauvaise fin", "Rattraper la mauvaise fin", "Option : le débordement"]) {
      assert.ok(text.includes(word), `Zahir : « ${word} » manquant`);
    }
  });

  test("Velencia : les fiches citées existent, avec les visions d'Estevan et les trois fins", () => {
    for (const name of ["Garde d'apparat de la cathédrale", "Sergent de la garde d'apparat", "Chanoine veilleur", "Frère de l'Ordre de la Flamme", "Déserteur des Passwachten", "Exécuteur d'Ulrich", "Lame d'Ulrich", "Champion d'Ulrich", "Ulrich (PJ niv. 9-12)", "Ulrich (PJ niv. 17-20)"]) {
      assert.ok(NPC_NAMES.has(name), `fiche absente : ${name}`);
    }
    const text = JSON.stringify(SITES.find((site) => site.name === "Souterrain de Velencia"));
    for (const word of ["Ouvrir le mur", "Les visions de dissuasion", "On ne le convainc pas", "Le sceau tient", "Bonne fin", "Mauvaise fin", "Rattraper la mauvaise fin", "Option : le sacrilège"]) {
      assert.ok(text.includes(word), `Velencia : « ${word} » manquant`);
    }
  });

  test("Kis : les fiches de Kisaeth et de Varhun citées existent dans le bestiaire", () => {
    for (const name of ["Kisaeth (renaissante)", "Kisaeth (éveillée)", "Kisaeth (pleine puissance)", "Varhun (oisillon)", "Varhun (jeune)", "Varhun (adulte)", "Champion d'Ulrich", "Lame d'Ulrich", "Exécuteur d'Ulrich", "Déserteur des Passwachten", "Mammouth de Kis", "Tigre à dents de sabre", "Loup arctique", "Méphite de glace"]) {
      assert.ok(NPC_NAMES.has(name), `fiche absente : ${name}`);
    }
    const kis = SITES.find((site) => site.name === "Désert gelé de Kis");
    const text = JSON.stringify(kis);
    for (const word of ["Bonne fin", "Mauvaise fin", "Rattraper la mauvaise fin", "Les PJ seuls", "La bande seule", "Les deux"]) {
      assert.ok(text.includes(word), `Kis : « ${word} » manquant`);
    }
  });
});
