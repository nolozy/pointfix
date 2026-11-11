// Pointfix - content script
// Point mode: hover to highlight, click an element, type what should change.
// Each point gets a dashed box with a number. Points are saved in
// chrome.storage.local and can be copied as a short English prompt for AI agents.

(function () {
  "use strict";
  if (window.__ybLoaded) return;
  window.__ybLoaded = true;

  const STORAGE_KEY = "yb_annotations";

  const KIND = {
    BUTTON: "button", A: "link", INPUT: "input", TEXTAREA: "text area",
    SELECT: "select", IMG: "image", H1: "heading", H2: "heading", H3: "heading",
    H4: "heading", H5: "heading", H6: "heading", HEADER: "header", NAV: "nav",
    FOOTER: "footer", FORM: "form", P: "paragraph", LI: "list item", TD: "table cell",
    TH: "table header", LABEL: "label", SECTION: "section", ARTICLE: "article",
    MAIN: "main", DIV: "block", SPAN: "text", UL: "list", OL: "list", TABLE: "table",
    VIDEO: "video", SVG: "icon"
  };

  const state = { point: false, editing: false };
  let pageCount = 0;

  function pageKey() {
    return location.origin + location.pathname + location.search;
  }

  function isOwnUI(el) {
    return !!(el && el.closest && el.closest("[data-yb-ui]"));
  }

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = text;
    el.setAttribute("data-yb-ui", "1");
    return el;
  }

  // ---------- element description ----------

  function shortText(el) {
    const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return t.length > 60 ? t.slice(0, 60) + "..." : t;
  }

  function labelFor(el) {
    const r = el.getBoundingClientRect();
    const kind = KIND[el.tagName] || "element";
    const text = shortText(el);
    return kind + (text ? ' "' + text + '"' : "") + " · " + Math.round(r.width) + "×" + Math.round(r.height);
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
    return {
      id: "yb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      pageKey: pageKey(),
      url: location.href,
      selector: buildSelector(el),
      tagName: el.tagName,
      innerText: shortText(el),
      instruction: "",
      docX: Math.round(rect.left + window.scrollX),
      docY: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  // ---------- prompt ----------

  // Points can come from several pages; each annotation carries its own URL.
  function buildPrompt(list) {
    const lines = [];
    lines.push("Please update the web pages below as described. Change only the annotated elements.");
    lines.push("After the changes, briefly tell me what you changed.");
    lines.push("");
    lines.push("# Annotations");
    lines.push("");
    list.forEach((a, i) => {
      lines.push("## Annotation " + (i + 1));
      lines.push("**URL**: " + a.url);
      lines.push("**Target**: `" + a.selector + "`");
      lines.push("**TagName**: " + a.tagName);
      if (a.innerText) lines.push("**Inner Content**: " + a.innerText);
      lines.push("**Instruction**: " + a.instruction);
      lines.push("");
    });
    return lines.join("\n");
  }

  function fallbackCopy(text) {
    const ta = makeEl("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.documentElement.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  // ---------- UI elements ----------

  const overlay = makeEl("div", "yb-overlay");
  const overlayLabel = makeEl("div", "yb-overlay-label");
  overlay.appendChild(overlayLabel);

  // Arrow that follows the mouse in Point mode.
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

  const boxLayer = makeEl("div", "yb-boxes");

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

  function barButton(label, hint, extra) {
    const b = makeEl("button", "yb-bar-btn" + (extra ? " " + extra : ""));
    b.type = "button";
    b.append(makeEl("span", "", label), makeEl("kbd", "yb-kbd", hint));
    return b;
  }

  // Small bar at the bottom right with the three actions.
  const bar = makeEl("div", "yb-bar");
  const countEl = makeEl("span", "yb-bar-count", "No points");
  const pointBtn = barButton("Start", "Alt+S", "yb-bar-primary");
  const copyBtn = barButton("Copy prompt", "Alt+C");
  const deleteBtn = barButton("Delete all", "Alt+X");
  bar.append(countEl, pointBtn, copyBtn, deleteBtn);
  pointBtn.addEventListener("click", () => setPoint(!state.point));
  copyBtn.addEventListener("click", copyPrompt);
  deleteBtn.addEventListener("click", deleteAll);

  function updateBar() {
    countEl.textContent = pageCount
      ? pageCount + (pageCount === 1 ? " point" : " points")
      : "No points";
    copyBtn.disabled = pageCount === 0;
    deleteBtn.disabled = pageCount === 0;
    pointBtn.firstChild.textContent = state.point ? "Stop" : "Start";
    pointBtn.classList.toggle("yb-bar-on", state.point);
  }

  // The bar can be hidden for every page from the toolbar icon. Point mode still
  // works with Alt+S and Esc while it is hidden.
  const BAR_KEY = "yb_bar_visible";
  function applyBarVisible(visible) {
    bar.classList.toggle("yb-bar-hidden", !visible);
  }

  // ---------- bar position: drag it by the grip, the place is remembered ----------

  const BAR_POS_KEY = "yb_bar_pos";
  const grip = makeEl("div", "yb-grip");
  grip.innerHTML =
    '<svg width="12" height="22" viewBox="0 0 12 22" aria-hidden="true">' +
    [[3, 4], [9, 4], [3, 11], [9, 11], [3, 18], [9, 18]]
      .map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="1.7" fill="currentColor"/>').join("") +
    "</svg>";
  bar.insertBefore(grip, bar.firstChild);

  let savedPos = null;
  let dragging = null;

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // pos is {x, y} in pixels from the top-left of the screen, or null for the default corner.
  function applyBarPos(pos) {
    if (!pos) {
      bar.style.left = "";
      bar.style.top = "";
      bar.style.right = "";
      bar.style.bottom = "";
      return;
    }
    const x = clamp(pos.x, 0, window.innerWidth - bar.offsetWidth);
    const y = clamp(pos.y, 0, window.innerHeight - bar.offsetHeight);
    bar.style.left = x + "px";
    bar.style.top = y + "px";
    bar.style.right = "auto";
    bar.style.bottom = "auto";
  }

  grip.addEventListener("pointerdown", (ev) => {
    const r = bar.getBoundingClientRect();
    dragging = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
    grip.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });

  grip.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    applyBarPos({ x: ev.clientX - dragging.dx, y: ev.clientY - dragging.dy });
  });

  async function endDrag() {
    if (!dragging) return;
    dragging = null;
    const r = bar.getBoundingClientRect();
    savedPos = { x: Math.round(r.left), y: Math.round(r.top) };
    try { await chrome.storage.local.set({ [BAR_POS_KEY]: savedPos }); } catch (e) { /* ignore */ }
  }
  grip.addEventListener("pointerup", endDrag);
  grip.addEventListener("pointercancel", endDrag);

  // Double-click the grip to put the bar back in its default corner.
  grip.addEventListener("dblclick", async () => {
    savedPos = null;
    applyBarPos(null);
    try { await chrome.storage.local.remove(BAR_POS_KEY); } catch (e) { /* ignore */ }
  });

  window.addEventListener("resize", () => applyBarPos(savedPos));

  function ensureMounted() {
    if (!overlay.isConnected) document.documentElement.appendChild(overlay);
    if (!cursorEl.isConnected) document.documentElement.appendChild(cursorEl);
    if (!boxLayer.isConnected) document.documentElement.appendChild(boxLayer);
    if (!toast.isConnected) document.documentElement.appendChild(toast);
    if (!bar.isConnected) document.documentElement.appendChild(bar);
  }

  // ---------- editor ----------

  let editor = null;

  function closeEditor() {
    if (editor) { editor.remove(); editor = null; }
    state.editing = false;
    document.documentElement.classList.remove("yb-editing");
    cursorEl.classList.toggle("yb-on", state.point);
  }

  function openEditor(info, label, anchorRect) {
    closeEditor();
    state.editing = true;
    document.documentElement.classList.add("yb-editing");
    cursorEl.classList.remove("yb-on");

    editor = makeEl("div", "yb-editor yb-editor-in");
    const title = makeEl("div", "yb-editor-title", "What should change?");
    const target = makeEl("div", "yb-editor-target", label);
    const input = makeEl("textarea", "yb-editor-input");
    input.placeholder = "Describe the change";
    input.rows = 2;

    const row = makeEl("div", "yb-editor-row");
    const spacer = makeEl("span", "yb-spacer");
    const cancelBtn = makeEl("button", "yb-btn yb-btn-ghost", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", closeEditor);
    const addBtn = makeEl("button", "yb-btn yb-btn-primary", "Add point");
    addBtn.type = "button";
    addBtn.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) { showToast("Type what should change"); input.focus(); return; }
      info.instruction = text;
      try {
        const list = await loadAll();
        list.push(info);
        await saveAll(list);
        closeEditor();
        showToast("Point " + list.length + " added");
      } catch (e) {
        showToast("Pointfix was updated. Please reload this page (F5).", 4000);
      }
    });
    row.append(spacer, cancelBtn, addBtn);

    editor.append(title, target, input, row);
    document.documentElement.appendChild(editor);

    // Position near the element, clamped to the viewport.
    const W = 340, H = editor.offsetHeight || 200;
    const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - W - 8);
    let top = anchorRect.bottom + 10;
    if (top + H > window.innerHeight - 8) top = Math.max(8, anchorRect.top - H - 10);
    editor.style.left = left + "px";
    editor.style.top = top + "px";
    input.focus();
  }

  // ---------- storage ----------

  // False after the extension was reloaded or updated while this page stayed open.
  function alive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  async function loadAll() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  }

  async function saveAll(list) {
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  }

  // ---------- boxes ----------

  // Boxes already shown on this page; only new ones get the pop-in animation.
  const shownIds = new Set();
  const popIds = new Set();
  let ready = false;

  // Draws the boxes that belong to the current page. Numbers follow the global
  // order, so they match the numbers in the prompt.
  async function render() {
    if (!alive()) return;
    ensureMounted();
    const all = await loadAll();
    const currentKey = pageKey();
    pageCount = all.length;
    boxLayer.textContent = "";
    all.forEach((a, i) => {
      if (a.pageKey !== currentKey) return;
      let x = a.docX, y = a.docY, w = a.width, h = a.height;
      if (a.selector) {
        try {
          const el = document.querySelector(a.selector);
          if (el) {
            const r = el.getBoundingClientRect();
            x = Math.round(r.left + window.scrollX);
            y = Math.round(r.top + window.scrollY);
            w = Math.round(r.width);
            h = Math.round(r.height);
          }
        } catch (e) { /* keep stored position */ }
      }
      const box = makeEl("div", "yb-box");
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = w + "px";
      box.style.height = h + "px";
      box.appendChild(makeEl("div", "yb-box-num", String(i + 1)));

      const key = a.id || "i" + i;
      if (!shownIds.has(key)) {
        shownIds.add(key);
        if (ready) {
          // Re-renders happen right after adding (storage change + direct call),
          // so keep the pop-in class for a short window to avoid losing it.
          popIds.add(key);
          setTimeout(() => popIds.delete(key), 800);
        }
      }
      if (popIds.has(key)) box.classList.add("yb-box-in");
      boxLayer.appendChild(box);
    });
    ready = true;
    updateBar();
  }

  async function copyPrompt() {
    const all = await loadAll();
    if (!all.length) { showToast("No points yet"); return; }
    const text = buildPrompt(all);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      ok = fallbackCopy(text);
    }
    showToast(ok ? "Prompt copied. Paste it into your AI agent." : "Copy failed");
  }

  async function deleteAll() {
    const all = await loadAll();
    if (!all.length) { showToast("No points yet"); return; }
    await saveAll([]);
    showToast("Deleted " + all.length + (all.length === 1 ? " point" : " points"));
  }

  // ---------- point mode ----------

  function setPoint(on) {
    state.point = on;
    document.documentElement.classList.toggle("yb-point", on);
    if (on) {
      ensureMounted();
      cursorEl.classList.add("yb-on");
      showToast("Point mode on. Click what you want to change. Esc to stop.", 2600);
    } else {
      hideOverlay();
      closeEditor();
      cursorEl.classList.remove("yb-on");
      showToast("Point mode off", 1600);
    }
    updateBar();
  }

  document.addEventListener("mouseover", (ev) => {
    if (!state.point || state.editing) return;
    const el = ev.target;
    if (!el || el.nodeType !== 1 || isOwnUI(el)) { hideOverlay(); return; }
    const rect = el.getBoundingClientRect();
    // Move with transform and resize; the CSS transition eases between elements.
    overlay.style.transform = "translate(" + rect.left + "px, " + rect.top + "px)";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.classList.add("yb-on");
    overlayLabel.textContent = labelFor(el);
  }, true);

  // Arrow follows the mouse only in Point mode. Over our own bar the normal
  // pointer is shown instead, so the arrow does not lag behind down there.
  let overUI = false;
  document.addEventListener("mousemove", (ev) => {
    if (!state.point) return;
    if (isOwnUI(ev.target)) {
      overUI = true;
      cursorEl.classList.remove("yb-on");
      return;
    }
    if (overUI) {
      // Coming back from the bar: start the arrow at the mouse, not where it was.
      overUI = false;
      cur.x = ev.clientX;
      cur.y = ev.clientY;
      cursorEl.classList.add("yb-on");
    }
    cur.tx = ev.clientX;
    cur.ty = ev.clientY;
    if (!cur.raf) cur.raf = requestAnimationFrame(tickCursor);
  }, { capture: true, passive: true });

  document.addEventListener("mousedown", (ev) => {
    if (state.point && !isOwnUI(ev.target)) {
      ev.preventDefault();
      ev.stopPropagation();
      cursorEl.classList.add("yb-press");
    }
  }, true);

  document.addEventListener("mouseup", () => {
    cursorEl.classList.remove("yb-press");
  }, true);

  document.addEventListener("click", (ev) => {
    if (!state.point || state.editing) return;
    const el = ev.target;
    if (!el || el.nodeType !== 1 || isOwnUI(el)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const rect = el.getBoundingClientRect();
    const info = captureInfo(el);
    hideOverlay();
    ripple(ev.clientX, ev.clientY);
    openEditor(info, labelFor(el), rect);
  }, true);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (state.editing) closeEditor();
      else if (state.point) setPoint(false);
    }
  }, true);

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 200);
  });

  // ---------- messages from the background (toolbar icon and shortcuts) ----------

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "YB_TOGGLE_POINT") setPoint(!state.point);
    else if (message.type === "YB_COPY_PROMPT") copyPrompt();
    else if (message.type === "YB_DELETE_ALL") deleteAll();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEY]) render();
    if (changes[BAR_KEY]) applyBarVisible(changes[BAR_KEY].newValue !== false);
    if (changes[BAR_POS_KEY]) {
      savedPos = changes[BAR_POS_KEY].newValue || null;
      applyBarPos(savedPos);
    }
  });

  // ---------- page changes inside the site (SPA navigation) ----------

  // Single-page sites change the URL without a page load, so re-draw the boxes
  // whenever the URL changes. Checking the URL is cheap, so a short interval is fine.
  let lastKey = pageKey();
  function checkLocation() {
    const k = pageKey();
    if (k === lastKey) return;
    lastKey = k;
    render();
    // The new page may still be drawing; draw again once it has settled.
    setTimeout(render, 800);
  }
  window.addEventListener("popstate", checkLocation);
  window.addEventListener("hashchange", checkLocation);
  const locationTimer = setInterval(() => {
    if (!alive()) { clearInterval(locationTimer); return; }
    checkLocation();
  }, 400);

  ensureMounted();
  render();
  chrome.storage.local.get([BAR_KEY, BAR_POS_KEY]).then((d) => {
    applyBarVisible(d[BAR_KEY] !== false);
    savedPos = d[BAR_POS_KEY] || null;
    applyBarPos(savedPos);
  });
})();
