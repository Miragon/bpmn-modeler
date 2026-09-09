---
name: bpmn-browser-testing
description: >
  Test and inspect the BPMN modeler in a real browser, including the embeddable
  package demo and IDE webview preview. Use when opening the modeler, creating or
  connecting elements, checking properties, View/Design/Implement modes, themes,
  diff rendering, clipboard, or multiple modeler instances. Guides browser tool
  discovery, selecting the right preview, SVG interactions, and verification limits.
---

# BPMN Browser Testing

Use the [architecture overview](../../../docs/vscode/contributing/architecture-overview.md)
for package and host boundaries. Browser behavior lives in `packages/bpmn-modeler`
and reusable libraries; `apps/bpmn-webview` adapts it to IDE messages.

## Choose the preview

Use **portless by default** for browser testing. Run commands from the repository
root with dependencies installed. Portless assigns an available application port
and gives each linked worktree a separate hostname. Open the URL printed by
portless, including its scheme, rather than Vite's internal localhost port.

| Target | Command | What it exercises |
|---|---|---|
| Embeddable package demo | `corepack yarn demo` | Public package surfaces, mode switching, native clipboard, in-page linting |
| IDE webview preview | `corepack yarn workspace @miragon/bpmn-modeler-webview dev` | Webview bootstrap, panel chrome, and protocol adapters against `MockHost` |

Both commands use the existing `portless.json` configuration. The demo builds
BPMN and DMN before serving static files; after source changes, run
`corepack yarn build:demo` and reload. The webview's `dev` runs Vite with live
updates through portless.

For parallel sessions, check `corepack yarn exec portless list` and reuse a
running app in the same worktree. Separate instances within one worktree need
distinct portless `--name` values. Keep handles for processes you start, stop
only those processes, and leave the shared proxy running. Avoid `--force`, which
takes over another process's route. If portless needs setup, inspect
`corepack yarn exec portless service status` and report the missing prerequisite.

The demo opens at `/bpmn/`. Its model picker includes C7 examples and an untagged
**Onboarding (Draft)** model. Additional pages on that server are:

| Path | Purpose |
|---|---|
| `/bpmn/viewer.html` | Read-only viewer and properties |
| `/bpmn/design.html` | Engine-neutral designer |
| `/bpmn/diff.html` | Two-pane comparison |
| `/bpmn/dual.html` | Independent C7/C8 instances, panels, and theme toggles |

The webview preview opens at `/`. Its development host in
`apps/bpmn-webview/src/host.ts` serves a C7 fixture by default. `?mode=neutral`
opens an untagged model; `?mode=diff-before` and `?mode=diff-after` each show one
read-only diff pane. These panes have no partner for synchronized navigation.
Fixture URLs belong to the webview preview; the demo has its own routing.

Use a plain `serve` script only when portless is unavailable or direct Vite was
explicitly requested; use its printed URL and avoid hard-coded ports. `watch`
rebuilds files for an IDE and does not start a browser preview server.

## Browser tools and readiness

