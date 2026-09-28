// Nightfall content script: darkens the page by inverting it, then
// re-inverting media (images, video, etc.) so they look normal again.

(() => {
  if (window.__nightfallLoaded) return;
  window.__nightfallLoaded = true;

  const STYLE_ID = "nightfall-dark-style";
  const INVERT = "invert(1) hue-rotate(180deg)";
  const isTop = window === window.top;
  const host = dmNormalizeHost(getTopHost()) || "local files";

  let settings = null;
  let detectedDark = false;     // page already has a dark design
  let videoFullscreen = false;  // a video is playing fullscreen

  // Iframes follow the rule of the page they're embedded in.
  function getTopHost() {
    if (isTop) return location.hostname;
    try {
      return window.top.location.hostname;
    } catch (e) { /* cross-origin */ }
    const ancestors = location.ancestorOrigins;
    if (ancestors && ancestors.length) {
      try { return new URL(ancestors[ancestors.length - 1]).hostname; } catch (e) {}
    }
    return location.hostname;
  }

  function defaultActive() {
    return settings.enabled && !(settings.skipDarkSites && detectedDark);
  }

  function isActive() {
    if (!settings) return false;
    const rule = settings.sites[host];
    if (rule === "on") return true;
    if (rule === "off") return false;
    return defaultActive();
  }

  function buildCss() {
    const s = settings;
    const extra = [];
    if (s.brightness !== 100) extra.push(`brightness(${s.brightness / 100})`);
    if (s.contrast !== 100) extra.push(`contrast(${s.contrast / 100})`);
    if (s.sepia) extra.push(`sepia(${s.sepia / 100})`);
    if (s.grayscale) extra.push(`grayscale(${s.grayscale / 100})`);
    const pageFilter = [INVERT].concat(extra).join(" ");

    return `
html { filter: ${pageFilter} !important; background-color: #fff; }
html img, html video, html canvas, html iframe, html embed, html object,
html :not(body)[style*="background-image"][style*="url("] {
  filter: ${INVERT} !important;
}`;
  }

  function apply() {
    let el = document.getElementById(STYLE_ID);
    if (!isActive() || videoFullscreen) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.documentElement.appendChild(el);
    }
    const css = buildCss();
    if (el.textContent !== css) el.textContent = css;
  }

  // Some sites rebuild the <html> children; put our style back if it disappears.
  new MutationObserver(() => {
    if (!document.getElementById(STYLE_ID) && isActive() && !videoFullscreen) apply();
  }).observe(document.documentElement, { childList: true });

  // ---------- Detect pages that are already dark ----------

  function parseColor(str) {
    const m = /rgba?\(([^)]+)\)/.exec(str || "");
    if (!m) return null;
    const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function luminance(c) {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function looksDark() {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta && /^\s*dark\s*$/i.test(meta.content)) return true;

    const body = document.body;
    if (body) {
      const bg = parseColor(getComputedStyle(body).backgroundColor);
      if (bg && bg.a > 0.5) return luminance(bg) < 0.15;
      const text = parseColor(getComputedStyle(body).color);
      if (text && luminance(text) > 0.6) return true;
    }
    const rootBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
    if (rootBg && rootBg.a > 0.5) return luminance(rootBg) < 0.15;
    return false;
  }

  function checkDark() {
    if (!settings || detectedDark) return;
    if (looksDark()) {
      detectedDark = true;
      apply();
    }
  }

  // ---------- Wiring ----------

  dmLoad().then((s) => {
    settings = s;
    apply();
    if (document.readyState !== "loading") checkDark();
  });

  document.addEventListener("DOMContentLoaded", checkDark);
  window.addEventListener("load", checkDark);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = dmMerge(changes.settings.newValue);
    apply();
  });

  // Show fullscreen videos with their real colors.
  document.addEventListener("fullscreenchange", () => {
    const fe = document.fullscreenElement;
    videoFullscreen = !!fe && (fe.tagName === "VIDEO" || !!fe.querySelector("video"));
    apply();
  });

  async function toggleSite() {
    settings = await dmLoad();
    const want = !isActive();
    if (want === defaultActive()) delete settings.sites[host];
    else settings.sites[host] = want ? "on" : "off";
    await dmSave(settings);
    return want;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isTop || !msg) return false;
    if (msg.type === "status") {
      sendResponse({ host: host, active: isActive(), detectedDark: detectedDark });
      return false;
    }
    if (msg.type === "toggle") {
      toggleSite().then((active) => sendResponse({ active: active }));
      return true; // async response
    }
    return false;
  });
})();
