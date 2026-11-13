# Overlay tooling: harvest and prune

A key earns its place in the overlay only when the running modeler passes that exact string to
`translate()` and the shared library has no entry for it. These tools record what the modeler asks for
and prune the overlay against it.

## Files

| File | What it is |
| --- | --- |
| `harvest-drain.js` | Browser driver for the BPMN editor: palette, context pad, menus, linting and the properties panel across many Camunda 7 elements. |
| `harvest-drain-dmn.js` | Browser driver for every dmn-js view: DRD, decision table, literal and boxed expressions. |
| `harvest-drain-template-editor.js` | Browser driver for the element template editor page; its header lists the page states to run it on. |
| `harvested.json`, `harvested-dmn.json`, `harvested-template-editor.json` | The recorded keys of each driver. |
| `build-overlay.mjs` | Prunes every registered overlay dictionary against the union of the harvests and the shared library. Keeps a key only when the shared library lacks it and a harvest recorded it, plus the `SOURCE_ONLY` allowlist for strings no driver can reach. |

The builder and the guard specs share one copy of each rule in `src/`: the key normalization in
`normalizeKey.ts`, the list of harvest files and their union in `harvestedKeys.ts`, and `SOURCE_ONLY` in
`sourceOnlyKeys.ts`. A new harvest file goes into `harvestedKeys.ts`.

The recorder is `libs/shared/src/lib/harvestRecorder.ts`. The webview entries (`apps/bpmn-webview/src/main.ts`,
`templateEditorMain.ts`, `apps/dmn-webview/src/main.ts`) wire it only under `import.meta.env.DEV`, so
production builds leave it out.

## Refresh the overlay

1. Start the dev webview: `corepack yarn workspace @miragon/bpmn-modeler-webview serve` for BPMN and the
   template editor (`/template-editor.html`), `corepack yarn workspace @miragon/dmn-modeler-webview serve`
   for DMN with a `.dmn` that has a decision table.
2. In the page console (or with Playwright's `browser_evaluate`), paste the driver and run it:
   `await window.__harvestDrain()`, `__harvestDrainDmn()` or `__harvestDrainTemplateEditor()`.
3. Copy `JSON.stringify([...window.__harvested].sort())` into the matching `harvested*.json`, under its
   `{ note, count, keys }` wrapper. For the template editor, merge the sets of every page state.
4. Prune, first as a dry run:

   ```bash
   bun libs/bpmn-i18n-extras/tools/build-overlay.mjs
   bun libs/bpmn-i18n-extras/tools/build-overlay.mjs --write
   ```

5. Verify and format the rewritten `src/languages/*.ts`:

   ```bash
   corepack yarn vitest run --project bpmn-i18n-extras
   corepack yarn format --loglevel warn
   ```

What is left are the `SOURCE_ONLY` strings and the harvested strings the shared library lacks, most of
them from the element template editor. Once the shared library covers a key, `overlayScope.spec.ts` flags
it; the end state is an empty overlay.
