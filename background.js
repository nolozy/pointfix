// Pointfix - background service worker
// Handles the toolbar button, keyboard shortcuts, and message routing
// between the popup / side panel and the content script.

const INSPECT_MESSAGE = { type: "YB_TOGGLE_INSPECT" };

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function sendToActiveTab(message) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return false;
  try {
    await chrome.tabs.sendMessage(tab.id, message);
    return true;
  } catch (e) {
    // Content script is not available on this page (e.g. chrome:// pages).
    return false;
  }
}

async function openPanelAndInspect(windowId) {
  try {
    await chrome.sidePanel.open({ windowId });
  } catch (e) {
    // Side panel may already be open; ignore.
  }
  await sendToActiveTab(INSPECT_MESSAGE);
}

// Clicking the toolbar icon opens the side panel and starts inspect mode.
chrome.action.onClicked.addListener(async (tab) => {
  await openPanelAndInspect(tab.windowId);
});

chrome.commands.onCommand.addListener(async (command) => {
  const tab = await getActiveTab();
  if (command === "toggle-inspect") {
    await sendToActiveTab(INSPECT_MESSAGE);
  } else if (command === "open-panel") {
    if (tab) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (e) { /* already open */ }
    }
  } else if (command === "copy-prompt") {
    await sendToActiveTab({ type: "YB_COPY_PROMPT" });
  } else if (command === "clear-all") {
    await chrome.storage.local.set({ yb_annotations: [] });
    await sendToActiveTab({ type: "YB_REFRESH_PINS" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "YB_START_INSPECT") {
    (async () => {
      const tab = await getActiveTab();
      if (tab) {
        try {
          await chrome.sidePanel.open({ windowId: tab.windowId });
        } catch (e) { /* already open */ }
      }
      const ok = await sendToActiveTab({ type: "YB_START_INSPECT" });
      sendResponse({ ok });
    })();
    return true; // async response
  }

  if (message.type === "YB_STOP_INSPECT") {
    (async () => {
      const ok = await sendToActiveTab({ type: "YB_STOP_INSPECT" });
      sendResponse({ ok });
    })();
    return true;
  }

  if (message.type === "YB_OPEN_PANEL") {
    (async () => {
      const tab = await getActiveTab();
      if (tab) {
        try {
          await chrome.sidePanel.open({ windowId: tab.windowId });
          sendResponse({ ok: true });
          return;
        } catch (e) { /* fall through */ }
      }
      sendResponse({ ok: false });
    })();
    return true;
  }
});

// Allow the side panel to be opened from the action button handler above;
// do not also auto-open on action click.
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}
