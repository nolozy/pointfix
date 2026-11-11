// Pointfix - popup

const STORAGE_KEY = "yb_annotations";
const OVERALL_KEY = "yb_overall";
const $ = (id) => document.getElementById(id);

async function refresh() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const list = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  $("btn-copy").disabled = list.length === 0;
  $("status").textContent = list.length
    ? list.length + "件の指さしがあります"
    : "まだ指さしがありません";
  return list;
}

$("btn-start").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "YB_START_INSPECT" });
  window.close();
});

$("btn-panel").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "YB_OPEN_PANEL" });
  window.close();
});

$("btn-copy").addEventListener("click", async () => {
  const list = await refresh();
  const data = await chrome.storage.local.get(OVERALL_KEY);
  const prompt = ybBuildPrompt(list, data[OVERALL_KEY] || "");
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    $("status").textContent = "📋 コピーしました。AIに貼るだけ！";
  } catch (e) {
    $("status").textContent = "コピーできませんでした。サイドパネルから試してください";
  }
});

refresh();
