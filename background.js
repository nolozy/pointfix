// Pointfix - background service worker
// The toolbar icon shows or hides the bottom-right bar on every page.
// The keyboard shortcuts are sent to the content script of the active tab.

const BAR_KEY = "yb_bar_visible";
const STORAGE_KEY = "yb_annotations";

// Serialize all annotation writes through the single service worker so two tabs
// saving at the same time never overwrite each other's changes.
let storageQueue = Promise.resolve();

function originOf(a) {
  try { return new URL(a.url).origin; } catch (e) { return ""; }
}

function enqueueMutation(fn) {
  const next = storageQueue.then(fn, fn);
  storageQueue = next.catch(() => {});
  return next;
}

async function applyMutation(msg) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  let list = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY].slice() : [];
  let removed = [];

  if (msg.op === "add" && msg.item && msg.item.id) {
    const idx = list.findIndex((a) => a.id === msg.item.id);
    if (idx >= 0) list[idx] = msg.item;
    else list.push(msg.item);
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
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    // The content script is not available on this page (for example chrome:// pages).
  }
}

function setTitleFor(visible) {
  chrome.action.setTitle({
    title: visible
      ? "Pointfix: bar is shown. Click to hide it."
      : "Pointfix: bar is hidden. Click to show it."
  });
}

// Clicking the toolbar icon flips the bar setting. The content scripts
// on every tab react to the stored value.
chrome.action.onClicked.addListener(async () => {
  const data = await chrome.storage.local.get(BAR_KEY);
  const visible = data[BAR_KEY] !== false;
  await chrome.storage.local.set({ [BAR_KEY]: !visible });
  setTitleFor(!visible);
});

chrome.storage.local.get(BAR_KEY).then((data) => setTitleFor(data[BAR_KEY] !== false));

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
    enqueueMutation(() => applyMutation(message))
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
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
