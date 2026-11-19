// Pointfix - options page
(function () {
  "use strict";
  const SETTINGS_KEY = "yb_settings";
  const radios = Array.from(document.querySelectorAll('input[name="promptLang"]'));
  const noteEl = document.getElementById("promptNote");
  const saveBtn = document.getElementById("saveBtn");
  const statusEl = document.getElementById("status");
  const previewEl = document.getElementById("preview");

  function currentLang() {
    const checked = radios.find((r) => r.checked);
    return checked && checked.value === "ja" ? "ja" : "en";
  }

  function renderPreview() {
    const ja = currentLang() === "ja";
    const note = noteEl.value.trim();
    const lines = ja ? [
      "以下のWebページを指示どおりに修正してください。注釈を付けた要素だけを変更してください。",
      "変更が終わったら、何を変えたか簡潔に教えてください。",
      "",
      "# 注釈",
      "",
      "## 注釈 1",
      "**URL**: https://example.com/",
      "**対象**: `button#cta`",
      "**ソース**: `src/components/Hero.tsx:24:9` (Hero)",
      "**タグ名**: BUTTON",
      "**テキスト**: Sign up",
      "**現在のスタイル**: 120×40px; font 15px / 700; color #ffffff; background #1d9bf0",
      "**指示**: もう少し大きくして角丸を強めてください",
      ""
    ] : [
      "Please update the web pages below as described. Change only the annotated elements.",
      "After the changes, briefly tell me what you changed.",
      "",
      "# Annotations",
      "",
      "## Annotation 1",
      "**URL**: https://example.com/",
      "**Target**: `button#cta`",
      "**Source**: `src/components/Hero.tsx:24:9` (Hero)",
      "**TagName**: BUTTON",
      "**Inner Content**: Sign up",
      "**Current**: 120×40px; font 15px / 700; color #ffffff; background #1d9bf0",
      "**Instruction**: make it bigger and rounder",
      ""
    ];
    if (note) {
      lines.push(note);
      lines.push("");
    }
    previewEl.textContent = lines.join("\n");
  }

  let statusTimer = null;
  async function save() {
    const settings = {
      promptLang: currentLang(),
      promptNote: noteEl.value.trim()
    };
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    statusEl.textContent = "Saved";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusEl.textContent = ""; }, 2000);
  }

  radios.forEach((r) => r.addEventListener("change", renderPreview));
  noteEl.addEventListener("input", renderPreview);
  saveBtn.addEventListener("click", save);

  chrome.storage.local.get(SETTINGS_KEY).then((d) => {
    const s = (d && d[SETTINGS_KEY]) || {};
    const lang = s.promptLang === "ja" ? "ja" : "en";
    radios.forEach((r) => { r.checked = r.value === lang; });
    noteEl.value = typeof s.promptNote === "string" ? s.promptNote : "";
    renderPreview();
  });
})();
