# Overlay tooling — harvest & prune

The overlay is generated against **runtime truth**, not a static dictionary
diff. A local override earns its place only when the running modeler actually
asks to translate that exact string and the shared library has no entry for it.
Everything else is dead by definition — most often a legacy spelling that modern
bpmn-js / the properties panel has since renamed (`Business Key` → the shared
library's `Business key`), which the editor never requests anymore.

## Files

- **`harvested.json`** — every template the running Camunda-7 modeler passed to
  `translate()`, captured with `harvest-drain.js`. The authoritative needed-key
  set.
- **`harvest-drain.js`** — the browser-side driver that exercises the editor
  (palette, context pad, replace/append/create menus, linting) and walks the
  properties panel across a broad set of C7 elements and implementation configs.
- **`build-overlay.mjs`** — prunes the overlay against `harvested.json` + the
  shared library. Keeps a key only when the shared library lacks it (exact or
  normalized) **and** the harvest recorded it — plus the `SOURCE_ONLY` allowlist
  for strings the harvest driver structurally can't reach. Everything else drops:
  keys the shared library covers (upstreamed C7 + legacy twins), unwired dmn-js
  labels, import diagnostics, and diagram/test junk.

## Refreshing the overlay

```bash
# 1. Run the dev webview (its dev entry wires the harvest recorder).
corepack yarn workspace @miragon/bpmn-modeler-webview serve

# 2. In the page console (or via Playwright browser_evaluate), load and run the
#    driver, then copy the harvested set into harvested.json:
#      (paste harvest-drain.js) ; await window.__harvestDrain()
#      JSON.stringify([...window.__harvested].sort())
#    Save it under the { note, count, keys } wrapper in harvested.json.

# 3. Prune (dry run, then write):
bun libs/bpmn-i18n-extras/tools/build-overlay.mjs
bun libs/bpmn-i18n-extras/tools/build-overlay.mjs --write

# 4. Re-verify.
corepack yarn vitest run --project bpmn-i18n-extras
corepack yarn format --loglevel warn
```

The recorder seam lives in `apps/bpmn-webview/src/app/harvestRecorder.ts`, wired
only under `import.meta.env.DEV` in `apps/bpmn-webview/src/main.ts` (tree-shaken
out of production builds).

## How far the overlay has shrunk

The Camunda-7 strings the overlay used to carry are now a first-class overlay in
the shared library, so `build-overlay` drops all of them on the exact/normalized
shared collision. What remains is the floor: modeler-internal strings the shared
library carries in _no_ form and the webview genuinely emits — currently just the
script-lock badge labels (`Read-only`, `Being edited in`), listed in
`SOURCE_ONLY` because the harvest driver doesn't exercise the script-lock
feature. The reducers from here:

- **Cover the residual strings upstream.** If the shared library grows the
  script-lock badge labels (or the modeler stops emitting them), the
  `overlayScope` / `overlayNeeded` guards flag them and they are deleted here —
  the overlay reaches empty.

Every other string the harvest records is already covered by the shared library:
`overlayNeeded` (see below) recomputes the harvest-vs-shared gap on every test
run, and it is currently zero, so the two script-lock labels are all that
remains.
