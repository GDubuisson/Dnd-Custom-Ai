/**
 * HTML d'un DialogV2 « une option parmi N » sous forme de boutons radio.
 * @param {Array<{value: string, label: string, meta?: string, description?: string}>} options
 * @param {string} inputName - attribut `name` commun aux boutons radio
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
