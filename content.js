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

  // One page = origin + path + query, plus the hash when it is a route (#/... or #!...).
  function pageKey() {
    const h = location.hash;
    const route = h.startsWith("#/") || h.startsWith("#!") ? h : "";
    return location.origin + location.pathname + location.search + route;
  }

  // Points belong to a site (origin). Count, numbers, copy and delete only use
  // the points of the site that is open, so other projects never leak in.
  function originOf(a) {
    try { return new URL(a.url).origin; } catch (e) { return ""; }
  }

  function siteItems(all) {
    return all.filter((a) => originOf(a) === location.origin);
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

  // Reads only the first few text nodes. innerText of a large element (or the
  // whole body) on every hover forces layout and is slow on long pages.
  function shortText(el) {
    let out = "";
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const p = n.parentElement;
      if (p && (p.closest("script,style,noscript,template") || isOwnUI(p))) continue;
      out += " " + n.nodeValue;
      if (out.length > 200) break;
    }
    out = out.replace(/\s+/g, " ").trim();
    return out.length > 60 ? out.slice(0, 60) + "..." : out;
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

  // Ids added at run time by other extensions or UI libraries change on every load
  // and mean nothing in the source code, so they are not used in selectors.
  function isStableId(id) {
    if (!id) return false;
    if (/^generated-id-/i.test(id)) return false;          // added by other browser extensions
    if (/^(radix-|headlessui-|react-aria|mui-|:r|«r)/.test(id)) return false;  // UI library / useId
    if (/\d{6,}/.test(id)) return false;                    // timestamps and counters
    return true;
  }

  function buildSelector(el) {
    if (isStableId(el.id) && unique("#" + CSS.escape(el.id))) return "#" + CSS.escape(el.id);
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
      if (isStableId(node.id)) { parts.unshift("#" + CSS.escape(node.id)); break; }
      let part = node.tagName.toLowerCase();
      const classes = Array.from(node.classList || []).filter(isStableClass).slice(0, 2);
      if (classes.length) part += "." + classes.map((c) => CSS.escape(c)).join(".");
      parts.unshift(part);
      if (unique(parts.join(" > "))) return parts.join(" > ");
      // Add a position only when the tag and classes are not enough on their own.
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((s) => s.tagName === node.tagName);
        // Only siblings that the tag + classes cannot tell apart need a position.
        let alike = sameTag.length;
        try { alike = parent.querySelectorAll(":scope > " + part).length; } catch (e) { /* keep */ }
        if (alike > 1) {
          parts[0] = part + ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
          if (unique(parts.join(" > "))) return parts.join(" > ");
        }
      }
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  // ---------- current styles ----------

  // "rgb(29, 155, 240)" -> "#1d9bf0"; keeps rgba() when it is see-through; "" when invisible.
  function cssColor(v) {
    const m = String(v).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
    if (!m) return v || "";
    let a = m[4] == null ? 1 : parseFloat(m[4]) / (String(m[4]).endsWith("%") ? 100 : 1);
    if (a === 0) return "";
    const hex = "#" + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, "0")).join("");
    return a < 1 ? "rgba(" + m[1] + ", " + m[2] + ", " + m[3] + ", " + Math.round(a * 100) / 100 + ")" : hex;
  }

  // Four sides -> the short CSS form ("10px 18px"), or "" when all are 0.
  function fourSides(t, r, b, l) {
    if ([t, r, b, l].every((v) => v === "0px")) return "";
    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return t + " " + r;
    return [t, r, b, l].join(" ");
  }

  // A short line of the values the AI needs to change "bigger", "rounder" and so on.
  function currentStyles(el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const out = [Math.round(r.width) + "×" + Math.round(r.height) + "px"];
    out.push("font " + cs.fontSize + " / " + cs.fontWeight);
    const color = cssColor(cs.color);
    if (color) out.push("color " + color);
    const bg = cssColor(cs.backgroundColor);
    if (bg) out.push("background " + bg);
    if (cs.backgroundImage && cs.backgroundImage !== "none") out.push("background-image " + (cs.backgroundImage.includes("gradient") ? "gradient" : "image"));
    const pad = fourSides(cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft);
    if (pad) out.push("padding " + pad);
    const mar = fourSides(cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft);
    if (mar) out.push("margin " + mar);
    if (cs.borderTopStyle !== "none" && cs.borderTopWidth !== "0px") {
      out.push("border " + cs.borderTopWidth + " " + cs.borderTopStyle + " " + (cssColor(cs.borderTopColor) || "transparent"));
    }
    const rad = fourSides(cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius);
    if (rad) out.push("radius " + rad);
    if (cs.display === "flex" || cs.display === "grid" || cs.display === "inline-flex" || cs.display === "inline-grid") {
      out.push(cs.display + (cs.gap && cs.gap !== "normal" && cs.gap !== "0px" ? " gap " + cs.gap : ""));
    }
    if (cs.opacity !== "1") out.push("opacity " + cs.opacity);
    return out.join("; ");
  }

  // Asks page-probe.js (page world) for the component and source location of an
  // element. The event is handled synchronously, so the answer is there right after.
  function probeSource(el) {
    try {
      el.setAttribute("data-yb-probe", "1");
      document.dispatchEvent(new CustomEvent("pointfix:probe"));
      const raw = el.getAttribute("data-yb-source");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    } finally {
      el.removeAttribute("data-yb-probe");
      el.removeAttribute("data-yb-source");
    }
  }

  function sourceText(p) {
    if (!p || !p.file) return "";
    if (p.fromStack) return p.file;   // the real line is filled in by resolveJsxLine
    return p.file + (p.line ? ":" + p.line : "") + (p.line && p.column ? ":" + p.column : "");
  }

  // React 19 only gives a stack position inside the transformed module. In dev
  // builds every jsxDEV(...) call still carries { fileName, lineNumber, columnNumber }
  // as an argument, so read the module and take the source object of that call.
  async function resolveJsxLine(url, line, column) {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split("\n");
    if (line > lines.length) return null;
    let offset = column - 1;
    for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
    const open = text.indexOf("(", offset);
    if (open < 0 || open - offset > 40) return null;
    // Find the matching ")" of this call, skipping strings.
    let depth = 0, i = open, quote = null;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === "\\") { i++; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
      if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) break;
    }
    // Children come first in the call, so the last source object is this element's.
    const all = [...text.slice(open, i).matchAll(/lineNumber:\s*(\d+),\s*columnNumber:\s*(\d+)/g)];
    if (!all.length) return null;
    const m = all[all.length - 1];
    return { line: +m[1], column: +m[2] };
  }

  // Source lines still being looked up, by point id.
  const pendingSource = new Map();

  async function updateStoredSource(id, source) {
    try {
      const list = await loadAll();
      const item = list.find((a) => a.id === id);
      if (item && item.source !== source) { item.source = source; await saveAll(list); }
    } catch (e) { /* the point may not be saved yet, or the page is stale */ }
  }

  function captureInfo(el) {
    const rect = el.getBoundingClientRect();
    const probe = probeSource(el);
    const id = "yb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    if (probe && probe.fromStack && probe.url) {
      pendingSource.set(id, resolveJsxLine(probe.url, probe.line, probe.column)
        .then((pos) => (pos ? probe.file + ":" + pos.line + ":" + pos.column : null))
        .catch(() => null));
    }
    return {
      id,
      framework: (probe && probe.framework) || "",
      component: (probe && probe.component) || "",
      source: sourceText(probe),
      current: currentStyles(el),
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
      if (a.kind === "area") {
        // An area drawn by dragging: where it is, what holds it and what is in it.
        lines.push("**Area**: " + a.width + "×" + a.height + "px at x " + a.docX + ", y " + a.docY + " on the page");
        lines.push("**Around**: `" + a.selector + "` (" + a.tagName + ")");
        if (a.source) lines.push("**Source**: `" + a.source + "`" + (a.component ? " (" + a.component + ")" : ""));
        else if (a.component) lines.push("**Component**: " + a.component);
        if (a.inside && a.inside.length) {
          lines.push("**Inside**: " + a.inside.map((x) => "`" + x.selector + "`" + (x.text ? ' "' + x.text + '"' : "")).join("; "));
        } else {
          lines.push("**Inside**: (empty space)");
        }
        lines.push("**Instruction**: " + a.instruction);
        lines.push("");
        return;
      }
      lines.push("**Target**: `" + a.selector + "`");
      // Where the element comes from in the code, when the dev build tells us.
      if (a.source) lines.push("**Source**: `" + a.source + "`" + (a.component ? " (" + a.component + ")" : ""));
      else if (a.component) lines.push("**Component**: " + a.component);
      lines.push("**TagName**: " + a.tagName);
      if (a.innerText) lines.push("**Inner Content**: " + a.innerText);
      // The values now, so "bigger" or "rounder" has something to start from.
      if (a.current) lines.push("**Current**: " + a.current);
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
    hoverEl = null;
    pickEl = null;
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
  const imageBtn = barButton("Copy image", "Alt+Shift+C");
  const deleteBtn = barButton("Delete all", "Alt+X");
  bar.append(countEl, pointBtn, copyBtn, imageBtn, deleteBtn);
  pointBtn.addEventListener("click", () => setPoint(!state.point));
  copyBtn.addEventListener("click", copyPrompt);
  imageBtn.addEventListener("click", copyImage);
  deleteBtn.addEventListener("click", deleteAll);

  function updateBar() {
    countEl.textContent = pageCount
      ? pageCount + (pageCount === 1 ? " point" : " points")
      : "No points";
    copyBtn.disabled = pageCount === 0;
    imageBtn.disabled = pageCount === 0;
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
  let editorTarget = null;   // the label line, so a late source line can be shown
  let editorInfoId = null;

  function closeEditor() {
    if (editor) { editor.remove(); editor = null; }
    editorTarget = null;
    editorInfoId = null;
    state.editing = false;
    document.documentElement.classList.remove("yb-editing");
    cursorEl.classList.toggle("yb-on", state.point);
  }

  const RELOAD_MSG = "Pointfix was updated. Please reload this page (F5).";

  // editId: when set, the editor changes or deletes that saved point instead of adding one.
  function openEditor(info, label, anchorRect, editId) {
    closeEditor();
    state.editing = true;
    document.documentElement.classList.add("yb-editing");
    cursorEl.classList.remove("yb-on");

    editor = makeEl("div", "yb-editor yb-editor-in");
    const title = makeEl("div", "yb-editor-title", editId ? "Edit this point" : "What should change?");
    const target = makeEl("div", "yb-editor-target", label);
    editorTarget = target;
    editorInfoId = info.id;
    const input = makeEl("textarea", "yb-editor-input");
    input.placeholder = "Describe the change";
    input.rows = 2;
    if (editId) input.value = info.instruction || "";

    const row = makeEl("div", "yb-editor-row");
    const spacer = makeEl("span", "yb-spacer");
    const cancelBtn = makeEl("button", "yb-btn yb-btn-ghost", "Cancel");
    cancelBtn.type = "button";
    cancelBtn.addEventListener("click", closeEditor);
    const addBtn = makeEl("button", "yb-btn yb-btn-primary", editId ? "Save" : "Add point");
    addBtn.type = "button";
    addBtn.addEventListener("click", async () => {
      const text = input.value.trim();
      if (!text) { showToast("Type what should change"); input.focus(); return; }
      try {
        const list = await loadAll();
        if (editId) {
          const item = list.find((a) => a.id === editId);
          if (item) item.instruction = text;
          await saveAll(list);
          closeEditor();
          showToast("Point updated");
        } else {
          info.instruction = text;
          list.push(info);
          await saveAll(list);
          closeEditor();
          showToast("Point " + siteItems(list).length + " added");
        }
      } catch (e) {
        showToast(RELOAD_MSG, 4000);
      }
    });

    if (editId) {
      const delBtn = makeEl("button", "yb-btn yb-btn-danger", "Delete");
      delBtn.type = "button";
      delBtn.addEventListener("click", async () => {
        try {
          const list = await loadAll();
          await saveAll(list.filter((a) => a.id !== editId));
          closeEditor();
          showToast("Point deleted");
        } catch (e) {
          showToast(RELOAD_MSG, 4000);
        }
      });
      row.append(delBtn);
    }
    row.append(spacer, cancelBtn, addBtn);

    // Ctrl+Enter (or Cmd+Enter) saves. Keys typed here are not passed on to the
    // page, so its own keyboard shortcuts do not fire while writing.
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); addBtn.click(); }
    });
    ["keydown", "keypress", "keyup"].forEach((t) => editor.addEventListener(t, (ev) => {
      if (ev.key !== "Escape") ev.stopPropagation();
    }));

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
    const site = siteItems(await loadAll());
    const currentKey = pageKey();
    pageCount = site.length;
    boxLayer.textContent = "";
    site.forEach((a, i) => {
      if (a.pageKey !== currentKey) return;
      let x = a.docX, y = a.docY, w = a.width, h = a.height;
      // An area stays where it was drawn; an element point follows its element.
      if (a.selector && a.kind !== "area") {
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
      const box = makeEl("div", a.kind === "area" ? "yb-box yb-box-area" : "yb-box");
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = w + "px";
      box.style.height = h + "px";
      // The number opens this point for editing or deleting.
      const num = makeEl("div", "yb-box-num", String(i + 1));
      num.title = "Edit or delete this point";
      num.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const label = "Point " + (i + 1) + (a.innerText ? ' · "' + a.innerText + '"' : "");
        openEditor({ ...a }, label, num.getBoundingClientRect(), a.id);
      });
      box.appendChild(num);
      // The instruction, shown next to the box only while a screenshot is taken.
      box.appendChild(makeEl("div", "yb-box-note", (i + 1) + ". " + a.instruction));

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
    const site = siteItems(await loadAll());
    if (!site.length) { showToast("No points on this site yet"); return; }
    const text = buildPrompt(site);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (e) {
      ok = fallbackCopy(text);
    }
    showToast(ok ? "Prompt copied. Paste it into your AI agent." : "Copy failed");
  }

  // Copies a PNG of the visible part of the page with the numbered boxes and
  // each instruction drawn next to its box. The bar, cursor and editor are
  // hidden while the picture is taken.
  async function copyImage() {
    let site;
    try { site = siteItems(await loadAll()); } catch (e) { showToast(RELOAD_MSG, 4000); return; }
    if (!site.length) { showToast("No points on this site yet"); return; }
    if (!window.isSecureContext || !navigator.clipboard || !window.ClipboardItem) {
      showToast("Images can be copied on https and localhost pages only", 3500);
      return;
    }
    const root = document.documentElement;
    root.classList.add("yb-capturing");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let res = null;
    try { res = await chrome.runtime.sendMessage({ type: "YB_CAPTURE" }); } catch (e) { res = null; }
    root.classList.remove("yb-capturing");
    if (!res || !res.dataUrl) { showToast("Could not take the screenshot", 3000); return; }
    try {
      const blob = await (await fetch(res.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      const shown = site.filter((a) => a.pageKey === pageKey()).length;
      showToast("Image copied (" + shown + (shown === 1 ? " point" : " points") + " on screen). Paste it into your AI agent.", 3000);
    } catch (e) {
      showToast("Copy failed. Click the page once and try again.", 3500);
    }
  }

  // Deletes the points of this site only; other sites keep theirs.
  async function deleteAll() {
    const all = await loadAll();
    const rest = all.filter((a) => originOf(a) !== location.origin);
    const removed = all.length - rest.length;
    if (!removed) { showToast("No points on this site yet"); return; }
    await saveAll(rest);
    showToast("Deleted " + removed + (removed === 1 ? " point" : " points"));
  }

  // ---------- point mode ----------

  function setPoint(on) {
    state.point = on;
    document.documentElement.classList.toggle("yb-point", on);
    if (on) {
      ensureMounted();
      cursorEl.classList.add("yb-on");
      showToast("Point mode on. Click an element or drag an area. ↑/↓ for parent/child, Esc to stop.", 3000);
    } else {
      hideOverlay();
      closeEditor();
      cursorEl.classList.remove("yb-on");
      showToast("Point mode off", 1600);
    }
    updateBar();
  }

  // The element under the mouse (hoverEl) and the element that will be picked
  // (pickEl). Arrow Up/Down move pickEl to the parent or back toward hoverEl.
  let hoverEl = null;
  let pickEl = null;

  function showPick(el) {
    const rect = el.getBoundingClientRect();
    // Move with transform and resize; the CSS transition eases between elements.
    overlay.style.transform = "translate(" + rect.left + "px, " + rect.top + "px)";
    overlay.style.width = rect.width + "px";
    overlay.style.height = rect.height + "px";
    overlay.classList.add("yb-on");
    overlayLabel.textContent = labelFor(el) + "   ↑↓";
  }

  document.addEventListener("mouseover", (ev) => {
    if (!state.point || state.editing || area.drawing) return;
    const el = ev.target;
    if (!el || el.nodeType !== 1 || isOwnUI(el)) { hideOverlay(); return; }
    hoverEl = el;
    pickEl = el;
    showPick(el);
  }, true);

  // ↑: the parent of the picked element. ↓: one step back toward the element
  // under the mouse (or the first child when already there).
  window.addEventListener("keydown", (ev) => {
    if (!state.point || state.editing || !pickEl) return;
    if (ev.key !== "ArrowUp" && ev.key !== "ArrowDown") return;
    ev.preventDefault();
    ev.stopPropagation();
    let next = null;
    if (ev.key === "ArrowUp") {
      const p = pickEl.parentElement;
      if (p && p !== document.documentElement) next = p;
    } else if (pickEl !== hoverEl && pickEl.contains(hoverEl)) {
      next = hoverEl;
      while (next.parentElement && next.parentElement !== pickEl) next = next.parentElement;
    } else {
      next = Array.from(pickEl.children).find((c) => !isOwnUI(c) && c.getBoundingClientRect().width > 0) || null;
    }
    if (!next) return;
    pickEl = next;
    showPick(next);
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

  // In Point mode the page must not react to the click at all: menus that open on
  // pointerdown, drags, double-clicks and so on. Listen on window in the capture
  // phase so this runs before the page's own handlers.
  function swallow(ev) {
    if (!state.point || isOwnUI(ev.target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.type === "pointerdown" || ev.type === "mousedown") cursorEl.classList.add("yb-press");
  }
  ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "auxclick"].forEach((t) =>
    window.addEventListener(t, swallow, true));

  window.addEventListener("pointerup", () => {
    cursorEl.classList.remove("yb-press");
  }, true);

  // ---------- area: drag to draw a rectangle ----------

  const area = { start: null, drawing: false, draft: null, skipClick: false };

  function areaRect(a, b) {
    return {
      left: Math.min(a.x, b.x), top: Math.min(a.y, b.y),
      right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y),
      get width() { return this.right - this.left; },
      get height() { return this.bottom - this.top; }
    };
  }

  function drawDraft(r) {
    if (!area.draft) {
      area.draft = makeEl("div", "yb-area-draft");
      area.draft.appendChild(makeEl("div", "yb-area-size"));
      document.documentElement.appendChild(area.draft);
    }
    area.draft.style.transform = "translate(" + r.left + "px, " + r.top + "px)";
    area.draft.style.width = r.width + "px";
    area.draft.style.height = r.height + "px";
    area.draft.firstChild.textContent = Math.round(r.width) + "×" + Math.round(r.height);
  }

  function removeDraft() {
    if (area.draft) { area.draft.remove(); area.draft = null; }
  }

  function covers(er, r, pad) {
    return er.left <= r.left + pad && er.top <= r.top + pad && er.right >= r.right - pad && er.bottom >= r.bottom - pad;
  }

  // The smallest element that holds the whole area.
  function containerFor(r) {
    let el = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    while (el && el !== document.body && el !== document.documentElement) {
      // Allow a few pixels of overshoot: hand-drawn areas rarely hit an edge exactly.
      if (!isOwnUI(el) && covers(el.getBoundingClientRect(), r, 10)) return el;
      el = el.parentElement;
    }
    return document.body;
  }

  // Top-level elements that are (almost) fully inside the area, at most six.
  function elementsInside(root, r) {
    const out = [];
    let visits = 0;
    (function visit(node) {
      for (const child of node.children) {
        if (out.length >= 6 || ++visits > 3000) return;
        if (isOwnUI(child)) continue;
        const er = child.getBoundingClientRect();
        if (er.width < 4 || er.height < 4) continue;
        const w = Math.min(er.right, r.right) - Math.max(er.left, r.left);
        const h = Math.min(er.bottom, r.bottom) - Math.max(er.top, r.top);
        if (w <= 0 || h <= 0) continue;
        if ((w * h) / (er.width * er.height) >= 0.9) out.push(child);
        else visit(child);
      }
    })(root);
    return out;
  }

  function finishArea(r) {
    const container = containerFor(r);
    const inside = elementsInside(container, r);
    const probe = probeSource(container);
    const id = "yb" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const info = {
      id,
      kind: "area",
      framework: (probe && probe.framework) || "",
      component: (probe && probe.component) || "",
      source: sourceText(probe),
      pageKey: pageKey(),
      url: location.href,
      selector: buildSelector(container),
      tagName: container.tagName,
      innerText: "",
      inside: inside.map((el) => {
        const t = shortText(el);
        return { selector: buildSelector(el), text: t.length > 30 ? t.slice(0, 30) + "..." : t };
      }),
      instruction: "",
      docX: Math.round(r.left + window.scrollX),
      docY: Math.round(r.top + window.scrollY),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
    const where = info.source || info.component;
    const label = "Area " + info.width + "×" + info.height + " · " +
      (inside.length ? inside.length + (inside.length === 1 ? " element" : " elements") + " inside" : "empty space") +
      (where ? "\n" + (info.component && info.source ? info.component + " · " : "") + where : "");
    openEditor(info, label, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }

  window.addEventListener("pointerdown", (ev) => {
    if (!state.point || state.editing || ev.button !== 0 || isOwnUI(ev.target)) return;
    area.start = { x: ev.clientX, y: ev.clientY };
  }, true);

  window.addEventListener("pointermove", (ev) => {
    if (!area.start || !(ev.buttons & 1)) return;
    const now = { x: ev.clientX, y: ev.clientY };
    if (!area.drawing && Math.hypot(now.x - area.start.x, now.y - area.start.y) < 8) return;
    if (!area.drawing) { area.drawing = true; hideOverlay(); }
    drawDraft(areaRect(area.start, now));
  }, true);

  window.addEventListener("pointerup", (ev) => {
    if (area.cancelled) {
      // Esc was pressed while dragging: the release must not pick an element either.
      area.cancelled = false;
      area.skipClick = true;
      setTimeout(() => { area.skipClick = false; }, 60);
      return;
    }
    if (!area.start) return;
    const start = area.start;
    area.start = null;
    if (!area.drawing) return;           // a plain click: handled by the click listener
    area.drawing = false;
    area.skipClick = true;               // the click that follows the drag is not a pick
    setTimeout(() => { area.skipClick = false; }, 60);   // no click came (released outside)
    const r = areaRect(start, { x: ev.clientX, y: ev.clientY });
    removeDraft();
    if (r.width >= 12 && r.height >= 12) finishArea(r);
  }, true);

  window.addEventListener("click", (ev) => {
    if (!state.point) return;
    const target = ev.target;
    if (!target || target.nodeType !== 1 || isOwnUI(target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (area.skipClick) { area.skipClick = false; return; }
    if (state.editing) return;
    // Use the element chosen with ↑/↓ when it is related to the clicked one.
    const el = pickEl && pickEl.isConnected && (pickEl.contains(target) || target.contains(pickEl)) ? pickEl : target;
    const rect = el.getBoundingClientRect();
    const info = captureInfo(el);
    hideOverlay();
    ripple(ev.clientX, ev.clientY);
    const base = labelFor(el);
    const withWhere = () => {
      const where = info.source || info.component;
      return base + (where ? "\n" + (info.component && info.source ? info.component + " · " : "") + where : "");
    };
    openEditor(info, withWhere(), rect);
    // React 19: the exact line arrives a moment later; show it and keep it.
    const pending = pendingSource.get(info.id);
    if (pending) {
      pending.then((src) => {
        pendingSource.delete(info.id);
        if (!src) return;
        info.source = src;
        if (editorTarget && editorInfoId === info.id) editorTarget.textContent = withWhere();
        updateStoredSource(info.id, src);
      });
    }
  }, true);

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      if (area.drawing || area.start) {
        // Cancel the area being drawn.
        area.cancelled = true;
        area.start = null;
        area.drawing = false;
        removeDraft();
      } else if (state.editing) closeEditor();
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
    else if (message.type === "YB_COPY_IMAGE") copyImage();
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
