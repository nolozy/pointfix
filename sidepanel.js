// Pointfix - side panel
// Lists annotations, lets the user edit / reorder / delete them,
// previews the generated prompt, and copies it to the clipboard.

const STORAGE_KEY = "yb_annotations";
const OVERALL_KEY = "yb_overall";

const $ = (id) => document.getElementById(id);
let annotations = [];
let overall = "";

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => { t.hidden = true; }, 2200);
}

async function load() {
  const data = await chrome.storage.local.get([STORAGE_KEY, OVERALL_KEY]);
  annotations = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  overall = data[OVERALL_KEY] || "";
  if ($("overall").value !== overall) $("overall").value = overall;
  render();
}

async function save() {
  await chrome.storage.local.set({ [STORAGE_KEY]: annotations });
}

function currentPrompt() {
  return ybBuildPrompt(annotations, overall);
}

function render() {
  const has = annotations.length > 0;
  $("empty").hidden = has;
  $("list-wrap").hidden = !has;
  $("btn-copy").disabled = !has;
  $("count").textContent = has
    ? annotations.length + "件の指さし（" + (annotations[0].pageTitle || "ページ") + "）"
    : "まだ指さしがありません";

  const list = $("list");
  list.textContent = "";
  annotations.forEach((a, i) => {
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = String(i + 1);
    const desc = document.createElement("div");
    desc.className = "card-desc";
    desc.textContent = a.description || "要素";
    const btns = document.createElement("div");
    btns.className = "card-btns";

    const up = document.createElement("button");
    up.className = "icon-btn"; up.textContent = "↑"; up.title = "上へ";
    up.disabled = i === 0;
    up.addEventListener("click", async () => {
      [annotations[i - 1], annotations[i]] = [annotations[i], annotations[i - 1]];
      await save(); render();
    });
    const down = document.createElement("button");
    down.className = "icon-btn"; down.textContent = "↓"; down.title = "下へ";
    down.disabled = i === annotations.length - 1;
    down.addEventListener("click", async () => {
      [annotations[i + 1], annotations[i]] = [annotations[i], annotations[i + 1]];
      await save(); render();
    });
    const del = document.createElement("button");
    del.className = "icon-btn"; del.textContent = "🗑"; del.title = "削除";
    del.addEventListener("click", async () => {
      annotations.splice(i, 1);
      await save(); render();
    });
    btns.append(up, down, del);
    head.append(badge, desc, btns);

    const sel = document.createElement("div");
    sel.className = "card-selector";
    sel.textContent = a.selector || "";

    const input = document.createElement("input");
    input.className = "card-input";
    input.value = a.instruction || "";
    input.placeholder = "やってほしいこと";
    input.addEventListener("change", async () => {
      annotations[i].instruction = input.value;
      await save();
      $("preview").value = currentPrompt();
    });

    card.append(head, sel, input);
    list.appendChild(card);
  });

  $("preview").value = currentPrompt();
}

$("btn-inspect").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({ type: "YB_START_INSPECT" });
  if (res && res.ok) toast("👆 ページで直したいところをクリック！");
  else toast("このページでは使えません（Chromeの内部ページなど）");
});

$("btn-copy").addEventListener("click", async () => {
  const prompt = currentPrompt();
  if (!prompt) return;
  try {
    await navigator.clipboard.writeText(prompt);
    toast("📋 コピーしました。AIに貼るだけ！");
  } catch (e) {
    $("preview").select();
    document.execCommand("copy");
    toast("📋 コピーしました");
  }
});

$("btn-clear").addEventListener("click", async () => {
  if (annotations.length === 0) return;
  annotations = [];
  await save();
  render();
  toast("指さしをすべて消しました");
});

$("overall").addEventListener("change", async () => {
  overall = $("overall").value;
  await chrome.storage.local.set({ [OVERALL_KEY]: overall });
  $("preview").value = currentPrompt();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_KEY] || changes[OVERALL_KEY]) load();
});

load();
