// Pointfix - styles injected into the Shadow DOM so page CSS cannot break our UI.
globalThis.__ybUIStyles = `
:host {
  all: initial;
  font: 13px/1.4 -apple-system, "Segoe UI", sans-serif;
  color: #f9fafb;
  text-align: left;
  letter-spacing: normal;
  word-spacing: normal;
  text-transform: none;
  direction: ltr;
  -webkit-font-smoothing: antialiased;
  cursor: auto;
}

*, *::before, *::after {
  box-sizing: border-box;
}

button, textarea {
  font-family: inherit;
  margin: 0;
}

button {
  appearance: none;
  -webkit-appearance: none;
}

/* Hover frame: moves with transform and eases between elements. */
.yb-overlay {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483001;
  pointer-events: none;
  border: 2px solid #6366f1;
  background: rgba(99, 102, 241, 0.12);
  border-radius: 6px;
  box-sizing: border-box;
  opacity: 0;
  will-change: transform, width, height;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.15s ease-out;
}

.yb-overlay.yb-on { opacity: 1; }

.yb-overlay-label {
  position: absolute;
  left: -2px;
  top: -30px;
  max-width: 420px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #4f46e5;
  color: #fff;
  font: 12px/1.4 -apple-system, "Segoe UI", sans-serif;
  padding: 4px 8px;
  border-radius: 6px;
}

/* Arrow cursor: lags slightly behind the real mouse for a soft feel. */
.yb-cursor {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483002;
  pointer-events: none;
  opacity: 0;
  will-change: transform;
  transition: opacity 0.15s ease-out;
}

.yb-cursor.yb-on { opacity: 1; }

.yb-cursor svg {
  display: block;
  transform-origin: 4px 2px;
  transition: transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
}

.yb-cursor.yb-press svg { transform: scale(0.82); }

/* Click ring that expands from the click point. */
.yb-ripple {
  position: fixed;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid #6366f1;
  background: rgba(99, 102, 241, 0.18);
  pointer-events: none;
  z-index: 2147483002;
  transform: translate(-50%, -50%) scale(0.2);
  animation: yb-ring 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes yb-ring {
  from { transform: translate(-50%, -50%) scale(0.2); opacity: 0.95; }
  to   { transform: translate(-50%, -50%) scale(1.7); opacity: 0; }
}

/* Saved points: a dashed box around the element, with its number. */
.yb-boxes {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  z-index: 2147483000;
  pointer-events: none;
}

.yb-box {
  position: absolute;
  box-sizing: border-box;
  border: 2px dashed #6366f1;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.06);
  pointer-events: none;
}

.yb-box-num {
  position: absolute;
  left: -12px;
  top: -12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #f59e0b;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  color: #1f2937;
  font: bold 13px/20px -apple-system, "Segoe UI", sans-serif;
  text-align: center;
  /* The box ignores the mouse, but its number can be clicked to edit the point. */
  pointer-events: auto;
  cursor: pointer;
  transition: transform 0.12s ease-out;
}

.yb-box-num:hover { transform: scale(1.18); }

/* New boxes pop in with a small overshoot. */
.yb-box-in {
  animation: yb-pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes yb-pop {
  0%   { transform: scale(0.92); opacity: 0; }
  60%  { transform: scale(1.02); opacity: 1; }
  100% { transform: scale(1); }
}

/* Bottom-right bar: compact, neutral monochrome (shadcn/ui & web-pen-red style). */
.yb-bar {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483003;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: rgba(24, 24, 27, 0.94);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.2);
  font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #fafafa;
  pointer-events: auto;
  cursor: default;
  user-select: none;
}

.yb-bar-count {
  color: #a1a1aa;
  font-size: 11px;
  font-weight: 500;
  padding: 0 8px 0 4px;
  margin-right: 2px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  line-height: 18px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.yb-bar-hidden { display: none !important; }

/* Grip to drag the bar; it has no text. */
.yb-grip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 28px;
  padding: 0;
  color: #71717a;
  border-radius: 6px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  transition: color 0.14s ease-out, background 0.14s ease-out;
}

.yb-grip svg {
  width: 10px;
  height: 16px;
  display: block;
}

.yb-grip:hover {
  color: #d4d4d8;
  background: rgba(255, 255, 255, 0.08);
}

.yb-grip:active { cursor: grabbing; }

.yb-bar-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  color: #e4e4e7;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0 9px;
  height: 28px;
  min-height: 28px;
  font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.14s ease-out, color 0.14s ease-out, transform 0.1s ease-out;
}

.yb-bar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fafafa;
}
.yb-bar-btn:active:not(:disabled) { transform: scale(0.97); }
.yb-bar-btn:disabled { opacity: 0.35; cursor: default; }

.yb-bar-primary {
  background: #fafafa;
  border-color: transparent;
  color: #09090b;
  font-weight: 600;
  min-width: 78px;
  justify-content: center;
}

.yb-bar-primary:hover:not(:disabled) {
  background: #e4e4e7;
  color: #09090b;
}

/* While Point mode is on, the Stop button turns solid red. */
.yb-bar-on {
  background: #dc2626 !important;
  border-color: transparent !important;
  color: #fafafa !important;
}

.yb-bar-on:hover:not(:disabled) {
  background: #b91c1c !important;
}

.yb-kbd {
  font: 500 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #a1a1aa;
  background: rgba(255, 255, 255, 0.07);
  border: none;
  border-radius: 4px;
  padding: 2px 4px;
}

.yb-bar-primary .yb-kbd {
  color: rgba(9, 9, 11, 0.6);
  background: rgba(9, 9, 11, 0.08);
}

.yb-bar-on .yb-kbd {
  color: rgba(250, 250, 250, 0.85);
  background: rgba(0, 0, 0, 0.22);
}

.yb-editor {
  position: fixed;
  /* Above the bottom-right bar, so its buttons are never covered. */
  z-index: 2147483005;
  width: 340px;
  box-sizing: border-box;
  background: rgba(24, 24, 27, 0.96);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #fafafa;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42), 0 1px 2px rgba(0, 0, 0, 0.25);
  padding: 12px;
  font: 12.5px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  pointer-events: auto;
  cursor: default;
}

.yb-editor-in {
  animation: yb-editor-in 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes yb-editor-in {
  from { opacity: 0; transform: translateY(5px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}

.yb-editor-title {
  font-size: 13.5px;
  font-weight: 600;
  color: #fafafa;
  margin-bottom: 3px;
}

.yb-editor-target {
  color: #a1a1aa;
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  margin-bottom: 9px;
  word-break: break-all;
  white-space: pre-line;
}

.yb-editor-input {
  width: 100%;
  box-sizing: border-box;
  background: #09090b;
  color: #fafafa;
  border: 1px solid #27272a;
  border-radius: 7px;
  padding: 8px 10px;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  resize: vertical;
  margin-bottom: 10px;
  cursor: text;
  transition: border-color 0.14s ease-out;
}

.yb-editor-input::placeholder {
  color: #71717a;
}

.yb-editor-input:focus {
  outline: none;
  border-color: #52525b;
}

.yb-editor-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.yb-spacer { flex: 1; }

.yb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  padding: 0 11px;
  height: 28px;
  font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.14s ease-out, color 0.14s ease-out, border-color 0.14s ease-out, transform 0.1s ease-out;
}

.yb-btn:active { transform: scale(0.97); }

.yb-btn-ghost {
  background: transparent;
  color: #a1a1aa;
  border-color: #27272a;
}

.yb-btn-ghost:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fafafa;
}

.yb-btn-danger {
  background: transparent;
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.35);
}

.yb-btn-danger:hover {
  background: rgba(239, 68, 68, 0.14);
}

.yb-btn-primary {
  background: #fafafa;
  color: #09090b;
  font-weight: 600;
}

.yb-btn-primary:hover {
  background: #e4e4e7;
}

.yb-toast {
  position: fixed;
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  z-index: 2147483004;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(24, 24, 27, 0.96);
  color: #fafafa;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 7px 14px;
  font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  animation: yb-toast-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.yb-toast-interactive {
  pointer-events: auto;
}

.yb-toast-btn {
  background: #fafafa;
  color: #09090b;
  border: none;
  border-radius: 999px;
  padding: 3px 10px;
  font: 600 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.14s ease-out, transform 0.1s ease-out;
}

.yb-toast-btn:hover { background: #e4e4e7; }
.yb-toast-btn:active { transform: scale(0.96); }

@keyframes yb-toast-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}

/* Respect the OS setting for reduced motion. */
@media (prefers-reduced-motion: reduce) {
  .yb-overlay, .yb-cursor, .yb-cursor svg, .yb-ripple, .yb-box-in,
  .yb-editor-in, .yb-toast, .yb-bar-btn, .yb-btn {
    animation: none !important;
    transition: none !important;
  }
}

/* Area: the rectangle while dragging, and saved areas (pink, to tell them from element points). */
.yb-area-draft {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483001;
  pointer-events: none;
  box-sizing: border-box;
  border: 2px dashed #ec4899;
  background: rgba(236, 72, 153, 0.08);
  border-radius: 6px;
}

.yb-area-size {
  position: absolute;
  left: -2px;
  top: -28px;
  background: #db2777;
  color: #fff;
  font: 12px/1.4 -apple-system, "Segoe UI", sans-serif;
  padding: 3px 8px;
  border-radius: 6px;
  white-space: nowrap;
}

.yb-box-area {
  border-color: #ec4899;
  background: rgba(236, 72, 153, 0.06);
}

/* Screenshot: hide our controls, show each instruction next to its box. */
.yb-box-note {
  display: none;
  position: absolute;
  left: -2px;
  top: calc(100% + 6px);
  max-width: 320px;
  width: max-content;
  padding: 5px 9px;
  border-radius: 7px;
  background: #111827;
  border: 1px solid #f59e0b;
  color: #fff;
  font: 600 13px/1.4 -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  white-space: normal;
}

:host(.yb-capturing) .yb-box-note { display: block; }

:host(.yb-capturing) .yb-bar,
:host(.yb-capturing) .yb-toast,
:host(.yb-capturing) .yb-cursor,
:host(.yb-capturing) .yb-overlay,
:host(.yb-capturing) .yb-editor,
:host(.yb-capturing) .yb-ripple,
:host(.yb-capturing) .yb-area-draft {
  visibility: hidden !important;
}
`;
