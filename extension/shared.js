// Shared settings helpers for Nightfall (loaded by content script, popup and background).

var DM_DEFAULTS = {
  enabled: true,        // dark mode on sites that have no rule of their own
  brightness: 100,      // percent
  contrast: 100,        // percent
  sepia: 0,             // percent
  grayscale: 0,         // percent
  skipDarkSites: true,  // leave sites alone that already look dark
  sites: {}             // hostname -> "on" | "off"
};

function dmMerge(raw) {
  raw = raw || {};
  return Object.assign({}, DM_DEFAULTS, raw, { sites: Object.assign({}, raw.sites || {}) });
}

async function dmLoad() {
  const data = await chrome.storage.local.get("settings");
  return dmMerge(data.settings);
}

async function dmSave(settings) {
  await chrome.storage.local.set({ settings: settings });
}

function dmNormalizeHost(hostname) {
  return (hostname || "").replace(/^www\./i, "").toLowerCase();
}
