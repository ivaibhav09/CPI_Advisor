const $ = (selector) => document.querySelector(selector);
const valueOf = (record, key) => record?.[key]?.trim() || "Not maintained in inventory";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
const rowList = (rows) => rows.map(([key, value]) => `<div class="row"><b>${escapeHtml(key)}</b>${escapeHtml(value)}</div>`).join("");
const card = (heading, body) => `<section class="card"><h3>${heading}</h3>${body}</section>`;

let inventory;
let record;
let results = [];
let tab = "Overview";
let context = { component: "Integration Flow", activity: "Detecting current CPI screen…", configuration: {} };

const specs = {
  "Sender Adapter": [["Adapter Type", "Inbound Adapter", "adapter"], ["Host", "Inbound FTP Host", "host"], ["Port", "Inbound FTP Port", "port"], ["Source Directory", "Inbound Source Dir", "sourceDirectory"], ["File Pattern", "Inbound Source File", "filePattern"], ["Encoding", "Inbound Encoding", "encoding"], ["File Type", "Inbound File Type", "fileType"]],
  "Receiver Adapter": [["Adapter Type", "Outbound Adapter", "adapter"], ["Host", "Outbound FTP Host", "host"], ["Port", "Outbound FTP Port", "port"], ["Security", "Outbound FTP Security", "security"], ["Target Directory", "Outbound Target Dir", "targetDirectory"], ["Target File", "Outbound Target File", "targetFile"], ["Encoding", "Outbound Encoding", "encoding"], ["Archive Directory", "Archive Dir", "archiveDirectory"]]
};

function normalized(value, fieldKey) {
  const raw = String(value || "").trim();
  if (fieldKey === "port") return String(Number(raw));
  if (fieldKey === "host") return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (["sourceDirectory", "targetDirectory", "archiveDirectory"].includes(fieldKey)) return raw.replace(/\\/g, "/").replace(/\/+$/, "");
  if (["filePattern", "targetFile"].includes(fieldKey)) return raw;
  return raw.toLowerCase().replace(/\s+/g, " ");
}

function inventoryValue(key) {
  const value = valueOf(record, key);
  return /^not maintained in inventory$/i.test(value) ? "" : value;
}

function compareConfiguration(component, requireActiveComponent = false) {
  if (!record) return { state: "pending", message: "Choose an interface record to start live validation." };
  const fields = specs[component];
  if (!fields) return { state: "pending", message: "Live comparison is available for Sender Adapter and Receiver Adapter." };
  if (requireActiveComponent && context.component !== component) return { state: "pending", message: `Select the ${component} in CPI. Only the active component is checked.` };
  if (!requireActiveComponent && context.component !== component) return { state: "pending", message: "Open a Sender or Receiver Adapter configuration in CPI to compare it." };

  const observed = new Map();
  (context.configurationFields || []).forEach((field) => {
    if (field.key && !observed.has(field.key)) observed.set(field.key, field);
  });
  const expectedFields = fields
    .map(([label, inventoryKey, fieldKey]) => ({ label, fieldKey, expected: inventoryValue(inventoryKey), observed: observed.get(fieldKey) }))
    .filter((item) => item.expected);
  const comparisons = expectedFields.filter((item) => item.observed && item.observed.value !== "").map((item) => ({ ...item, actual: item.observed.value }));
  const missing = expectedFields.filter((item) => !item.observed || item.observed.value === "");
  const mismatches = comparisons.filter((item) => normalized(item.expected, item.fieldKey) !== normalized(item.actual, item.fieldKey));

  if (mismatches.length) return { state: "error", comparisons, mismatches, missing };
  if (missing.length) return { state: "pending", comparisons, missing, message: "Waiting to read the remaining visible configuration fields." };
  if (!comparisons.length) return { state: "pending", message: `Monitoring ${component}. Open or edit a visible configuration field in CPI to compare it.` };
  return { state: "ok", comparisons };
}
function comparisonMarkup(result) {
  if (result.state === "pending") {
    const waiting = result.missing?.length ? `<ul>${result.missing.map((item) => `<li>${escapeHtml(item.label)}: expected “${escapeHtml(item.expected)}”</li>`).join("")}</ul>` : "";
    return `<div class="check pending"><p><b>Live validation waiting</b><br>${escapeHtml(result.message)}</p>${waiting}</div>`;
  }
  if (result.state === "error") {
    const details = result.mismatches.map((item) => `<li><b>${escapeHtml(item.label)}:</b> entered “${escapeHtml(item.actual)}”; correct value: “${escapeHtml(item.expected)}”.</li>`).join("");
    return `<div class="check error"><p><b>⚠ Configuration warning</b><br>One or more visible CPI values do not match the selected interface configuration.</p><ul>${details}</ul></div>`;
  }
  return `<div class="check ok"><p><b>✓ Configuration matches</b><br>All ${result.comparisons.length} visible configuration value${result.comparisons.length === 1 ? "" : "s"} match the selected interface data.</p></div>`;
}

function monitoringCard() {
  const fields = Object.keys(context.configuration || {}).length;
  const detail = fields ? `${fields} visible configuration value${fields === 1 ? "" : "s"} detected.` : "Click a CPI activity or open its settings to begin detection.";
  const selected = context.selected || "No palette function or adapter selected yet";
  const adapter = context.adapterType || "Not detected";
  const comparison = compareConfiguration(context.component);
  return card("Live CPI Monitor", rowList([["Current selection", selected], ["Validation category", context.component || "Integration Flow"], ["Detected adapter", adapter], ["Status", detail]])) + comparisonMarkup(comparison);
}

