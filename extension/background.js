importScripts("shared.js");

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get("settings");
  if (!data.settings) await dmSave(dmMerge({}));
});

// Alt+Shift+D: toggle dark mode on the current site.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "toggle-site") return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle" }, { frameId: 0 });
  } catch (e) {
    // No content script here (browser pages, extension store, or tab opened before install).
  }
});
