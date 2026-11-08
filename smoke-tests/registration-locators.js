function exactLabelPattern(label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*${escapedLabel}\\s*\\*?\\s*$`);
}

function controlByLabel(page, component, label, control) {
  const labelLocator = page
    .locator("label")
    .filter({ hasText: exactLabelPattern(label) });

  return page.locator(component).filter({ has: labelLocator }).locator(control);
}

function textInput(page, label) {
  return controlByLabel(page, "app-input-text", label, "input");
}

function selectInput(page, label) {
  return controlByLabel(page, "app-input-select", label, "p-select");
}

module.exports = { exactLabelPattern, selectInput, textInput };
