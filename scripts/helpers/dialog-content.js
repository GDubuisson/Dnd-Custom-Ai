/** Contenu HTML d'une fenêtre `DialogV2` de choix « une option parmi N » : liste verticale
 *  déroulante de boutons radio, chacun avec un libellé en gras, un complément optionnel sur la
 *  même ligne (`meta`, ex. « (PV 12, CA 13) ») et une description en dessous (sous-classe au
 *  niveau requis, cf. subclass-choice.js ; Don à la place d'une Amélioration de caractéristiques,
 *  cf. level-up-choice.js ; forme de Forme sauvage, cf. wild-shape-choice.js). La première option
 *  est cochée par défaut ; la valeur choisie se relit via `button.form.elements[inputName].value`
 *  dans le `callback`.
 *
 *  Les styles restent inline (fenêtre `DialogV2` du cœur Foundry, hors de la portée `.dnd-custom-ai`
 *  de `styles/dnd-custom-ai.css`).
 *
 * @param {Array<{ value: string, label: string, meta?: string, description?: string }>} options
 * @param {string} inputName  attribut `name` partagé par les boutons radio
 * @returns {string}
 */
export function radioListDialogContent(options, inputName) {
  const rows = options
    .map(
      (option, index) => `
        <label class="checkbox-row" style="align-items:flex-start;gap:0.5rem;">
          <input type="radio" name="${inputName}" value="${option.value}" ${index === 0 ? "checked" : ""}>
          <span><strong>${option.label}</strong>${option.meta ?? ""}${option.description ? `<br>${option.description}` : ""}</span>
        </label>`
    )
    .join("");
  return `<div style="display:flex;flex-direction:column;gap:0.6rem;max-height:60vh;overflow-y:auto;">${rows}</div>`;
}
