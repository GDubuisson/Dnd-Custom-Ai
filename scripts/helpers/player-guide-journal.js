import { DND_CUSTOM } from "./config.js";

const SYSTEM_ID = "dnd-custom-ai";

/** Enrobe `text` dans un `<abbr title="...">` pointant vers la définition de `term` dans le
 *  glossaire (cf. scripts/data/glossary.json) : tooltip natif du navigateur, sans JS
 *  supplémentaire. Renvoie `text` tel quel si le terme est introuvable (ne bloque jamais le
 *  rendu pour un simple lien de confort manquant). */
function glossaryAbbr(glossary, term, text = term) {
  const entry = glossary.find((candidate) => candidate.term === term);
  if (!entry) return text;
  const title = entry.definition.replace(/"/g, "&quot;");
  return `<abbr title="${title}">${text}</abbr>`;
}

async function loadJson(relativePath) {
  const response = await fetch(`systems/${SYSTEM_ID}/${relativePath}`);
  return response.json();
}

function buildGlossaryPage(glossary) {
  const entries = glossary
    .map((entry) => `<dt><strong>${entry.term}</strong></dt><dd>${entry.definition}</dd>`)
    .join("");
  return `<p>Définitions des termes de jeu utilisés sur ce système, par ordre logique (des bases
    vers les notions plus spécifiques). Ces mêmes termes apparaissent en infobulle (survol à la
    souris) à plusieurs endroits de la fiche de personnage.</p><dl>${entries}</dl>`;
}

function buildRulesPage(glossary) {
  const abbr = (term, text) => glossaryAbbr(glossary, term, text);
  return `
    <h2>Résoudre un test</h2>
    <p>La très grande majorité des actions incertaines se résolvent de la même façon : lancer un
    d20, ajouter un modificateur, comparer le total à un objectif fixé par le Maître du Jeu (un
    Degré de Difficulté) ou à la valeur d'un adversaire (sa ${abbr("Classe d'Armure (CA)", "Classe d'Armure")}).</p>
    <ul>
      <li><strong>${abbr("Test de caractéristique")}</strong> : 1d20 + modificateur de la
      caractéristique concernée.</li>
      <li><strong>${abbr("Test de compétence")}</strong> : le même test, avec en plus le
      ${abbr("Bonus de maîtrise")} si la compétence est cochée sur la fiche.</li>
      <li><strong>${abbr("Jet de sauvegarde")}</strong> : pour résister à un effet (piège, sort,
      poison...), même formule, avec le bonus de maîtrise si la sauvegarde correspondante est
      cochée.</li>
      <li><strong>Jet d'attaque</strong> : 1d20 + modificateur de caractéristique (+ bonus de
      maîtrise si l'arme est maîtrisée). Touche si le résultat égale ou dépasse la CA de la
      cible.</li>
    </ul>
    <p>Cliquer sur une valeur de jet soulignée sur la fiche lance le d20 correspondant
    automatiquement. Maj-clic : ${abbr("Avantage / Désavantage", "avantage")}. Ctrl-clic :
    ${abbr("Avantage / Désavantage", "désavantage")}.</p>

    <h2>Points de Vie et mort</h2>
    <p>Quand les ${abbr("Points de Vie (PV)", "PV")} tombent à 0, le personnage devient
    inconscient et doit réussir des jets de sauvegarde de la mort (1d20 sans modificateur, 10+
    = réussite) jusqu'à en accumuler 3 (stabilisé) ou 3 échecs (mort). Un 20 naturel rend
    immédiatement 1 PV ; un 1 naturel compte comme deux échecs. Les
    ${abbr("Points de vie temporaires", "PV temporaires")} sont toujours absorbés en premier
    lors de dégâts subis.</p>

    <h2>Réaction</h2>
    <p>Une Capacité ou un Sort marqué "Réaction" affiche un badge dédié sur l'onglet
    Capacités/Sorts (le déclencheur, ex. "Quand une créature quitte votre portée", apparaît en
    infobulle au survol du badge). Une seule réaction est utilisable par round — à vous de juger
    quand la situation décrite se produit, le système ne la détecte jamais automatiquement.
    L'indicateur "⚡ Réaction" de l'en-tête de la fiche montre en permanence si elle est
    disponible (doré) ou déjà utilisée (grisé) ; elle se régénère automatiquement au début de
    votre tour tant qu'un combat est suivi par le Maître du Jeu (Suivi de combat de Foundry).</p>

    <h2>Repos</h2>
    <p>${abbr("Repos court")} et ${abbr("Repos long")} sont accessibles par les boutons dédiés de
    la fiche de personnage. Un repos long comprend tous les bénéfices d'un repos court.</p>

    <h2>Exhaustion</h2>
    <p>${abbr("Exhaustion")} : niveau d'épuisement cumulatif de 0 à 6, réglable depuis l'onglet
    Statistiques. Chaque palier ajoute son propre malus, cumulatif avec les précédents (détail
    complet dans le Glossaire).</p>
  `;
}

function buildSpellsPage(glossary) {
  const abbr = (term, text) => glossaryAbbr(glossary, term, text);
  return `
    <p><strong>Ce système simplifie volontairement la gestion des sorts</strong> pour rester
    facile à suivre à table : pas d'emplacements de sorts par niveau (1 à 9) à gérer
    séparément.</p>
    <h2>Le pool "${abbr("Sorts par repos")}"</h2>
    <p>Chaque lanceur de sorts dispose d'un unique compteur "Sorts par repos", visible en haut de
    l'onglet Capacités. Lancer un sort de niveau 1 ou plus coûte toujours 1 charge de ce pool,
    quel que soit le niveau réel du sort — un sort de niveau 3 ne coûte pas plus cher qu'un sort
    de niveau 1. Ce pool se recharge intégralement à chaque repos long.</p>
    <p>Les ${abbr("Tour de magie", "tours de magie")} (niveau 0) restent à part : ils peuvent être
    lancés librement, sans jamais consommer de charge.</p>
    <h2>DD de sauvegarde et bonus d'attaque des sorts</h2>
    <p>Affichés en haut de l'onglet Capacités pour toute classe lanceuse : DD = 8 + bonus de
    maîtrise + modificateur de la caractéristique d'incantation ; bonus d'attaque = bonus de
    maîtrise + ce même modificateur.</p>
    <h2>${abbr("Concentration")}</h2>
    <p>Les sorts marqués "C" exigent d'y rester concentré : lancer un nouveau sort à concentration
    remplace automatiquement le précédent, et subir des dégâts impose un jet de sauvegarde de
    Constitution pour ne pas le perdre.</p>
    <h2>${abbr("Rituel", "Sorts Rituel")}</h2>
    <p>Un Clerc ou un Druide possédant la Capacité "Incantation rituelle" de sa classe peut lancer
    l'un de ses sorts marqué Rituel sans dépenser de charge — automatique, rien à cocher.</p>
    <h2>Sorts connus</h2>
    <p>Un personnage a accès à tout sort/tour de magie octroyé automatiquement par sa classe à la
    création et à chaque montée de niveau (visible dans l'onglet Capacités). D'autres sorts
    peuvent être ajoutés manuellement en les glissant depuis le compendium Sorts.</p>
  `;
}

async function buildClassesPage() {
  const classes = await loadJson("world-items/classes.json");
  const sections = classes
    .map((entry) => {
      const system = entry.system;
      const saves = (system.savingThrows ?? [])
        .map((key) => game.i18n.localize(DND_CUSTOM.abilities[key]))
        .join(", ");
      const weapons = (system.weaponProficiencies ?? [])
        .map((key) => game.i18n.localize(DND_CUSTOM.weaponTypes[key]))
        .join(", ");
      return `<h3>${entry.name}</h3>
        ${system.description}
        <p><strong>Jets de sauvegarde maîtrisés :</strong> ${saves} · <strong>Compétences à
        choisir à la création :</strong> ${system.skillChoiceCount} · <strong>Armes
        maîtrisées :</strong> ${weapons}</p>`;
    })
    .join("");
  return `<p>Les 12 classes suivantes sont disponibles dans ce système. Les points de vie
    maximum sont calculés automatiquement à chaque niveau (pas de jet de Dé de vie dans ce
    système) ; sauvegardes maîtrisées, compétences au choix et maîtrises d'armes ci-dessous sont
    appliquées automatiquement par l'assistant de création de personnage. Le même détail est
    aussi consultable classe par classe dans le compendium "Classes".</p>${sections}`;
}

async function buildOriginsPage(glossary) {
  const origins = await loadJson("world-items/origins.json");
  const abbr = (term, text) => glossaryAbbr(glossary, term, text);
  const sections = origins
    .map((entry) => {
      const system = entry.system;
      const bonuses = Object.entries(system.abilityBonuses)
        .filter(([, value]) => value)
        .map(([key, value]) => `${game.i18n.localize(DND_CUSTOM.abilities[key])} +${value}`)
        .join(", ");
      const skills = system.skillAdvantages.map((key) => game.i18n.localize(DND_CUSTOM.skills[key])).join(", ");
      return `<h3>${entry.name} <em>(${system.inspiration})</em></h3>
        ${system.description}
        <p><strong>Bonus de caractéristiques :</strong> ${bonuses} · <strong>Compétences
        avantagées :</strong> ${skills}</p>
        <p><strong>${system.specialTrait.name}</strong> — ${system.specialTrait.description}</p>`;
    })
    .join("");
  return `<p>Ce système remplace les races classiques de jeu de rôle par 6
    ${abbr("Origine", "Origines")} culturelles humaines, choisies à la création du personnage. Un
    tableau comparatif complet existe aussi dans le Journal "Comparatif des Origines".</p>${sections}`;
}

async function buildLanguagesPage(glossary) {
  const languages = await loadJson("world-items/languages.json");
  const abbr = (term, text) => glossaryAbbr(glossary, term, text);
  const byCategory = (category) => languages.filter((entry) => entry.system.category === category);
  const section = (titleKey, entries) =>
    entries.length
      ? `<h3>${game.i18n.localize(titleKey)}</h3><dl>${entries
          .map((entry) => `<dt><strong>${entry.name}</strong></dt><dd>${entry.system.description}</dd>`)
          .join("")}</dl>`
      : "";

  return `
    <p>Chaque personnage connaît toujours la ${abbr("Langue", "Commune")} et la langue de son
    Origine : octroyées automatiquement à la création, sans rien à faire. Les langues spéciales
    ci-dessous s'ajoutent manuellement, en les glissant depuis le compendium Langues vers l'onglet
    Journal de la fiche de personnage.</p>
    ${section("DND_CUSTOM.Item.LanguageCategories.common", byCategory("common"))}
    ${section("DND_CUSTOM.Item.LanguageCategories.origin", byCategory("origin"))}
    ${section("DND_CUSTOM.Item.LanguageCategories.special", byCategory("special"))}
  `;
}

function buildEquipmentPage(glossary) {
  const abbr = (term, text) => glossaryAbbr(glossary, term, text);
  const currencyRows = Object.entries(DND_CUSTOM.currencyToCopper)
    .map(([key, copperValue]) => `<tr><td>${game.i18n.localize(`DND_CUSTOM.Currency.${key}`)}</td><td>${copperValue} PC</td></tr>`)
    .join("");
  return `
    <h2>Monnaie</h2>
    <p>Quatre dénominations, toutes converties en équivalent Pièces de Cuivre (PC) pour les
    totaux affichés sur la fiche :</p>
    <table><thead><tr><th>Pièce</th><th>Équivalent</th></tr></thead>
    <tbody>${currencyRows}</tbody></table>

    <h2>${abbr("Poids porté / Capacité de charge", "Poids porté et capacité de charge")}</h2>
    <p>Le poids porté (somme du poids de tous les objets de l'inventaire, multiplié par leur
    quantité) est comparé à la capacité de charge maximale (Force x 7,5 kg). La barre de
    l'onglet Inventaire passe en rouge en cas de surcharge.</p>

    <h2>${abbr("Emplacement d'équipement", "Emplacements d'équipement")}</h2>
    <p>Une arme ou une armure doit être cochée "Équipée" dans l'onglet Inventaire pour compter
    dans les calculs (CA, bonus d'attaque...) et apparaître dans l'onglet Équipement. Une arme à
    deux mains occupe à la fois la Main principale et la Main secondaire ; seule une arme Légère
    peut être équipée en Main secondaire (combat à deux armes).</p>
  `;
}

/** Crée (une seule fois, si absent) le Journal "Guide du Joueur" à plusieurs pages : glossaire,
 *  règles de base, système de sorts simplifié, classes, origines, langues, équipement/inventaire.
 *  N'écrase jamais un Journal existant du même nom (le MJ peut librement l'éditer ensuite sans
 *  craindre de le voir régénéré/écrasé au prochain chargement du monde) — même principe que
 *  ensureOriginsJournal (origins-journal.js). Contenu entièrement dérivé des fichiers de données
 *  du système (scripts/data/glossary.json, world-items/classes.json, world-items/origins.json,
 *  world-items/languages.json, scripts/helpers/config.js) : reste synchronisé si ces fichiers
 *  évoluent, rien à maintenir en
 *  double. */
export async function ensurePlayerGuideJournal() {
  if (!game.user.isGM) return;

  const title = game.i18n.localize("DND_CUSTOM.Journal.PlayerGuideTitle");
  if (game.journal.getName(title)) return;

  const glossary = await loadJson("scripts/data/glossary.json");

  // Clé i18n écrite en toutes lettres (littéral complet, pas une concaténation) pour chaque
  // page : détectable par le scanner de couverture i18n (tests/data/i18n-coverage.test.js), qui
  // ne peut pas suivre une clé construite dynamiquement (ex. reconstituée à partir d'une
  // variable) et laisserait alors passer une clé manquante sans avertissement.
  const pages = [
    { titleKey: "DND_CUSTOM.Journal.PlayerGuidePageGlossary", content: buildGlossaryPage(glossary) },
    { titleKey: "DND_CUSTOM.Journal.PlayerGuidePageRules", content: buildRulesPage(glossary) },
    { titleKey: "DND_CUSTOM.Journal.PlayerGuidePageSpells", content: buildSpellsPage(glossary) },
    { titleKey: "DND_CUSTOM.Journal.PlayerGuidePageClasses", content: await buildClassesPage() },
    { titleKey: "DND_CUSTOM.Journal.PlayerGuidePageOrigins", content: await buildOriginsPage(glossary) },
    { titleKey: "DND_CUSTOM.Journal.PlayerGuidePageLanguages", content: await buildLanguagesPage(glossary) },
    { titleKey: "DND_CUSTOM.Journal.PlayerGuidePageEquipment", content: buildEquipmentPage(glossary) }
  ];

  await JournalEntry.create({
    name: title,
    pages: pages.map(({ titleKey, content }, index) => ({
      name: game.i18n.localize(titleKey),
      type: "text",
      sort: (index + 1) * 100,
      text: { format: 1, content }
    }))
  });
}
