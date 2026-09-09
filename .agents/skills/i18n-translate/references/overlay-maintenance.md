# Overlay maintenance — harvesting & pruning the key set

The local overlay (`libs/bpmn-i18n-extras/`) is generated against **runtime truth**, not a static
dictionary diff. Read this when you need to *add or remove overlay keys* — translating existing values is
covered by the main SKILL.md and needs none of this.

## Why the key set is not hand-authored

A string earns a place in the overlay only when the running modeler actually asks to `translate()` it
**and** the shared `@miragon/bpmn-modeler-i18n` library has no entry for it (exact or normalized casing).
Everything else is dead by definition — most often a legacy spelling modern bpmn-js / the properties panel
has since renamed (e.g. `Business Key` → the shared library's `Business key`), which the editor never
requests anymore. Hand-adding keys reintroduces exactly this rot, which is why the files are `GENERATED`
and guarded.

## Files

- `libs/bpmn-i18n-extras/tools/harvested.json` — every template the running Camunda-7 modeler passed to
  `translate()`, captured with the harvest driver. The authoritative needed-key set.
- `libs/bpmn-i18n-extras/tools/harvest-drain.js` — the browser-side driver that exercises the editor
  (palette, context pad, replace/append/create menus, linting) and walks the properties panel across a
  broad set of C7 elements and implementation configs.
- `libs/bpmn-i18n-extras/tools/build-overlay.mjs` — prunes the overlay against `harvested.json` + the
  shared library. Keeps a key only when the shared library lacks it **and** the harvest recorded it, plus a
  small `SOURCE_ONLY` allowlist for strings the harvest driver structurally can't reach (script-lock).
- `libs/bpmn-i18n-extras/tools/README.md` — the authoritative, up-to-date version of this workflow. Prefer
  it if it disagrees with this file.

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

The recorder seam lives in `apps/bpmn-webview/src/app/harvestRecorder.ts`, wired only under
`import.meta.env.DEV` in `apps/bpmn-webview/src/main.ts` (tree-shaken out of production builds).

## The `SOURCE_ONLY` allowlist

Some strings the webview genuinely emits come from a feature the harvest driver does not exercise (today
the script-lock badges: `Read-only`, `Being edited in`, `Element actions`). These cannot appear in
`harvested.json`, so `overlayNeeded` would wrongly flag them as dead. They are allowlisted in `SOURCE_ONLY`
— kept in sync between `tools/build-overlay.mjs` and `src/overlayNeeded.spec.ts`. If you add a genuinely
needed modeler-internal string the harvest can't reach, add it to *both* `SOURCE_ONLY` sets.

## The overlay is temporary debt

As the shared library grows, residual overlay keys become redundant. `overlayScope.spec.ts` enforces the
cleanup: the moment the shared library ships a key the overlay still defines, the test fails and names the
keys to delete from `src/languages/*`. The end state is an empty overlay. Do not fight this — cover strings
upstream in the shared library when you can, and let the guards retire the local copies.
