const $ = (sel) => document.querySelector(sel);
const SLIDERS = ["brightness", "contrast", "sepia", "grayscale"];

let settings = null;
let page = null; // { host, detectedDark } from the content script, or null if unsupported

async function init() {
  settings = await dmLoad();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) {
    try {
      page = await chrome.tabs.sendMessage(tab.id, { type: "status" }, { frameId: 0 });
    } catch (e) {
      page = null;
    }
  }

  bind();
  render();
  renderShortcut();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      settings = dmMerge(changes.settings.newValue);
      render();
    }
  });
}

// ---------- State helpers ----------

function currentRule() {
  return page ? settings.sites[page.host] || "default" : "default";
}

function siteState() {
  if (!page) return { state: "na", text: "Can't run here. If this tab was open before you installed Nightfall, reload it." };
  const rule = currentRule();
  if (rule === "on") return { state: "on", text: "Always dark on this site" };
  if (rule === "off") return { state: "off", text: "Turned off for this site" };
  if (!settings.enabled) return { state: "off", text: "Off, following your default" };
  if (settings.skipDarkSites && page.detectedDark) return { state: "off", text: "Left alone because it already looks dark" };
  return { state: "on", text: "Dark, following your default" };
}

let saveTimer = null;
function save(delay = 0) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => dmSave(settings), delay);
}

// ---------- Rendering ----------

function render() {
  $("#enabled").checked = settings.enabled;
  $("#globalLabel").textContent = settings.enabled
    ? "Dark by default on every site"
    : "Off by default; only sites set to “Always dark”";

  const { state, text } = siteState();
  $("#siteCard").dataset.state = state;
  $("#host").textContent = page ? page.host : "This page";
  $("#status").textContent = text;

  const rule = currentRule();
  document.querySelectorAll("#seg button").forEach((b) => {
    b.disabled = !page;
    b.setAttribute("aria-checked", String(!!page && b.dataset.rule === rule));
  });

  for (const key of SLIDERS) {
    const input = $("#" + key);
    if (document.activeElement !== input) input.value = settings[key];
    $("#" + key + "Out").textContent = settings[key] + "%";
  }

  $("#skipDark").checked = settings.skipDarkSites;
  renderRules();
}

function renderRules() {
  const list = $("#ruleList");
  list.replaceChildren();
  const hosts = Object.keys(settings.sites).sort();
  $("#ruleCount").textContent = hosts.length ? `(${hosts.length})` : "";
  $("#ruleEmpty").hidden = hosts.length > 0;

  for (const host of hosts) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "rule-host";
    name.textContent = host;
    const kind = document.createElement("span");
    kind.className = "rule-kind";
    kind.textContent = settings.sites[host] === "on" ? "Always dark" : "Never";
    const remove = document.createElement("button");
    remove.className = "rule-remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove rule for " + host);
    remove.addEventListener("click", () => {
      delete settings.sites[host];
      save();
      render();
    });
    li.append(name, kind, remove);
    list.append(li);
  }
}

async function renderShortcut() {
  const footer = $("#shortcut");
  let key = "";
  try {
    const cmds = await chrome.commands.getAll();
    const cmd = cmds.find((c) => c.name === "toggle-site");
    key = cmd && cmd.shortcut;
  } catch (e) {}

  footer.replaceChildren();
  if (key) {
    footer.append(`Press ${key} to toggle the current site.`);
  } else {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link";
    link.textContent = "Set a keyboard shortcut";
    link.addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
    footer.append(link);
  }
}

// ---------- Events ----------

function bind() {
  $("#enabled").addEventListener("change", (e) => {
    settings.enabled = e.target.checked;
    save();
    render();
  });

  document.querySelectorAll("#seg button").forEach((b) => {
    b.addEventListener("click", () => {
      if (!page) return;
      const rule = b.dataset.rule;
      if (rule === "default") delete settings.sites[page.host];
      else settings.sites[page.host] = rule;
      save();
      render();
    });
  });

  for (const key of SLIDERS) {
    $("#" + key).addEventListener("input", (e) => {
      settings[key] = Number(e.target.value);
      $("#" + key + "Out").textContent = settings[key] + "%";
      save(60); // live preview without flooding storage
    });
  }

  $("#reset").addEventListener("click", () => {
    Object.assign(settings, {
      brightness: DM_DEFAULTS.brightness,
      contrast: DM_DEFAULTS.contrast,
      sepia: DM_DEFAULTS.sepia,
      grayscale: DM_DEFAULTS.grayscale
    });
    save();
    render();
  });

  $("#skipDark").addEventListener("change", (e) => {
    settings.skipDarkSites = e.target.checked;
    save();
    render();
  });
}

init();
