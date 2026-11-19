// Pointfix - background service worker
// The toolbar icon shows or hides the bottom-right bar on every page.
// The keyboard shortcuts are sent to the content script of the active tab.

const BAR_KEY = "yb_bar_visible";
const BAR_SITES_KEY = "yb_bar_sites";
const STORAGE_KEY = "yb_annotations";

// Dev / preview hosts where the bar is shown automatically by default.
const DEV_HOST_RE = /(?:^|\.)(?:localhost|local|test|invalid|example|vercel\.app|pages\.dev|netlify\.app|fly\.dev|railway\.app|onrender\.com|github\.io|ngrok-free\.app|ngrok\.io)$/i;
const PRIVATE_IP_RE = /^(?:127(?:\.\d+){3}|10(?:\.\d+){3}|192\.168(?:\.\d+){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d+){2}|0\.0\.0\.0|\[?::1\]?)$/;

function isDevHost(hostname, protocol) {
  if (protocol === "file:") return true;
  if (!hostname) return false;
  return DEV_HOST_RE.test(hostname) || PRIVATE_IP_RE.test(hostname);
}

function resolveBarVisible(urlStr, globalPref, siteMap) {
  if (globalPref === false) return false;
  try {
    const u = new URL(urlStr);
    if (siteMap && typeof siteMap[u.origin] === "boolean") return siteMap[u.origin];
    if (globalPref === true) return true;
    return isDevHost(u.hostname, u.protocol);
  } catch (e) {
    return globalPref === true;
  }
}

// Serialize all annotation writes through the single service worker so two tabs
// saving at the same time never overwrite each other's changes.
let storageQueue = Promise.resolve();

function originOf(a) {
  if (a && a.siteOrigin) return a.siteOrigin;
  try { return new URL(a.url).origin; } catch (e) { return ""; }
}

function enqueueMutation(fn) {
  const next = storageQueue.then(fn, fn);
  storageQueue = next.catch(() => {});
  return next;
}

async function applyMutation(msg, sender) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  let list = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY].slice() : [];
  let removed = [];

  if (msg.op === "add" && msg.item && msg.item.id) {
    const item = { ...msg.item };
    // Attach the top tab's origin/URL so points inside cross-origin or child iframes
    // belong to the page the user has open.
    if (sender && sender.tab && sender.tab.url) {
      try {
        item.siteOrigin = new URL(sender.tab.url).origin;
        if (item.inFrame && !item.topUrl) item.topUrl = sender.tab.url;
      } catch (e) { /* keep */ }
    }
    const idx = list.findIndex((a) => a.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.push(item);
  } else if (msg.op === "update" && msg.id && msg.patch) {
    const idx = list.findIndex((a) => a.id === msg.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...msg.patch };
  } else if (msg.op === "delete" && msg.id) {
    removed = list.filter((a) => a.id === msg.id);
    list = list.filter((a) => a.id !== msg.id);
  } else if (msg.op === "deleteOrigin" && msg.origin) {
    removed = list.filter((a) => originOf(a) === msg.origin);
    list = list.filter((a) => originOf(a) !== msg.origin);
  } else if (msg.op === "restore" && Array.isArray(msg.items)) {
    const existing = new Set(list.map((a) => a.id));
    for (const item of msg.items) {
      if (item && item.id && !existing.has(item.id)) {
        list.push(item);
        existing.add(item.id);
      }
    }
  } else {
    return { ok: false, error: "unknown-op" };
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: list });
  return { ok: true, list, removed };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 });
  } catch (e) {
    // The content script is not available on this page (for example chrome:// pages).
  }
}

function setTitleFor(globalPref) {
  let title = "Pointfix: shown on dev sites. Click to toggle on this site.";
  if (globalPref === true) title = "Pointfix: shown on all sites. Click to toggle on this site.";
  else if (globalPref === false) title = "Pointfix: hidden on all sites. Click to show on this site.";
  chrome.action.setTitle({ title });
}

function setupMenus(globalPref) {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    const mode = globalPref === true ? "all" : globalPref === false ? "none" : "dev";
    chrome.contextMenus.create({ id: "pf-mode-dev", title: "Show on dev sites only (default)", type: "radio", checked: mode === "dev", contexts: ["action"] });
    chrome.contextMenus.create({ id: "pf-mode-all", title: "Show on all sites", type: "radio", checked: mode === "all", contexts: ["action"] });
    chrome.contextMenus.create({ id: "pf-mode-none", title: "Hide on all sites", type: "radio", checked: mode === "none", contexts: ["action"] });
    chrome.contextMenus.create({ id: "pf-sep", type: "separator", contexts: ["action"] });
    chrome.contextMenus.create({ id: "pf-options", title: "Prompt settings...", contexts: ["action"] });
  });
}

