// Tests d'intégration Quench : s'exécutent DANS un vrai monde Foundry (vrai pipeline
// Document/DataModel, permissions, sockets...), contrairement à tests/unit et tests/dom qui
// appellent les fonctions/DataModels sur des fixtures isolées (cf. tests/README.md >
// "Limites connues"). Chargé uniquement si ce module (dnd-custom-ai-quench-tests) et le
// module "quench" sont tous les deux actifs dans le monde de test — jamais dans le système
// livré (cf. tests/quench/module.json, non référencé par system.json).
//
// Import direct des fonctions système (chemin absolu depuis la racine, ce module vit hors de
// systems/dnd-custom-ai/ — cf. docker-compose.yml qui le monte sous /data/Data/modules/) :
// grantClassContent/grantLanguages sont exportées et appelables telles quelles (T-WIZ-016/017
// ci-dessous). #grantStartingEquipment (T-WIZ-014/015) est une méthode privée de
// CharacterCreationWizard, donc inatteignable directement — submitWizardForm ci-dessous rejoue
// la vraie soumission du formulaire (mêmes lecture/écriture DOM que #onSubmit) plutôt que d'en
// dupliquer la logique dans ce test, qui ne prouverait alors plus rien sur le vrai code.
import { grantClassContent, grantLanguages } from "/systems/dnd-custom-ai/scripts/helpers/class-content.js";
import { CharacterCreationWizard } from "/systems/dnd-custom-ai/scripts/sheets/character-creation-wizard.js";

/** Rejoue une soumission valide de l'assistant de création sans passer par des clics Cypress :
 *  ce module Quench tourne dans le vrai client (Chromium, via cypress/e2e/quench.cy.js), donc le
 *  vrai DOM de l'Application est disponible — seule la manière d'y écrire diffère (affectation
 *  directe plutôt que simulation d'interaction utilisateur), ce qui reste fidèle au vrai
 *  gestionnaire de soumission (#onSubmit) puisque c'est bien lui qui est déclenché au clic.
 *  `abilities` est facultatif : la répartition par défaut du formulaire (cf. STANDARD_ARRAY,
 *  character-creation-wizard.js) est déjà une permutation valide du tableau standard.
 *  N'attend PAS la fin d'une soumission invalide (le formulaire ne se ferme jamais dans ce cas,
 *  cf. #onSubmit) — réservé aux scénarios de soumission valide. */
async function submitWizardForm(actor, { name, origin, classKey, abilities, skills }) {
  const wizard = new CharacterCreationWizard(actor);
  await wizard.render(true);
  // Laisse le premier rendu (et son câblage d'évènements, cf. _onRender) se terminer avant de
  // lire/écrire le DOM.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const root = wizard.element;
  if (name !== undefined) root.querySelector('input[name="name"]').value = name;
  root.querySelector('select[name="origin"]').value = origin;
  root.querySelector('select[name="classKey"]').value = classKey;
  for (const [key, value] of Object.entries(abilities ?? {})) {
    root.querySelector(`select[name="abilities.${key}"]`).value = String(value);
  }
  for (const key of skills) {
    root.querySelector(`input[type="checkbox"][name="skills.${key}"]`).checked = true;
  }

  // #onSubmit ferme l'assistant (`this.close()`) juste après avoir tout octroyé (équipement,
  // contenu de classe, langues) : attendre le hook "close<NomDeClasse>" standard d'AppV2 garantit
  // que la soumission est intégralement terminée, contrairement à un simple hook "updateActor"
  // qui résoudrait dès le premier des deux actor.update() de #onSubmit (cf. son commentaire).
  // Sélecteur/nom de hook à vérifier au premier lancement réel (pas de Docker/licence Foundry
  // disponible au moment d'écrire ce test, cf. tests/README.md > "Limites connues").
  const closed = new Promise((resolve, reject) => {
    Hooks.once("closeCharacterCreationWizard", resolve);
    setTimeout(
      () => reject(new Error("closeCharacterCreationWizard n'a jamais été déclenché — soumission invalide ou hook renommé ?")),
      10000
    );
  });
  root.querySelector('button[type="submit"]').click();
  await closed;
}

