// Pointfix - shared prompt builder
// Used by the side panel, the popup, and the content script (Alt+C copy).
// Exposed as a plain global so it works in every extension context.

function ybBuildPrompt(annotations, overallNote) {
  const list = Array.isArray(annotations) ? annotations : [];
  if (list.length === 0) return "";

  const first = list[0];
  const lines = [];
  lines.push("このページのUIを修正してください。");
  lines.push("");
  lines.push("ページ: " + (first.pageTitle || "(タイトルなし)"));
  lines.push("URL: " + (first.url || ""));
  lines.push("");
  lines.push("## 修正してほしいところ");
  lines.push("");

  list.forEach((a, i) => {
    lines.push("### " + (i + 1) + ". " + (a.description || "要素"));
    lines.push("- やってほしいこと: " + (a.instruction || "(指示が書かれていません)"));
    if (a.selector) lines.push("- 対象の目印（CSSセレクタ）: `" + a.selector + "`");
    if (a.text) lines.push("- 要素のテキスト: 「" + a.text + "」");
    if (a.html) {
      lines.push("- 要素のHTML:");
      lines.push("```html");
      lines.push(a.html);
      lines.push("```");
    }
    lines.push("");
  });

  if (overallNote && overallNote.trim()) {
    lines.push("## 全体の要望");
    lines.push(overallNote.trim());
    lines.push("");
  }

  lines.push("## お願い");
  lines.push("- 指定した要素以外は、なるべく変えないでください。");
  lines.push("- 修正したら、どこをどう変えたか教えてください。");
  return lines.join("\n");
}

// Group key helper: annotations belong to the page they were captured on.
function ybSamePage(a, url) {
  return a && a.url === url;
}
