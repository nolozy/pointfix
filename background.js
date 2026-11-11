// Pointfix - background service worker
// The toolbar icon shows or hides the bottom-right bar on every page.
// The keyboard shortcuts are sent to the content script of the active tab.

const BAR_KEY = "yb_bar_visible";

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
  else if (command === "delete-all") sendToActiveTab({ type: "YB_DELETE_ALL" });
});
