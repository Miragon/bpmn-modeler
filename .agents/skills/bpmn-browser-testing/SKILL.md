---
name: bpmn-browser-testing
description: Tests and inspects the BPMN modeler in a real browser through the webview previews and the Vitest browser specs. Use when verifying modeler interactions, modes, themes, diff, clipboard or linting.
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
| BPMN webview preview | `corepack yarn dev:bpmn-webview` | Webview bootstrap, mode strip, panel chrome, and protocol adapters against `MockHost` |
| DMN webview preview | `corepack yarn dev:dmn-webview` | DMN bootstrap and dmn-js views against a sample decision |
| Form / deployment previews | `corepack yarn dev:form-webview`, `corepack yarn dev:deployment-webview` | Form editor/preview and the deployment sidebar against their mock hosts |
| BPMN package browser specs | `corepack yarn workspace @miragon/bpmn-modeler test:browser` | Public package surfaces in headless Chromium, without a host |

Each `dev` script runs Vite with live updates through the workspace's own
`portless.json`. Every preview runs a development build whose `getHostApi()`
returns a `MockHost`; production bundles never contain it.

For parallel sessions, check
`corepack yarn workspace @miragon/bpmn-modeler-webview exec portless list` and
reuse a running app in the same worktree. Separate instances within one worktree
need distinct portless `--name` values. Keep handles for processes you start,
stop only those processes, and leave the shared proxy running. Avoid `--force`,
which takes over another process's route. If portless needs setup, inspect
`portless service status` through the same workspace `exec` and report the
missing prerequisite.

The BPMN preview opens at `/`. Its development host in
`apps/bpmn-webview/src/host.ts` serves a C7 fixture with the C7 and C8 sample
element templates. `?mode=neutral` opens an untagged model in Design with
Implement greyed out; `?mode=diff-before` and `?mode=diff-after` each show one
read-only diff pane with real `bpmn-js-differ` highlights. These panes have no
partner for synchronized navigation. Workspace definition search answers from
`__fixtures__/mock-workspace-definitions.ts`. The DMN preview serves one sample
decision from `apps/dmn-webview/src/host.ts`.

### Not available in a browser preview

- A C8 model: MockHost serves only the C7 and untagged fixtures, so C8
  Implement properties need a host or a browser spec.
- Lint findings: MockHost answers the lint-config request with no config, so no
  bpmnlint overlays or results appear.
- Two-pane diff, synchronized diff navigation, and several modelers on one page:
  each preview hosts a single instance.
- The public viewer and designer factories outside the webview bootstrap.

Cover these with the package browser specs in `packages/bpmn-modeler/src/**/*.browser.spec.ts`
(lifecycle, designer contract, viewer round trip, `DiffViewer`, clipboard
bridge, bpmnlint) or with a host integration check. The specs need Playwright's
Chromium installed.

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
| `#js-mode-strip .mode-chip` | Current mode, right of the Token Simulation toggle; opens the mode menu |
| `.mode-menu-item[data-mode]` | View / Design / Implement entries |
| `#js-properties-panel` | Panel host; carries `data-surface-mode` / `aria-busy` |
| `#js-properties-panel-mount` | Current surface's properties |
| `#js-panel-resizer` | Resize and collapse controls |

In a diff pane the palette, panel, and resizer are hidden. Avoid global
`.first()` selectors that hide ambiguity.

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
- Check `data-bpmn-theme` on the actual canvas/panel. The BPMN shell's
  `?theme=dark` adds a body class, but MockHost sends `colorTheme: "light"`,
  which overrides it. To test dark mode, post a settings message after load and
  verify the effective theme:
  `window.postMessage({ type: "BpmnModelerSettingQuery", setting: { alignToOrigin: false, showTransactionBoundaries: true, colorTheme: "dark" } }, "*")`.
  The DMN preview's MockHost sends `automatic`, so `?theme=dark` applies there.
- Record console errors and failed requests. A blank preview with an unresolved
  `@bpmn-io/properties-panel/preact/jsx-dev-runtime` import means the
  `jsx-dev-runtime` → `jsx-runtime` alias is missing from that app's Vite config.
  Missing theme-link errors are not an expected baseline for current theming.
  Rejected-template warnings for the C8 samples on the C7 fixture are expected.
- Browser previews use native clipboard behavior. MockHost logs document sync
  and several capability commands; it does not save files or perform IDE
  navigation. It throws `Unknown message type` for any command without a case, so
  a new webview command needs a log-only case there. Save flushing, external
  edits, host clipboard, and editor lifecycle
  need host integration checks; consult
  [custom editors](../vscode-custom-editors/SKILL.md),
  [webviews](../vscode-webviews/SKILL.md), or
  [IntelliJ](../intellij-plugin/SKILL.md).

Do not assume a public modeler object on `window`. The webview's development-only
translation recorder exposes `window.__injector` and `window.__harvested` and
substitutes English translation templates. These are diagnostic hooks, absent
from the production entry, and do not prove UI behavior. For
translation harvesting, follow [i18n](../i18n-translate/SKILL.md).

Report the preview URL, fixture/engine, mode, actions, observed results, and any
unverified host behavior. Keep screenshots in the ignored `.context/` directory
when available. For deeper debugging, start at `apps/bpmn-webview/src/main.ts`,
`src/bootstrap.ts`, and `src/host.ts` within that app, or
`packages/bpmn-modeler/src/index.ts` for package composition; consult
[bpmn-js](../bpmn-js/SKILL.md) for interaction internals.
