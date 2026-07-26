const COMPONENTS = [
  "Sender Adapter", "Receiver Adapter", "Content Modifier", "Router", "Groovy Script",
  "Message Mapping", "Exception Subprocess", "ProcessDirect", "Request Reply",
  "Data Store", "Local Integration Process", "General Splitter", "Gather",
  "XML Modifier", "JSON to XML Converter", "XML to JSON Converter", "Runtime Monitor",
  "MPL", "Trace", "Security Material"
];
const ADAPTER_TYPES = ["SFTP", "FTP", "HTTPS", "HTTP", "SOAP", "OData", "IDoc", "AS2", "JMS", "Mail", "SuccessFactors", "ProcessDirect", "AMQP", "RFC", "XI", "Ariba"];
const CONTROL_SELECTOR = "input:not([type='password']), textarea, select, ui5-input, ui5-select, ui5-textarea, ui5-combobox, ui5-multi-combobox, [role='textbox'][contenteditable='true']";

let activeComponent = "";
let activeSelection = "";
let activePane = null;
let publishTimer = 0;
let lastSignature = "";

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function textOf(element) {
  return compact(element?.textContent || "");
}

function isVisible(element) {
  if (!(element instanceof Element) || element.closest("[aria-hidden='true']")) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && element.getClientRects().length > 0;
}

function componentFromText(value) {
  const text = compact(value);
  const explicit = COMPONENTS.find((component) => text.toLowerCase().includes(component.toLowerCase()));
  if (explicit) return explicit;
  if (/\b(sender|inbound|source directory|source file)\b/i.test(text)) return "Sender Adapter";
  if (/\b(receiver|outbound|target directory|target file)\b/i.test(text)) return "Receiver Adapter";
  return "";
}