function validationCard() {
  return comparisonMarkup(compareConfiguration(tab, true));
}
function fcc() {
  const rows = [];
  if (valueOf(record, "Inb FCC Recordset Struct") !== "Not maintained in inventory") rows.push(["Inbound FCC", `${valueOf(record, "Inb FCC Recordset Struct")} | document: ${valueOf(record, "Inb FCC Doc Name")}`]);
  if (valueOf(record, "Inb FCC Skip Rows") !== "Not maintained in inventory") rows.push(["CPI Recommendation", `Use Groovy before conversion to skip ${valueOf(record, "Inb FCC Skip Rows")} row(s).`]);
  if (valueOf(record, "Inb FCC Key Field") !== "Not maintained in inventory") rows.push(["CPI Recommendation", `Use Groovy grouping for key field ${valueOf(record, "Inb FCC Key Field")}.`]);
  if (valueOf(record, "Out FCC Recordset Struct") !== "Not maintained in inventory") rows.push(["Outbound FCC", `${valueOf(record, "Out FCC Recordset Struct")} | document: ${valueOf(record, "Out FCC Doc Name")}`]);
  return rows.length ? rows : [["FCC", "No FCC/file conversion parameters maintained."]];
}

function render() {
  $("#monitorActivity").textContent = context.activity || "Viewing Integration Flow canvas";
  $("#monitorDetail").textContent = context.iflow ? `iFlow: ${context.iflow}` : "Monitoring the Integration Flow canvas in real time.";
  if (!record) {
    $("#out").innerHTML = monitoringCard() + card("Start here", '<div class="row">Upload the workbook and search an interface name.</div>');
    return;
  }
  document.querySelectorAll("#tabs button").forEach((button) => button.classList.toggle("active", button.dataset.c === tab));
  if (tab === "Overview") {
    $("#out").innerHTML = monitoringCard() + card("Complete iFlow Migration Overview", rowList([["ICO", valueOf(record, "Description")], ["Sender", `${valueOf(record, "Sender Component")} | ${valueOf(record, "Interface Name")} | ${valueOf(record, "Interface Namespace")}`], ["Receiver", `${valueOf(record, "Receiver Component")} | ${valueOf(record, "Receiver Interfaces")}`], ["Sender Adapter", valueOf(record, "Inbound Adapter")], ["Receiver Adapter", valueOf(record, "Outbound Adapter")], ["Mapping", valueOf(record, "Mapping Name")], ["Routing Condition", valueOf(record, "Routing Condition")], ["QoS", valueOf(record, "QualityOfService")], ["Recommended CPI Flow", "Sender Adapter → FCC/Content Modifier → Message Mapping → Router → Receiver Adapter → Exception Subprocess"]]));
    return;
  }
  if (specs[tab]) {
    $("#out").innerHTML = monitoringCard() + card(`Required ${tab} Configuration`, rowList(specs[tab].map(([label, inventoryKey]) => [label, valueOf(record, inventoryKey)]))) + validationCard() + card("Verify while configuring", '<div class="row warn">Enter the values above in CPI. The validator checks only the active adapter and never reads passwords or credentials.</div>');
    return;
  }
  if (tab === "Router") {
    $("#out").innerHTML = monitoringCard() + card("Router Configuration", rowList([["PI/PO Routing Condition", valueOf(record, "Routing Condition")], ["No Receiver Behaviour", valueOf(record, "No Recv Behaviour")], ["CPI Recommendation", "Convert this condition to namespace-aware XPath. Add a default route only when PI behavior defines a fallback."]]));
    return;
  }
  if (tab === "Message Mapping") {
    $("#out").innerHTML = monitoringCard() + card("Message Mapping Configuration", rowList([["Mapping Name", valueOf(record, "Mapping Name")], ["Mapping Namespace", valueOf(record, "Mapping Namespace")], ["Source Interface", valueOf(record, "Interface Name")], ["Target Interface", valueOf(record, "Receiver Interfaces")], ["Migration Note", "Review PI UDFs, Java mappings and queue functions; recreate unsupported logic with CPI Groovy."]]));
    return;
  }
  $("#out").innerHTML = monitoringCard() + card("FCC / File Content Conversion", rowList(fcc()));
}

function search() {
  const query = $("#q").value.toLowerCase().trim();
  results = query ? inventory.records.filter((item) => [item["Interface Name"], item["Receiver Interfaces"], item.Description].some((value) => String(value || "").toLowerCase().includes(query))) : [];
  const select = $("#matches");
  select.innerHTML = "";
  results.forEach((item, index) => select.add(new Option(X.label(item), index)));
  select.disabled = !results.length;
  record = results[0];
  render();
}

$("#file").onchange = async () => {
  try {
    inventory = await X.parse($("#file").files[0]);
    await chrome.storage.local.set({ finalInventory: inventory });
    $("#status").textContent = `${inventory.records.length} records loaded from ${inventory.fileName}.`;
    $("#q").disabled = false;
    search();
  } catch (error) {
    $("#status").textContent = error.message;
  }
};
$("#q").oninput = search;
$("#matches").onchange = () => { record = results[$("#matches").value]; render(); };
$("#tabs").onclick = (event) => { if (event.target.dataset.c) { tab = event.target.dataset.c; render(); } };

chrome.storage.local.get("finalInventory").then(({ finalInventory }) => {
  inventory = finalInventory;
  if (inventory) {
    $("#status").textContent = `${inventory.records.length} records loaded from ${inventory.fileName}.`;
    $("#q").disabled = false;
  }
});
chrome.runtime.sendMessage({ type: "GET_CPI_CONTEXT" }, (message) => { context = message || context; render(); });
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CPI_CONTEXT_UPDATED") { context = message.payload || context; render(); }
});

render();




