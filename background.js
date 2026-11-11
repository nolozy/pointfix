// Pointfix - background service worker
// Routes the toolbar icon and the keyboard shortcuts to the content script
// of the active tab.

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

// Clicking the toolbar icon starts or stops Point mode.
chrome.action.onClicked.addListener(() => sendToActiveTab({ type: "YB_TOGGLE_POINT" }));

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-point") sendToActiveTab({ type: "YB_TOGGLE_POINT" });
  else if (command === "copy-prompt") sendToActiveTab({ type: "YB_COPY_PROMPT" });
  else if (command === "delete-all") sendToActiveTab({ type: "YB_DELETE_ALL" });
});