Discover the current client's browser tools and inspect their schemas. Prefer
Playwright MCP; setup is documented in
[Development: Coding agents](../../../docs/vscode/contributing/development.md#coding-agents).
Tool prefixes vary between clients. Run snippets using `page` in the exposed
Playwright-code tool (`browser_run_code` or its version-specific equivalent).
`browser_evaluate` executes inside the page and has no Playwright `page` object.

If MCP tools are unavailable, state the limitation and use existing local browser
automation when available. Report source-only checks separately from browser
verification. If neither browser option is available, continue source inspection
and report browser verification as unverified.

Wait for visible diagram shapes and the panel to finish loading. On the main
editor pages, `#js-properties-panel[aria-busy="false"]` signals a settled mode.
Check the active mode before editing: **View** is read-only, **Design** exposes
engine-neutral properties, and **Implement** exposes engine-specific settings.
An untagged model cannot enter Implement. After switching modes, reacquire
locators because the surface may have been recreated.

## Interact with the editor

Use snapshots for HTML controls and screenshots for diagram geometry. Palette
and context-pad titles are useful locators, but inspect the current DOM: icon
controls and SVG shapes may be absent from accessibility snapshots. Labels and
properties depend on engine, mode, templates, and locale.

| Main editor selector | Area |
|---|---|
| `#js-canvas` | SVG diagram and palette |
| `#js-properties-panel` | Mode strip and panel host |
| `#js-mode-strip` | View / Design / Implement controls |
| `#js-properties-panel-mount` | Current surface's properties |
| `#js-panel-resizer` | Resize and collapse controls |

Other demo pages use different containers. Scope selectors to the intended pane
on diff/dual pages; avoid global `.first()` selectors that hide ambiguity.

Prefer click-then-click creation over HTML drag-and-drop: bpmn-js uses its own
SVG dragging lifecycle. Choose an empty placement point from a screenshot,
relative to the current canvas bounds rather than fixed viewport coordinates.
For example, when the lower middle of the canvas is empty:

```js
const canvas = page.locator('#js-canvas');
await canvas.locator('.djs-palette').getByTitle('Create task', { exact: true }).click();
const box = await canvas.boundingBox();
if (!box) throw new Error('Canvas is not visible');
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.8);
```

Select an existing shape with a scoped DOM locator when its BPMN ID is known:
`#js-canvas .djs-shape[data-element-id="ServiceTask_1"]`. Discover IDs from the
fixture or rendered DOM; otherwise use screenshot coordinates. Coordinates and
IDs from one example are not portable to another.

To change type, select the shape, click **Change element**, inspect the popup,
and choose the requested type. To connect elements, select the source, click
**Connect to other element**, then click the target. Confirm the resulting shape
or connection visually and inspect its properties. Do not assume C8's **Task
definition / Job type** fields exist in the default C7 preview.

## Verify behavior and diagnose failures

- Exercise the requested behavior through UI controls, checking the result after
  each meaningful action. For property edits, verify the displayed value and any
  affected label; wait for debounced updates before inspecting outbound sync.
- Test themes with the demo's theme picker, and instance isolation with the dual
  page's per-pane buttons. Check `data-bpmn-theme` on the actual canvas/panel.
  The webview shell's `?theme=dark` adds a body class, but MockHost currently sends
  `colorTheme: "light"`, which can override it. Use an explicit mock settings
  message when testing that adapter and verify the effective theme.
- Record console errors and failed requests. A blank webview with an unresolved
  `@bpmn-io/properties-panel/preact/jsx-dev-runtime` import is a Vite resolution
  failure; compare the demo's alias in `apps/demo-webapp/vite.config.mts`. The
  working demo can verify package behavior while that preview is blocked.
  Missing theme-link errors are not an expected baseline for current theming.
- Browser previews use native clipboard behavior. MockHost logs document sync
  and several capability commands; it does not save files or perform IDE
  navigation. Save flushing, external edits, host clipboard, and editor lifecycle
  need host integration checks; consult
  [custom editors](../vscode-custom-editors/SKILL.md),
  [webviews](../vscode-webviews/SKILL.md), or
  [IntelliJ](../intellij-plugin/SKILL.md).

Do not assume a public modeler object on `window`. The webview's development-only
translation recorder exposes `window.__injector` and `window.__harvested` and
substitutes English translation templates. These are diagnostic hooks, absent
from the package demo and production entry, and do not prove UI behavior. For
translation harvesting, follow [i18n](../i18n-translate/SKILL.md).

Report the preview URL, fixture/engine, mode, actions, observed results, and any
unverified host behavior. Keep screenshots in the ignored `.context/` directory
when available. For deeper debugging, start at `apps/bpmn-webview/src/main.ts`,
`src/bootstrap.ts`, and `src/host.ts` within that app, or
`apps/demo-webapp/bpmn/main.ts` for package composition; consult
[bpmn-js](../bpmn-js/SKILL.md) for interaction internals.
