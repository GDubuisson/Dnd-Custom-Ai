import { DND_CUSTOM } from "./config.js";

const SYSTEM_ID = "dnd-custom-ai";

async function loadJson(relativePath) {
  const response = await fetch(`systems/${SYSTEM_ID}/${relativePath}`);
  return response.json();
}

function buildOverviewPage() {
  return `
    <p><strong>Ce Journal n'est visible que par toi (MJ)</strong> — les joueurs n'y ont pas accès,
    contrairement au Journal "Guide du Joueur" qui leur est destiné.</p>
    <h2>Ce que la fiche automatise déjà</h2>
    <ul>
      <li>PV max, CA, Initiative, bonus de maîtrise, DD/bonus d'attaque des sorts : recalculés en
      permanence à partir des caractéristiques, de la classe et du niveau.</li>
      <li>Défense sans armure du Barbare : bonus de Constitution ajouté automatiquement à la CA
      tant qu'aucune armure n'est équipée, sans rien à cocher.</li>
      <li>Aptitudes multiples (Barde) : pastille automatique sur une compétence non maîtrisée qui
      en bénéficierait, et moitié du bonus de maîtrise appliquée au jet.</li>
      <li>Incantation rituelle (Clerc, Druide) : un sort marqué Rituel se lance sans dépenser de
      charge dès que le personnage a la Capacité correspondante.</li>
      <li>Langues : Commune et langue d'Origine octroyées automatiquement à la création.</li>
      <li>Sorts/Capacités de classe : octroyés automatiquement à la création et à chaque montée
      de niveau (cf. page "Expérience et montée de niveau" ci-dessous).</li>
      <li>Réaction : une seule utilisable par round, régénérée automatiquement au début du tour
      du personnage tant qu'un combat est suivi (Suivi de combat de Foundry) — indicateur
      cliquable en en-tête de la fiche pour un rattrapage manuel si besoin (capacité qui rend une
      réaction bonus, correction d'un clic).</li>
      <li>Onglet Capacités/Sorts : en-tête visuel adapté à la classe du personnage (titre
      thématique, icône) — purement cosmétique, aucun effet sur les calculs.</li>
    </ul>
    <h2>Ce qui reste à ton arbitrage</h2>
    <p>Certaines Capacités listent volontairement un effet à définir avec toi plutôt qu'une règle
    figée dans le code (cf. page "Capacités à arbitrer" ci-dessous) — ce système simplifie
    délibérément les mécaniques les plus lourdes du SRD 5e (cf. page "Simplifications
    assumées") pour rester fluide à table, quitte à te laisser trancher au cas par cas.</p>
  `;
}

async function buildAdjudicationPage() {
  const features = await loadJson("world-items/features.json");
  const flagged = features.filter((feature) => /\bMJ\b|Simplifié/.test(feature.system.description));
  const rows = flagged
    .map(
      (feature) =>
        `<dt><strong>${feature.name}</strong> <em>(${feature.system.class}, niveau ${feature.system.level ?? 1})</em></dt>
        <dd>${feature.system.description}</dd>`
    )
    .join("");
  return `
    <p>Ces Capacités mentionnent explicitement un effet à trancher avec toi (pas de liste
    d'options figée dans ce système) ou une simplification assumée par rapport au SRD 5e complet.
    Généré automatiquement depuis <code>world-items/features.json</code> : reste à jour si son
    contenu évolue.</p>
    <dl>${rows}</dl>
  `;
}

function buildSimplificationsPage() {
  return `
    <p>Ce système s'écarte volontairement du SRD 5e complet sur plusieurs points, pour rester
    simple à suivre en jeu :</p>
    <ul>
      <li><strong>Sorts par repos</strong> : un unique pool de charges par repos long remplace les
      emplacements de sorts par niveau (1 à 9). Chaque sort (hors tour de magie) coûte 1 charge,
      quel que soit son niveau réel — pas de surclassement.</li>
      <li><strong>Sorts connus</strong> : un lanceur a accès à toute la liste de sorts de sa classe
      jusqu'à son niveau maximum accessible (octroyés automatiquement), plutôt que les tables
      "sorts connus" propres à chaque classe (Barde/Ensorceleur/Occultiste/Magicien).</li>
      <li><strong>Multiclassage</strong> : non géré par ce système (un seul champ Classe par
      personnage).</li>
      <li><strong>Points de Ki / Sorcellerie innée</strong> : réserves fixes, ne progressent pas
      avec le niveau dans ce système (simplifié par rapport au SRD 5e).</li>
      <li><strong>Forme sauvage (Druide)</strong> : pas de fiche de créature séparée ni de
      deuxième réserve de PV suivie automatiquement — à adjuger ensemble à la table.</li>
      <li><strong>Domaines divins / Sous-classes / Voies / Cercles</strong> : pas de choix de
      sous-classe modélisé (Canalisation divine, Forme sauvage etc. restent génériques).</li>
      <li><strong>Réaction</strong> : le système suit uniquement l'économie d'action (1 par
      round, régénérée au bon moment) — il ne détecte jamais automatiquement le déclencheur d'une
      Capacité/d'un Sort "Réaction" (ex. "une créature quitte votre portée") : à toi de valider
      que la situation s'est bien produite avant que le joueur clique. Hors combat suivi par le
      Suivi de combat, rien ne régénère automatiquement une réaction consommée — seul un clic
      manuel sur l'indicateur de l'en-tête la rétablit.</li>
      <li><strong>Compendium Classes</strong> : les champs sauvegardes/compétences/maîtrises
      visibles sur chaque Item Classe sont informatifs — les modifier n'a aucun effet sur les
      calculs de la fiche de personnage (dé de vie, sauvegardes appliquées...), qui restent
      pilotés par <code>scripts/helpers/config.js</code>.</li>
    </ul>
  `;
}

