# Pointfix

**Point at any part of a web page and copy a prompt that your AI agent can act on.**

Describing a small UI change in words is hard. "The blue button at the top, make it a bit bigger..." Pointfix lets you click the exact part, type what should change, and copy a short prompt with the CSS selector and the instruction. Paste it into Claude, ChatGPT, Cursor, or any AI agent.

## How to use

1. **Start Point mode** — press `Alt+S`, or click **Start** on the bar at the bottom right.
2. **Click the part you want to change** — type what should change and press **Add point**. A dashed box with a number stays on the page.
3. **Copy the prompt** — press `Alt+C` (or the **Copy prompt** button), then paste it into your AI agent.

Press `Alt+S` again or `Esc` to stop Point mode.

## Example prompt

```markdown
Please update the web pages below as described. Change only the annotated elements.

# Annotations

## Annotation 1
**URL**: https://example.com/
**Target**: `button#cta`
**TagName**: BUTTON
**Inner Content**: Sign up
**Instruction**: make it bigger and blue

## Annotation 2
**URL**: https://example.com/pricing
**Target**: `#plan-pro`
**TagName**: DIV
**Inner Content**: Pro plan
**Instruction**: move this above the free plan

After the changes, briefly tell me what you changed.
```

## Shortcuts

| Action | Key |
|---|---|
| Start / stop Point mode | `Alt+S` |
| Copy the prompt | `Alt+C` |
| Delete all points | `Alt+X` |
| Stop Point mode | `Esc` |

The bottom-right bar on each page has the same three actions as buttons. You can change shortcuts at `chrome://extensions/shortcuts`.

Click the **Pointfix icon** in the toolbar to show or hide the bar on every page. When the bar is hidden, use the shortcuts.

## Features

- **Hover to highlight, click to point** — a short label shows what you are pointing at.
- **Dashed boxes with numbers** — points show on the page they were made on, and the numbers match the prompt.
- **Several pages in one prompt** — points from different pages (including pages in a single-page site) are copied together, each with its own URL.
- **Points stay put** — going to another page hides its points; coming back shows them again.
- **One-click delete** — remove all points at once.
- **Short prompt** — the URL, a CSS selector, the tag name, the text, and your instruction. Nothing else.
- **Smooth motion** — an arrow cursor that follows the mouse, and a soft hover frame and click ripple. See [Motion](#motion).
- **Runs locally** — nothing is sent to any server.

## Motion

The motion uses only CSS `transform` and `opacity`, with no animation library, to keep the page light.

- **Arrow cursor** — follows the mouse with a slight delay while Point mode is on.
- **Hover frame** — slides and resizes to the element you point at.
- **Click ripple** — a ring expands from the click point.
- **Box pop-in** — a new dashed box appears with a small bounce.
- **Editor and toast** — fade in when they appear.

When the OS setting "Reduce motion" is on (`prefers-reduced-motion`), all of these motions are turned off.

## Install (developer mode)

Pointfix is not on the Chrome Web Store. Load the folder instead.

1. Download this repository (or `git clone` it).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose this folder.

## Privacy

Pointfix runs entirely in your browser. It does not send page content or your instructions anywhere. Points are stored in the browser's local storage only.

## Background

The idea was inspired by UISelector2AI, which turns a selected element into a prompt for AI. Pointfix is a separate implementation written from scratch.

## License

MIT License