async function syncMenusAndTitle() {
  const data = await chrome.storage.local.get(BAR_KEY);
  const g = data[BAR_KEY];
  setTitleFor(g);
  if (chrome.contextMenus) {
    chrome.contextMenus.update("pf-mode-dev", { checked: g !== true && g !== false }).catch(() => {});
    chrome.contextMenus.update("pf-mode-all", { checked: g === true }).catch(() => {});
    chrome.contextMenus.update("pf-mode-none", { checked: g === false }).catch(() => {});
  }
}

async function toggleBarForTab(tab) {
  const data = await chrome.storage.local.get([BAR_KEY, BAR_SITES_KEY]);
  const globalPref = data[BAR_KEY];
  const siteMap = (data[BAR_SITES_KEY] && typeof data[BAR_SITES_KEY] === "object") ? { ...data[BAR_SITES_KEY] } : {};

  if (tab && tab.url && /^(https?|file):/i.test(tab.url)) {
    const u = new URL(tab.url);
    const nowVisible = resolveBarVisible(tab.url, globalPref, siteMap);
    if (!nowVisible) {
      if (globalPref === false) await chrome.storage.local.remove(BAR_KEY);
      siteMap[u.origin] = true;
    } else {
      siteMap[u.origin] = false;
    }
    await chrome.storage.local.set({ [BAR_SITES_KEY]: siteMap });
  } else {
    // Non-web pages (chrome:// etc.): toggle global visibility.
    if (globalPref === false) await chrome.storage.local.remove(BAR_KEY);
    else await chrome.storage.local.set({ [BAR_KEY]: false });
  }
  await syncMenusAndTitle();
}

// Clicking the toolbar icon toggles the bar for the current site.
chrome.action.onClicked.addListener((tab) => { toggleBarForTab(tab); });

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(BAR_KEY).then((d) => {
    setTitleFor(d[BAR_KEY]);
    setupMenus(d[BAR_KEY]);
  });
});

chrome.storage.local.get(BAR_KEY).then((d) => {
  setTitleFor(d[BAR_KEY]);
  setupMenus(d[BAR_KEY]);
});

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId === "pf-options") {
      chrome.runtime.openOptionsPage();
      return;
    }
    if (info.menuItemId === "pf-mode-dev") {
      await chrome.storage.local.remove([BAR_KEY, BAR_SITES_KEY]);
    } else if (info.menuItemId === "pf-mode-all") {
      await chrome.storage.local.set({ [BAR_KEY]: true });
      await chrome.storage.local.remove(BAR_SITES_KEY);
    } else if (info.menuItemId === "pf-mode-none") {
      await chrome.storage.local.set({ [BAR_KEY]: false });
      await chrome.storage.local.remove(BAR_SITES_KEY);
    }
    await syncMenusAndTitle();
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-point") sendToActiveTab({ type: "YB_TOGGLE_POINT" });
  else if (command === "copy-prompt") sendToActiveTab({ type: "YB_COPY_PROMPT" });
  else if (command === "copy-image") sendToActiveTab({ type: "YB_COPY_IMAGE" });
  else if (command === "delete-all") sendToActiveTab({ type: "YB_DELETE_ALL" });
});

// The content script asks for a picture of the visible part of its tab
// (with the numbered boxes and notes drawn on the page).
// captureVisibleTab takes whatever tab is in front in the window, so only
// capture when the asking tab is that tab; never another page.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "YB_MUTATE") {
    enqueueMutation(() => applyMutation(message, sender))
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (message.type === "YB_SYNC_POINT" && sender.tab && sender.tab.id) {
    chrome.tabs.sendMessage(sender.tab.id, { type: "YB_SET_POINT", on: !!message.on }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "YB_SYNC_CAPTURING" && sender.tab && sender.tab.id) {
    chrome.tabs.sendMessage(sender.tab.id, { type: "YB_SET_CAPTURING", on: !!message.on }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "YB_TAB_ORIGIN") {
    let origin = "";
    try { if (sender.tab && sender.tab.url) origin = new URL(sender.tab.url).origin; } catch (e) { /* ignore */ }
    sendResponse({ origin });
    return;
  }

  if (message.type !== "YB_CAPTURE" || !sender.tab) return;
  (async () => {
    try {
      const [front] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
      if (!front || front.id !== sender.tab.id) {
        sendResponse({ error: "not-front" });
        return;
      }
      const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
      // Check again: the user may have switched tabs while the picture was taken.
      const [after] = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
      if (!after || after.id !== sender.tab.id) {
        sendResponse({ error: "not-front" });
        return;
      }
      sendResponse({ dataUrl });
    } catch (e) {
      sendResponse({ error: String((e && e.message) || e) });
    }
  })();
  return true;   // answer asynchronously
});