Hooks.on("quenchReady", (quench) => {
  quench.registerBatch(
    "dndCustomAi.actorCreation",
    (context) => {
      const { describe, it, assert, after } = context;

      describe("Création d'un Actor character", () => {
        const createdActorIds = [];

        after(async () => {
          if (createdActorIds.length) {
            await Actor.deleteDocuments(createdActorIds);
            createdActorIds.length = 0;
          }
        });

        it("se crée sans erreur avec le système dnd-custom-ai actif", async () => {
          assert.equal(game.system.id, "dnd-custom-ai");

          const actor = await Actor.create({ name: "Quench Test Actor", type: "character" });
          createdActorIds.push(actor.id);

          assert.ok(actor, "L'Actor aurait dû être créé");
          assert.equal(actor.type, "character");
          // Vierge (pas de classe/origine) : cf. #onOpenCreationWizard/Hooks createActor,
          // scripts/dnd-custom-ai.js — l'assistant de création prend le relais, pas testé ici.
          assert.equal(actor.system.class, "");
          assert.equal(actor.system.origin, "");
        });

        it("calcule les PV max dérivés via le vrai pipeline Document (classe + niveau + CON)", async () => {
          const actor = await Actor.create({ name: "Quench Test Actor - PV", type: "character" });
          createdActorIds.push(actor.id);

          // Guerrier (d10), CON value 14 (mod +2, cf. helpers/rules.js#abilityModifier) :
          // valeurs choisies arbitrairement, seule la cohérence du calcul est vérifiée ici, pas
          // un nombre en dur qui casserait si la table de dés de vie change.
          await actor.update({
            "system.class": "guerrier",
            "system.attributes.level": 1,
            "system.abilities.con.value": 14
          });

          assert.isAbove(actor.system.attributes.hp.max, 0, "PV max doit être calculé (>0)");
          assert.isAtMost(
            actor.system.attributes.hp.value,
            actor.system.attributes.hp.max,
            "PV actuels ne doivent jamais dépasser le max (cf. clamp, retour testeur FIRST_FEEDBACK.md)"
          );
        });
      });
    },
    { displayName: "D&D Custom Ai — Actor" }
  );

  // Section 1 de tests/E2E_TEST_PLAN.md (assistant de création) : volet "calcul" des scénarios
  // E2E+Quench, complémentaire de cypress/e2e/wizard.cy.js qui vérifie l'affichage/l'interaction
  // (cf. sa section "Conventions" : "Quench vérifie le calcul, E2E vérifie qu'il s'affiche
  // correctement"). Tourne en session Gamemaster (cf. cypress/e2e/quench.cy.js), donc réservé aux
  // scénarios dont l'issue ne dépend pas de l'identité Joueur/MJ (T-WIZ-012/013 concernent
  // justement cette identité et restent testés uniquement dans wizard.cy.js, avec les deux
  // sessions nécessaires).
  quench.registerBatch(
    "dndCustomAi.wizard",
    (context) => {
      const { describe, it, assert, after } = context;

      describe("Assistant de création — octroi d'équipement, capacités/sorts, langues", () => {
        const createdActorIds = [];

        after(async () => {
          if (createdActorIds.length) {
            await Actor.deleteDocuments(createdActorIds);
            createdActorIds.length = 0;
          }
        });

        it("attribue l'équipement de départ (arme + armure) au personnage (T-WIZ-014)", async () => {
          const weaponExists = game.items.getName("Épée longue");
          const armorExists = game.items.getName("Cotte de mailles");
          assert.ok(
            weaponExists && armorExists,
            "Prérequis : Items du monde 'Épée longue'/'Cotte de mailles' introuvables — " +
              "importés automatiquement au premier chargement du monde (cf. world-items/README.md)"
          );

          const actor = await Actor.create({ name: "Quench Wizard Fighter", type: "character" });
          createdActorIds.push(actor.id);

          await submitWizardForm(actor, {
            origin: "ravenmoor",
            classKey: "fighter",
            skills: ["athletics", "intimidation"]
          });

          const weapon = actor.items.find((item) => item.type === "weapon" && item.name === "Épée longue");
          const armor = actor.items.find((item) => item.type === "armor" && item.name === "Cotte de mailles");
          assert.ok(weapon, "L'arme de départ du fighter aurait dû être attribuée");
          assert.ok(armor, "L'armure de départ du fighter aurait dû être attribuée");
          assert.isTrue(weapon.system.equipped);
          assert.isTrue(armor.system.equipped);
        });

        it("avertit sans bloquer la création si l'équipement de départ est introuvable (T-WIZ-015)", async () => {
          const staffItem = game.items.getName("Bâton");
          assert.ok(
            staffItem,
            "Prérequis : Item du monde 'Bâton' introuvable — importé automatiquement au premier " +
              "chargement du monde (cf. world-items/README.md)"
          );
          const staffData = staffItem.toObject();
          delete staffData._id;
          await staffItem.delete();

          let warned = false;
          const originalWarn = ui.notifications.warn.bind(ui.notifications);
          ui.notifications.warn = (message) => {
            warned = true;
            return originalWarn(message);
          };

          try {
            // monk : arme de départ "Bâton" (qu'on vient de retirer), pas d'armure de départ
            // (cf. DND_CUSTOM.classStartingEquipment) — seul cas où une seule ressource
            // manquante suffit à déclencher l'avertissement sans qu'une autre soit trouvée.
            const actor = await Actor.create({ name: "Quench Wizard Monk", type: "character" });
            createdActorIds.push(actor.id);

            await submitWizardForm(actor, {
              origin: "fleuraine",
              classKey: "monk",
              skills: ["acrobatics", "athletics"]
            });

            assert.isTrue(warned, "Avertissement StartingEquipmentMissing attendu");
            assert.equal(actor.system.class, "monk", "la création doit aboutir malgré l'équipement manquant");
            assert.equal(
              actor.items.filter((item) => item.type === "weapon").length,
              0,
              "aucune arme ne doit avoir été attribuée"
            );
          } finally {
            ui.notifications.warn = originalWarn;
            await Item.create(staffData);
          }
        });

        it("octroie les Capacités/Sorts de niveau 1 pour une classe lanceuse de sorts (T-WIZ-016)", async () => {
          const actor = await Actor.create({ name: "Quench Wizard Caster", type: "character" });
          createdActorIds.push(actor.id);
          await actor.update(
            { "system.class": "wizard", "system.attributes.level": 1 },
            { dndCustomWizard: true }
          );

          const grantedNames = await grantClassContent(actor, "wizard", 1);
          assert.isAbove(
            grantedNames.length,
            0,
            "Prérequis : compendiums Capacités/Sorts vides pour 'wizard' niveau 1 — importés " +
              "automatiquement au premier chargement du monde (cf. world-items/README.md)"
          );

          const features = actor.items.filter((item) => item.type === "feature");
          const spells = actor.items.filter((item) => item.type === "spell" && (item.system.level ?? 0) <= 1);
          assert.isAbove(features.length + spells.length, 0, "au moins une Capacité ou un Sort/tour de magie attendu");
        });

        it("octroie Commune et la langue propre à l'Origine choisie (T-WIZ-017)", async () => {
          const actor = await Actor.create({ name: "Quench Wizard Languages", type: "character" });
          createdActorIds.push(actor.id);

          const grantedNames = await grantLanguages(actor, "fleuraine");
          assert.includeMembers(grantedNames, ["Commune", "Fleurain"]);

          const ownedLanguages = actor.items.filter((item) => item.type === "language").map((item) => item.name);
          assert.include(ownedLanguages, "Commune");
          assert.include(ownedLanguages, "Fleurain");
        });
      });
    },
    { displayName: "D&D Custom Ai — Assistant de création" }
  );
});
