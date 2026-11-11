// Pointfix - content script
// "指さしモード" (inspect mode): hover to highlight, click an element,
// add a short instruction, and a numbered pin stays on the page.
// Annotations are kept in chrome.storage.local and turned into an
// AI-ready prompt by the side panel / popup.

(function () {
  "use strict";
  if (window.__ybLoaded) return;
  window.__ybLoaded = true;

  const STORAGE_KEY = "yb_annotations";
  const OVERALL_KEY = "yb_overall";

  const CHIPS = [
    "大きくして", "小さくして", "色を変えて", "目立たせて",
    "余白を広げて", "上に移動して", "文言を変えて", "消して"
  ];

  const TAG_JA = {
    BUTTON: "ボタン", A: "リンク", INPUT: "入力欄", TEXTAREA: "テキスト入力欄",
    SELECT: "セレクトボックス", IMG: "画像", H1: "見出し", H2: "見出し",
    H3: "見出し", H4: "見出し", H5: "見出し", H6: "見出し",
    HEADER: "ヘッダー", NAV: "ナビゲーション", FOOTER: "フッター",
    FORM: "フォーム", P: "段落テキスト", LI: "リスト項目",
    TD: "表のセル", TH: "表の見出しセル", LABEL: "ラベル",
    SECTION: "セクション", ARTICLE: "記事ブロック", MAIN: "メイン部分",
    DIV: "ブロック", SPAN: "テキスト", UL: "リスト", OL: "リスト",
    TABLE: "表", VIDEO: "動画", SVG: "アイコン"
  };

  const state = {
    inspecting: false,
    editing: false,
    hoverEl: null,
    pending: null,
    recognition: null
  };

  function pageKey() {
    return location.origin + location.pathname + location.search;
  }

  function isOwnUI(el) {
    return !!(el && el.closest && el.closest("[data-yb-ui]"));
  }

  // ---------- element description ----------

  function visibleText(el) {
    const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return t.length > 40 ? t.slice(0, 40) + "…" : t;
  }

  function regionOf(rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const vw = window.innerWidth, vh = window.innerHeight;
    const v = cy < vh / 3 ? "上部" : cy > (vh * 2) / 3 ? "下部" : "中央";
    const h = cx < vw / 3 ? "左側" : cx > (vw * 2) / 3 ? "右側" : "中央";
    if (v === "中央" && h === "中央") return "画面中央";
    if (h === "中央") return "画面" + v;
    return "画面" + v + "の" + h;
  }

  function describe(el) {
    const rect = el.getBoundingClientRect();
    const kind = TAG_JA[el.tagName] || "要素";
    const text = visibleText(el);
    const region = regionOf(rect);
    let d = region + "にある";
    if (text) d += "「" + text + "」という" ;
    else if (el.tagName === "IMG" && el.getAttribute("alt")) d += "「" + el.getAttribute("alt") + "」という";
    d += kind;
    return { description: d, text };
  }

  // ---------- selector generation ----------

  function isStableClass(c) {
    if (!c || c.length < 2 || c.length > 40) return false;
    if (/^(yb-|ng-|css-|sc-|jsx-)/.test(c)) return false;
    if (/[a-zA-Z]\d{5,}|\d[a-zA-Z]{5,}/.test(c) && c.length > 14) return false; // hash-like
    return /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(c);
  }

  function unique(sel) {
    try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; }
  }

  function buildSelector(el) {
    if (el.id && unique("#" + CSS.escape(el.id))) return "#" + CSS.escape(el.id);
    const attrs = ["data-testid", "data-test", "data-cy", "aria-label", "name"];
    for (const a of attrs) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) {
        const sel = el.tagName.toLowerCase() + "[" + a + '="' + v.replace(/"/g, '\\"') + '"]';
        if (unique(sel)) return sel;
      }
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node.tagName !== "HTML") {
      let part = node.tagName.toLowerCase();
      if (node.id) { part = "#" + CSS.escape(node.id); parts.unshift(part); break; }
      const classes = Array.from(node.classList || []).filter(isStableClass).slice(0, 2);
      if (classes.length) part += "." + classes.map((c) => CSS.escape(c)).join(".");
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((s) => s.tagName === node.tagName);
        if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (unique(candidate)) return candidate;
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function captureInfo(el) {
    const rect = el.getBoundingClientRect();
    const { description, text } = describe(el);
    let html = "";
    try {
      html = (el.outerHTML || "").replace(/\s+/g, " ").trim();
      if (html.length > 600) html = html.slice(0, 600) + " <!-- … -->";
    } catch (e) { /* ignore */ }
    return {
      id: "yb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      url: location.href,
      pageKey: pageKey(),
      pageTitle: document.title || "",
      selector: buildSelector(el),
      tag: el.tagName.toLowerCase(),
      text,
      description,
      html,
      docX: Math.round(rect.left + window.scrollX),
      docY: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      instruction: ""
    };
  }

  // ---------- UI elements ----------

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    el.setAttribute("data-yb-ui", "1");
    return el;
  }

  const overlay = makeEl("div", "yb-overlay");
  const overlayLabel = makeEl("div", "yb-overlay-label");
  overlay.appendChild(overlayLabel);

  // The arrow that follows the mouse while inspecting.
  const cursorEl = makeEl("div", "yb-cursor");
  cursorEl.innerHTML =
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' +
    '<path d="M4 2 L4 19 L8.6 14.8 L11.4 21.6 L14.2 20.4 L11.4 13.6 L17.6 13.6 Z" ' +
    'fill="#6366f1" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  // Lagging position: the arrow eases toward the mouse, one frame at a time.
  const cur = { x: -100, y: -100, tx: -100, ty: -100, raf: 0 };
  function tickCursor() {
    cur.raf = 0;
    cur.x += (cur.tx - cur.x) * 0.28;
    cur.y += (cur.ty - cur.y) * 0.28;
    cursorEl.style.transform = "translate3d(" + cur.x + "px," + cur.y + "px,0)";
    if (Math.abs(cur.tx - cur.x) + Math.abs(cur.ty - cur.y) > 0.1) {
      cur.raf = requestAnimationFrame(tickCursor);
    }
  }

  function hideOverlay() {
    overlay.classList.remove("yb-on");
  }

  const pinsLayer = makeEl("div", "yb-pins");

  const toast = makeEl("div", "yb-toast");
  toast.style.display = "none";
  let toastTimer = null;
  function showToast(msg, ms) {
    toast.textContent = msg;
    toast.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = "none"; }, ms || 2200);
  }

  // Short ripple ring at the click point; removes itself when the animation ends.
  function ripple(x, y) {
    const r = makeEl("div", "yb-ripple");
    r.style.left = x + "px";
    r.style.top = y + "px";
    r.addEventListener("animationend", () => r.remove());
    document.documentElement.appendChild(r);
  }

  function ensureMounted() {
    if (!overlay.isConnected) document.documentElement.appendChild(overlay);
    if (!cursorEl.isConnected) document.documentElement.appendChild(cursorEl);
    if (!pinsLayer.isConnected) document.documentElement.appendChild(pinsLayer);
    if (!toast.isConnected) document.documentElement.appendChild(toast);
  }

  // ---------- editor ----------

  let editor = null;
  let editorChips = null;
  let editorInput = null;

  function closeEditor() {
    if (editor) { editor.remove(); editor = null; }
    state.editing = false;
    state.pending = null;
    stopVoice();
    // Back to the arrow cursor while inspecting; native cursor inside the editor.
    document.documentElement.classList.remove("yb-editing");
    cursorEl.classList.toggle("yb-on", state.inspecting);
  }

  function openEditor(info, anchorRect) {
    closeEditor();
    state.editing = true;
    state.pending = info;
    document.documentElement.classList.add("yb-editing");
    cursorEl.classList.remove("yb-on");

    editor = makeEl("div", "yb-editor yb-editor-in");
    const title = makeEl("div", "yb-editor-title", "ここをどうしてほしい？");
    const target = makeEl("div", "yb-editor-target", info.description);
    editorChips = makeEl("div", "yb-chips");
    const selected = new Set();
    CHIPS.forEach((chip) => {
      const b = makeEl("button", "yb-chip", chip);
      b.type = "button";
      b.addEventListener("click", () => {
        if (selected.has(chip)) { selected.delete(chip); b.classList.remove("yb-chip-on"); }
        else { selected.add(chip); b.classList.add("yb-chip-on"); }
      });
      editorChips.appendChild(b);
    });

    editorInput = makeEl("textarea", "yb-editor-input");
    editorInput.placeholder = "例：もっと目立つ色にして、文字も太くして";
    editorInput.rows = 2;

    const row = makeEl("div", "yb-editor-row");
    const micBtn = makeEl("button", "yb-mic", "🎤 音声で入力");
    micBtn.type = "button";
    micBtn.addEventListener("click", () => toggleVoice(micBtn));
    const spacer = makeEl("span", "yb-spacer");
    const cancelBtn = makeEl("button", "yb-btn yb-btn-ghost", "やめる");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", closeEditor);
    const addBtn = makeEl("button", "yb-btn yb-btn-primary", "＋ 追加する");
    addBtn.type = "button";
    addBtn.addEventListener("click", async () => {
      const parts = Array.from(selected);
      const free = editorInput.value.trim();
      if (free) parts.push(free);
      info.instruction = parts.join("／") || "ここを直してほしい";
      await addAnnotation(info);
      await renderPins();
      const n = await countForPage();
      closeEditor();
      showToast("📌 " + n + "件目の指さしを追加しました");
    });
    row.append(micBtn, spacer, cancelBtn, addBtn);

    editor.append(title, target, editorChips, editorInput, row);
    document.documentElement.appendChild(editor);

    // Position near the element, clamped to the viewport.
    const W = 340, H = editor.offsetHeight || 300;
    let left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - W - 8);
    let top = anchorRect.bottom + 10;
    if (top + H > window.innerHeight - 8) top = Math.max(8, anchorRect.top - H - 10);
    editor.style.left = left + "px";
    editor.style.top = top + "px";
    editorInput.focus();
  }

  // ---------- voice input ----------

  function stopVoice() {
    if (state.recognition) {
      try { state.recognition.stop(); } catch (e) { /* ignore */ }
      state.recognition = null;
    }
  }

  function toggleVoice(btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showToast("このブラウザでは音声入力が使えません"); return; }
    if (state.recognition) { stopVoice(); btn.classList.remove("yb-mic-on"); return; }
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.interimResults = false;
    rec.onresult = (ev) => {
      const text = ev.results[0][0].transcript;
      if (editorInput) {
        editorInput.value = (editorInput.value + " " + text).trim();
      }
    };
    rec.onend = () => { state.recognition = null; btn.classList.remove("yb-mic-on"); };
    rec.onerror = () => { state.recognition = null; btn.classList.remove("yb-mic-on"); };
    state.recognition = rec;
    btn.classList.add("yb-mic-on");
    try { rec.start(); } catch (e) { state.recognition = null; }
  }

  // ---------- storage ----------

  async function loadAll() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  }

  async function addAnnotation(info) {
    const all = await loadAll();
    all.push(info);
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
  }

  async function countForPage() {
    const all = await loadAll();
    return all.filter((a) => a.pageKey === pageKey()).length;
  }

  // ---------- pins ----------

  // Pins already shown on this page; only new ones get the pop-in animation.
  const shownPinIds = new Set();
  const popPinIds = new Set();
  let pinsReady = false;

  async function renderPins() {
    ensureMounted();
    const all = await loadAll();
    const mine = all.filter((a) => a.pageKey === pageKey());
    pinsLayer.textContent = "";
    mine.forEach((a, i) => {
      let x = a.docX, y = a.docY;
      if (a.selector) {
        try {
          const el = document.querySelector(a.selector);
          if (el) {
            const r = el.getBoundingClientRect();
            x = Math.round(r.left + window.scrollX);
            y = Math.round(r.top + window.scrollY);
          }
        } catch (e) { /* keep stored position */ }
      }
      const pin = makeEl("div", "yb-pin", String(i + 1));
      pin.style.left = x + "px";
      pin.style.top = y + "px";
      const key = a.id || "i" + i;
      if (!shownPinIds.has(key)) {
        shownPinIds.add(key);
        if (pinsReady) {
          // Re-renders happen right after adding (storage change + direct call),
          // so keep the pop-in class for a short window to avoid losing it.
          popPinIds.add(key);
          setTimeout(() => popPinIds.delete(key), 800);
        }
      }
      if (popPinIds.has(key)) pin.classList.add("yb-pin-in");
      pinsLayer.appendChild(pin);
    });
    pinsReady = true;
  }

  // ---------- inspect mode ----------

  function setInspect(on) {
    state.inspecting = on;
    document.documentElement.classList.toggle("yb-inspecting", on);
    if (!on) {
      hideOverlay();
      state.hoverEl = null;
      closeEditor();
      cursorEl.classList.remove("yb-on");
    } else {
      ensureMounted();
      cursorEl.classList.add("yb-on");
      showToast("👆 直したいところをクリックしてください（Escで終了）", 2600);
    }
  }

  document.addEventListener("mouseover", (ev) => {
    if (!state.inspecting || state.editing) return;
    const el = ev.target;
    if (!el || el.nodeType !== 1 || isOwnUI(el)) { hideOverlay(); return; }
    state.hoverEl = el;
    const rect = el.getBoundingClientRect();
    // Move with transform and resize; the CSS transition eases between elements.
    overlay.style.transform = "translate(" + rect.left + "px, " + rect.top + "px)";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.classList.add("yb-on");
    const { description } = describe(el);
    overlayLabel.textContent = description + "（" + Math.round(rect.width) + "×" + Math.round(rect.height) + "）";
  }, true);

  // Arrow follows the mouse only while inspecting (and not while the editor is open).
  document.addEventListener("mousemove", (ev) => {
    if (!state.inspecting) return;
    cur.tx = ev.clientX;
    cur.ty = ev.clientY;
    if (!cur.raf) cur.raf = requestAnimationFrame(tickCursor);
  }, { capture: true, passive: true });

  document.addEventListener("mousedown", (ev) => {
    if (state.inspecting && !isOwnUI(ev.target)) {
      ev.preventDefault();
      ev.stopPropagation();
      cursorEl.classList.add("yb-press");
    }
  }, true);

  document.addEventListener("mouseup", () => {
    cursorEl.classList.remove("yb-press");
  }, true);

  document.addEventListener("click", (ev) => {
    if (!state.inspecting || state.editing) return;
    const el = ev.target;
    if (!el || el.nodeType !== 1 || isOwnUI(el)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const rect = el.getBoundingClientRect();
    const info = captureInfo(el);
    hideOverlay();
    ripple(ev.clientX, ev.clientY);
    openEditor(info, rect);
  }, true);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (state.editing) closeEditor();
      else if (state.inspecting) setInspect(false);
    }
  }, true);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderPins, 200);
  });

  // ---------- messages ----------

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "YB_TOGGLE_INSPECT") setInspect(!state.inspecting);
    else if (message.type === "YB_START_INSPECT") setInspect(true);
    else if (message.type === "YB_STOP_INSPECT") setInspect(false);
    else if (message.type === "YB_REFRESH_PINS") renderPins();
    else if (message.type === "YB_COPY_PROMPT") {
      (async () => {
        const all = await loadAll();
        const mine = all.filter((a) => a.pageKey === pageKey());
        const target = mine.length ? mine : all;
        const data = await chrome.storage.local.get(OVERALL_KEY);
        const prompt = typeof ybBuildPrompt === "function"
          ? ybBuildPrompt(target, data[OVERALL_KEY] || "")
          : "";
        if (!prompt) { showToast("まだ指さしがありません"); return; }
        try {
          await navigator.clipboard.writeText(prompt);
          showToast("📋 プロンプトをコピーしました。AIに貼るだけ！");
        } catch (e) {
          showToast("コピーできませんでした。サイドパネルからコピーしてください");
        }
      })();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) renderPins();
  });

  renderPins();
})();