function adapterFromText(value) {
  const text = compact(value);
  return ADAPTER_TYPES.find((adapter) => new RegExp(`\\b${adapter.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(text)) || "";
}

function elementLabel(element) {
  if (!(element instanceof Element)) return "";
  const attributes = ["aria-label", "title", "data-tooltip", "data-testid", "data-node-id", "data-name", "name"]
    .map((attribute) => element.getAttribute(attribute))
    .filter(Boolean);
  const ownText = [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join(" ");
  const text = compact(ownText) || (textOf(element).length <= 96 ? textOf(element) : "");
  return compact([...attributes, text].join(" ")).slice(0, 120);
}

function selectionLabels() {
  const selectors = ['[aria-selected="true"]', '[aria-pressed="true"]', '.sapMSelected', '.sapMLIBSelected', '.selected', '.is-selected', '[class*="selected"]', '[class*="Selected"]'].join(",");
  return [...document.querySelectorAll(selectors)]
    .filter(isVisible)
    .map(elementLabel)
    .filter(Boolean)
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .slice(0, 12);
}

function selectedLabel() {
  const labels = selectionLabels();
  const explicit = labels.find((label) => componentFromText(label) || adapterFromText(label));
  if (explicit) return explicit;
  if (activeSelection && (componentFromText(activeSelection) || adapterFromText(activeSelection))) return activeSelection;
  return labels[0] || activeSelection;
}

function findComponent() {
  return componentFromText(selectedLabel()) || activeComponent || "Integration Flow";
}

function findIflow() {
  const title = document.title.replace(/\s*[-|].*$/, "").trim();
  const candidates = [...document.querySelectorAll('[data-testid*="title"], [aria-label*="Integration Flow"], h1, h2')]
    .filter(isVisible)
    .map(textOf)
    .filter(Boolean);
  return candidates.find((value) => !COMPONENTS.includes(value) && value.length < 120) || title || "Not detected";
}

function addText(target, value) {
  const text = compact(value);
  if (text) target.add(text);
}

function idAliases(id) {
  const source = String(id || "");
  return [...new Set([source, source.replace(/-(inner|content|input|editable|focus)$/i, "")].filter(Boolean))];
}

function rootsFor(element) {
  const roots = new Set([document]);
  let current = element;
  for (let index = 0; current && index < 8; index += 1) {
    const root = current.getRootNode?.();
    if (root?.querySelectorAll) roots.add(root);
    current = current.parentElement || root?.host;
  }
  return [...roots];
}

function associatedLabelText(element) {
  const labels = new Set();
  if (element.labels) [...element.labels].forEach((label) => addText(labels, textOf(label)));
  const ids = [element.id, element.getAttribute("aria-labelledby"), element.getAttribute("aria-describedby")]
    .filter(Boolean)
    .flatMap((value) => String(value).split(/\s+/))
    .flatMap(idAliases);
  rootsFor(element).forEach((root) => {
    const labelNodes = root.querySelectorAll?.("label, [role='label'], .sapMLabel, [class*='Label']") || [];
    ids.forEach((id) => {
      labelNodes.forEach((label) => {
        if (label.htmlFor === id || label.getAttribute("for") === id || label.id === id) addText(labels, textOf(label));
      });
      const referenced = root.getElementById?.(id);
      if (referenced) addText(labels, textOf(referenced));
    });
  });
  let current = element;
  for (let index = 0; current && index < 6; index += 1) {
    const parent = current.parentElement || current.getRootNode?.().host;
    if (!parent) break;
    [...parent.children].forEach((sibling) => {
      if (sibling !== current && sibling.matches?.("label, [role='label'], .sapMLabel, [class*='Label']")) addText(labels, textOf(sibling));
    });
    current = parent;
  }
  return [...labels].join(" ");
}

function labelForField(element) {
  const explicit = associatedLabelText(element);
  const own = [element.getAttribute("aria-label"), element.getAttribute("name"), element.getAttribute("placeholder")].filter(Boolean).join(" ");
  return compact(`${explicit} ${own}`);
}

function fieldKey(label, component) {
  const value = compact(label).toLowerCase();
  if (!value || /password|credential|secret|token|proxy/.test(value)) return "";
  if (/archive/.test(value)) return "archiveDirectory";
  if (/source.*file.*type|file.*type/.test(value)) return "fileType";
  if (/target.*file/.test(value)) return "targetFile";
  if (/source.*(directory|folder|path)/.test(value)) return "sourceDirectory";
  if (/target.*(directory|folder|path)/.test(value)) return "targetDirectory";
  if (/file.*pattern|pattern.*file|source.*file/.test(value)) return "filePattern";
  if (/\bdirectory\b|\bfolder\b|\bpath\b/.test(value)) return component === "Receiver Adapter" ? "targetDirectory" : component === "Sender Adapter" ? "sourceDirectory" : "";
  if (/^file(name)?$/.test(value)) return component === "Receiver Adapter" ? "targetFile" : component === "Sender Adapter" ? "filePattern" : "";
  if (/encoding/.test(value)) return "encoding";
  if (/security|tls|ssl|authentication/.test(value)) return "security";
  if (/\bport\b/.test(value)) return "port";
  if (/host|endpoint|address|server/.test(value)) return "host";
  if (/adapter.*type|transport protocol|^adapter$/.test(value)) return "adapter";
  return "";
}

function inputValue(element) {
  if (element instanceof HTMLSelectElement) return textOf(element.selectedOptions[0]) || element.value;
  if (typeof element.checked === "boolean" && /checkbox|radio/i.test(element.type || "")) return element.checked ? "true" : "false";
  const selected = element.selectedOption || element.selectedOptions?.[0];
  return element.value || selected?.textContent || selected?.value || element.getAttribute("value") || "";
}

function allFormFields() {
  const fields = new Set();
  function collect(root) {
    root.querySelectorAll(CONTROL_SELECTOR).forEach((element) => fields.add(element));
    root.querySelectorAll("*").forEach((element) => { if (element.shadowRoot) collect(element.shadowRoot); });
  }
  collect(document);
  return [...fields].filter(isVisible);
}

function containsComposed(container, element) {
  let current = element;
  for (let index = 0; current && index < 12; index += 1) {
    if (current === container) return true;
    const root = current.getRootNode?.();
    current = current.parentElement || root?.host;
  }
  return false;
}

function paneFromPath(path) {
  return path.find((element) => element instanceof Element && element.matches("[role='dialog'], form, .sapUiForm, [class*='Property'], [class*='property'], [class*='Configuration'], [class*='configuration']")) || null;
}

function activeFields() {
  const fields = allFormFields();
  if (activePane?.isConnected && isVisible(activePane)) {
    const scoped = fields.filter((element) => containsComposed(activePane, element));
    if (scoped.length) return scoped;
  }
  return fields;
}

function fieldConfidence(label, key) {
  const value = String(label || "").toLowerCase();
  const exact = {
    adapter: /adapter.*type|transport protocol|\badapter\b/,
    host: /host|endpoint|address|server/,
    port: /\bport\b/,
    sourceDirectory: /source.*(directory|folder|path)/,
    targetDirectory: /target.*(directory|folder|path)/,
    filePattern: /file.*pattern|pattern.*file|source.*file/,
    targetFile: /target.*file/,
    archiveDirectory: /archive/,
    encoding: /encoding/,
    security: /security|tls|ssl|authentication/,
    fileType: /source.*file.*type|file.*type/
  };
  return exact[key]?.test(value) ? 2 : 1;
}

function readConfiguration(component) {
  const values = {};
  const fields = activeFields().map((element) => {
    const label = labelForField(element);
    const key = fieldKey(label, component);
    const value = element instanceof HTMLElement && element.getAttribute("contenteditable") === "true" ? textOf(element) : String(inputValue(element) || "").trim();
    return { key, label, value, controlId: element.id || element.getAttribute("data-sap-ui") || "", visible: true };
  }).filter((field) => field.key && !/password|credential|secret|token/i.test(field.label));
  fields.forEach((field) => {
    if (!field.value) return;
    const confidence = fieldConfidence(field.label, field.key);
    if (!values[field.key] || confidence >= values[field.key].confidence) values[field.key] = { value: field.value, confidence };
  });
  return { values: Object.fromEntries(Object.entries(values).map(([key, entry]) => [key, entry.value])), fields };
}

function interactionDetails(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
  const isField = path.some((element) => element instanceof Element && element.matches(CONTROL_SELECTOR));
  const labels = path.slice(0, 10)
    .filter((element) => element instanceof Element && element !== document.body && element !== document.documentElement)
    .map(elementLabel)
    .filter(Boolean)
    .filter((label, index, all) => all.indexOf(label) === index);
  return { path, isField, labels, detail: labels.join(" ").slice(0, 700) };
}

function activityFor(component, selection, configuration) {
  const adapter = configuration.adapter || adapterFromText(selection);
  if (selection) {
    const suffix = adapter && !selection.toLowerCase().includes(adapter.toLowerCase()) ? ` — ${adapter}` : "";
    return `Selected: ${selection}${suffix}`;
  }
  if (component !== "Integration Flow") return `Configuring ${component}${adapter ? ` — ${adapter}` : ""}`;
  return "Viewing Integration Flow canvas";
}

function captureInteraction(event) {
  const { path, isField, labels, detail } = interactionDetails(event);
  const component = componentFromText(detail);
  const exact = labels.find((label) => componentFromText(label) || adapterFromText(label));
  const pane = paneFromPath(path);
  if (pane) activePane = pane;
  if (component) activeComponent = component;
  if (!isField && exact) activeSelection = exact;
  if (/integration flow|canvas|design/i.test(detail) && !component && !adapterFromText(detail)) {
    activeComponent = "";
    activeSelection = "";
    activePane = null;
  }
  schedulePublish(0);
}

function publishContext() {
  const component = findComponent();
  const data = readConfiguration(component);
  const selection = selectedLabel();
  const payload = {
    screen: component === "Integration Flow" ? "Integration Flow" : component,
    component,
    selected: selection || component,
    adapterType: data.values.adapter || adapterFromText(selection),
    activity: activityFor(component, selection, data.values),
    iflow: findIflow(),
    configuration: data.values,
    configurationFields: data.fields,
    detectedAt: new Date().toISOString()
  };
  const signature = JSON.stringify({ ...payload, detectedAt: undefined });
  if (signature !== lastSignature) {
    lastSignature = signature;
    chrome.runtime.sendMessage({ type: "CPI_CONTEXT", payload }).catch(() => {});
  }
}

function schedulePublish(delay = 180) {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(publishContext, delay);
}

schedulePublish(0);
new MutationObserver(() => schedulePublish()).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
document.addEventListener("click", captureInteraction, true);
document.addEventListener("pointerdown", captureInteraction, true);
document.addEventListener("focusin", captureInteraction, true);
document.addEventListener("input", () => schedulePublish(100), true);
document.addEventListener("change", () => schedulePublish(100), true);
document.addEventListener("keyup", () => schedulePublish(100), true);
