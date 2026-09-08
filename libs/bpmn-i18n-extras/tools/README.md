# Overlay tooling — harvest & prune

The overlay is generated against **runtime truth**, not a static dictionary
diff. A local override earns its place only when the running modeler actually
asks to translate that exact string and the shared library has no entry for it.
Everything else is dead by definition — most often a legacy spelling that modern
bpmn-js / the properties panel has since renamed (`Business Key` → the shared
library's `Business key`), which the editor never requests anymore.

## Files

- **`harvested.json`** — every template the running Camunda-7 modeler passed to
  `translate()`, captured with `harvest-drain.js`. Half the authoritative
  needed-key set.
- **`harvested-dmn.json`** — every template the running dmn-js views passed to
  `translate()`, captured with `harvest-drain-dmn.js`. The other half.
- **`harvest-drain.js`** — the browser-side BPMN driver that exercises the editor
  (palette, context pad, replace/append/create menus, linting) and walks the
  properties panel across a broad set of C7 elements and implementation configs.
- **`harvest-drain-dmn.js`** — the browser-side DMN driver that walks every
  dmn-js view (DRD, decision table, literal/boxed expression), exercising the
  palette, context pad, replace/create menus, the decision-table context menu and
  hit-policy control, and expanding the properties panel.
- **`build-overlay.mjs`** — prunes the overlay against the **union** of both
  harvests + the shared library. Keeps a key only when the shared library lacks
  it (exact or normalized) **and** a harvest recorded it — plus the `SOURCE_ONLY`
  allowlist for strings the harvest drivers structurally can't reach. Everything
  else drops: keys the shared library covers (upstreamed C7 + legacy twins),
  import diagnostics, and diagram/test junk.

## Refreshing the overlay

```bash
# 1a. BPMN: run the dev webview (its dev entry wires the harvest recorder).
corepack yarn workspace @miragon/bpmn-modeler-webview serve

# 2a. In the page console (or via Playwright browser_evaluate), load and run the
#     driver, then copy the harvested set into harvested.json:
#       (paste harvest-drain.js) ; await window.__harvestDrain()
#       JSON.stringify([...window.__harvested].sort())
#     Save it under the { note, count, keys } wrapper in harvested.json.

# 1b. DMN: run the DMN dev webview, open a .dmn with a decision table.
corepack yarn workspace @miragon/dmn-modeler-webview serve

# 2b. Same, with the DMN driver → harvested-dmn.json:
#       (paste harvest-drain-dmn.js) ; await window.__harvestDrainDmn()
#       JSON.stringify([...window.__harvested].sort())

# 3. Prune (dry run, then write):
bun libs/bpmn-i18n-extras/tools/build-overlay.mjs
bun libs/bpmn-i18n-extras/tools/build-overlay.mjs --write

# 4. Re-verify.
corepack yarn vitest run --project bpmn-i18n-extras
corepack yarn format --loglevel warn
```

The recorder seam lives in `libs/shared/src/lib/harvestRecorder.ts` (shared by
both webviews), wired only under `import.meta.env.DEV` in each webview's
`src/main.ts` — one recorder for BPMN, one per view for DMN, all appending to the
same `window.__harvested` set (tree-shaken out of production builds).

## How far the overlay has shrunk

The Camunda-7 strings the overlay used to carry are now a first-class overlay in
the shared library, so `build-overlay` drops all of them on the exact/normalized
shared collision. What remains is the floor: modeler-internal strings the shared
library carries in _no_ form and the webview genuinely emits — the script-lock
badge / mode-strip labels the driver can't reach (in `SOURCE_ONLY`), plus the two
dmn-js numeric type names (`integer`, `double`) the shared `dmn-js.js` dictionary
never shipped (its siblings `string` / `boolean` / `long` / `date` are covered).
The reducers from here:

- **Cover the residual strings upstream.** If the shared library grows the
  script-lock labels or the `integer` / `double` type names (or the modeler stops
  emitting them), the `overlayScope` / `overlayNeeded` guards flag them and they
  are deleted here — the overlay reaches empty.

Every other string the harvest records is already covered by the shared library:
`overlayNeeded` (see below) recomputes the harvest-vs-shared gap on every test
run, and it is currently zero.