async function buildProgressionPage() {
  const rows = DND_CUSTOM.xpThresholds
    .map((xp, index) => `<tr><td>${index + 1}</td><td>${xp.toLocaleString("fr-FR")}</td></tr>`)
    .join("");
  const crRows = DND_CUSTOM.challengeRatings
    .map((cr) => `<tr><td>${cr}</td><td>${DND_CUSTOM.challengeRatingXp[cr].toLocaleString("fr-FR")}</td></tr>`)
    .join("");
  return `
    <h2>Distribuer de l'XP</h2>
    <p>Via la macro monde "Attribuer de l'XP", ou le bouton "Distribuer l'XP" d'une fiche PNJ
    (montant pré-rempli depuis son indice de dangerosité). Réparti également entre les personnages
    cochés, jamais révélé aux joueurs dans le chat (chuchoté MJ uniquement).</p>
    <p>Le total d'XP de chaque personnage est visible en permanence dans l'en-tête de sa fiche,
    dans le champ "XP (MJ)" — réservé à ta vue, jamais affiché aux joueurs.</p>
    <h2>Table XP par niveau (SRD 5e)</h2>
    <table><thead><tr><th>Niveau</th><th>XP requis</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>Indice de dangerosité (FI) → XP (PNJ)</h2>
    <p>Pré-remplit le champ XP rapporté d'une fiche PNJ selon sa FI (table SRD 5e) :</p>
    <table><thead><tr><th>FI</th><th>XP</th></tr></thead><tbody>${crRows}</tbody></table>
    <h2>Montée de niveau</h2>
    <p>Le bouton "Monter de niveau" n'apparaît sur la fiche que si l'XP accumulé atteint le seuil
    du niveau suivant. À l'usage, il octroie automatiquement les nouvelles Capacités/nouveaux
    Sorts de la classe et propose une Amélioration de caractéristiques aux niveaux 4, 8, 12, 16 et
    19 (SRD 5e). Le champ Niveau reste aussi éditable directement par toi (override manuel, ex.
    pour corriger une erreur) — dans ce cas, l'octroi automatique de contenu n'est pas déclenché.</p>
  `;
}

/** Crée (une seule fois, si absent) le Journal "Guide du MJ" à plusieurs pages, visible
 *  uniquement du MJ (ownership.default: NONE, explicite — jamais de fuite vers les joueurs même
 *  si le comportement par défaut de Foundry venait à changer). N'écrase jamais un Journal
 *  existant du même nom, même principe que ensurePlayerGuideJournal/ensureOriginsJournal.
 *  Contenu partiellement dérivé de world-items/features.json et scripts/helpers/config.js :
 *  reste synchronisé si ces fichiers évoluent. */
export async function ensureGmGuideJournal() {
  if (!game.user.isGM) return;

  const title = game.i18n.localize("DND_CUSTOM.Journal.GmGuideTitle");
  if (game.journal.getName(title)) return;

  const pages = [
    { titleKey: "DND_CUSTOM.Journal.GmGuidePageOverview", content: buildOverviewPage() },
    { titleKey: "DND_CUSTOM.Journal.GmGuidePageAdjudication", content: await buildAdjudicationPage() },
    { titleKey: "DND_CUSTOM.Journal.GmGuidePageSimplifications", content: buildSimplificationsPage() },
    { titleKey: "DND_CUSTOM.Journal.GmGuidePageProgression", content: await buildProgressionPage() }
  ];

  await JournalEntry.create({
    name: title,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    pages: pages.map(({ titleKey, content }, index) => ({
      name: game.i18n.localize(titleKey),
      type: "text",
      sort: (index + 1) * 100,
      text: { format: 1, content }
    }))
  });
}
