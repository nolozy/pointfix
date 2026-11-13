// Pointfix - page probe
// Runs in the page's own JavaScript world (manifest "world": "MAIN"), because the
// framework debug data on DOM elements (React fibers, Vue instances, ...) is not
// visible from the isolated content script. The content script marks an element
// with data-yb-probe and fires "pointfix:probe"; this script answers synchronously
// by writing data-yb-source (JSON: framework, component, file, line, column).

(function () {
  "use strict";
  if (window.__pointfixProbe) return;
  window.__pointfixProbe = true;

  // Turn a URL or absolute path into a short project path, e.g. src/components/Post.tsx
  function cleanFile(file) {
    if (!file) return "";
    let f = String(file);
    try { if (/^https?:\/\//.test(f)) f = new URL(f).pathname; } catch (e) { /* keep */ }
    f = f.replace(/[?#].*$/, "")
      .replace(/^\/@fs\//, "/")
      .replace(/^webpack-internal:\/\/\/(\([^)]*\)\/)?/, "")
      .replace(/^webpack:\/\/\/?(_N_E\/)?/, "")
      .replace(/^file:\/\/\/?/, "")
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
    const i = f.search(/\/(src|app|pages|components|lib|routes)\//);
    if (i >= 0) f = f.slice(i + 1);
    return f;
  }

  // React 19 keeps no _debugSource; it keeps the stack of where the element was
  // created. The first frame outside React and node_modules is the JSX line.
  const SKIP = /node_modules|\/\.vite\/deps\/|react-dom|react\.development|react-jsx|jsx-dev-runtime|react-refresh|scheduler|chunk-[A-Z0-9]+\.js|\/_next\/static\/chunks\/(main|framework|webpack)/;
  function fromStack(stack) {
    if (!stack) return null;
    for (const line of String(stack).split("\n")) {
      const m = line.match(/((?:https?:\/\/|webpack-internal:|webpack:|file:|\/)[^\s()]+?):(\d+):(\d+)\)?\s*$/);
      if (!m || SKIP.test(m[1])) continue;
      // The line and column point into the transformed module, not the source file.
      // The content script fetches that module and reads the real JSX line from it.
      return { file: cleanFile(m[1]), url: m[1], line: +m[2], column: +m[3], fromStack: true };
    }
    return null;
  }

  function componentName(type) {
    if (!type || typeof type === "string") return "";
    if (type.displayName) return type.displayName;
    if (type.name) return type.name;
    if (type.render) return componentName(type.render);   // forwardRef
    if (type.type) return componentName(type.type);       // memo
    return "";
  }

  function reactInfo(el) {
    let key = null;
    for (const k in el) {
      if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) { key = k; break; }
    }
    if (!key) return null;
    const host = el[key];
    let source = null;
    // React 18 and older (dev): the JSX location of this very element.
    for (let f = host, n = 0; f && n < 4 && !source; f = f.return, n++) {
      const s = f._debugSource;
      if (s && s.fileName) source = { file: cleanFile(s.fileName), line: s.lineNumber, column: s.columnNumber };
    }
    // React 19 (dev): parse the creation stack.
    if (!source && host._debugStack) source = fromStack(host._debugStack.stack || host._debugStack);
    let component = "";
    for (let f = host.return, n = 0; f && n < 60; f = f.return, n++) {
      component = componentName(f.type);
      if (component) break;
    }
    if (!source && !component) return null;
    return { framework: "React", component, ...(source || {}) };
  }

  function vueInfo(el) {
    for (let n = el; n; n = n.parentElement) {
      const inst = n.__vueParentComponent;
      if (inst && inst.type) {
        const t = inst.type;
        const file = t.__file ? cleanFile(t.__file) : "";
        const component = t.name || t.__name || (file ? file.split("/").pop().replace(/\.vue$/, "") : "");
        return { framework: "Vue", component, file };
      }
      if (n.__vue__) {
        const o = n.__vue__.$options || {};
        return { framework: "Vue", component: o.name || "", file: o.__file ? cleanFile(o.__file) : "" };
      }
    }
    return null;
  }

  function svelteInfo(el) {
    for (let n = el; n; n = n.parentElement) {
      const loc = n.__svelte_meta && n.__svelte_meta.loc;
      if (loc && loc.file) {
        const file = cleanFile(loc.file);
        return { framework: "Svelte", component: file.split("/").pop().replace(/\.svelte$/, ""), file, line: loc.line, column: loc.column };
      }
    }
    return null;
  }

  function angularInfo(el) {
    const ng = window.ng;
    if (!ng || typeof ng.getOwningComponent !== "function") return null;
    const c = ng.getOwningComponent(el);
    return c && c.constructor ? { framework: "Angular", component: c.constructor.name } : null;
  }

  // Build tools that write the source into the markup (react-dev-inspector and similar).
  function attrInfo(el) {
    const n = el.closest("[data-inspector-relative-path]");
    if (!n) return null;
    return {
      framework: "",
      component: "",
      file: cleanFile(n.getAttribute("data-inspector-relative-path")),
      line: +n.getAttribute("data-inspector-line") || undefined,
      column: +n.getAttribute("data-inspector-column") || undefined
    };
  }

  document.addEventListener("pointfix:probe", () => {
    const el = document.querySelector("[data-yb-probe]");
    if (!el) return;
    let info = null;
    try {
      info = attrInfo(el) || reactInfo(el) || vueInfo(el) || svelteInfo(el) || angularInfo(el);
    } catch (e) {
      info = null;
    }
    el.setAttribute("data-yb-source", info ? JSON.stringify(info) : "");
  });
})();
