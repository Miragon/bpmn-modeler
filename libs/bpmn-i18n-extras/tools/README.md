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
| `harvested-merge.json` | The keys of the merge view's texts, recorded by `apps/bpmn-webview/src/domain/mergeTextsTranslated.spec.ts`, which asks each merge text once. No browser driver opens a merge pane. |
| `harvested-diff.json`, `harvested-dmn-diff.json` | The keys of the BPMN and DMN diff panes' texts, recorded by `apps/bpmn-webview/src/domain/diffTextsHarvest.spec.ts` and `apps/dmn-webview/src/domain/diffTextsHarvest.spec.ts`: the shared diff views' `DIFF_VIEW_KEYS` from `@miragon/bpmn-modeler-types` plus the pane's own constants. No browser driver opens a diff pane. |
| `harvested-modeler-features.json` | The keys of the modeler package's features no browser driver reaches, recorded by `packages/bpmn-modeler/src/featureTextsHarvest.spec.ts`: the mode strip (mounted with a recording translator), the popup-menu annotations of the Design, C7 and C8 surfaces, and the `*_KEYS` constants of the element template chooser, the append menu, the ID-from-name links, the definition search and the model navigation context pad. |
| `harvested-form-preview.json` | The keys of the linked form preview, recorded by `apps/bpmn-webview/src/domain/formPreviewTextsHarvest.spec.ts` from `FORM_PREVIEW_KEYS`. |
| `record-harvest.mjs` | Adds a driver's drained keys to its record and rewrites it in the shape `harvestRecord.spec.ts` checks, keeping the record's note. |
| `build-overlay.mjs` | Prunes every registered overlay dictionary against the union of the harvests and the shared library. Keeps a key only when the shared library lacks it and a harvest recorded it, plus the `SOURCE_ONLY` allowlist for strings no driver can reach. |

The builder and the guard specs share one copy of each rule in `src/`: the key normalization in
`normalizeKey.ts`, the list of harvest files and the record's shape in `harvestRecord.ts`, their union in
`harvestedKeys.ts`, and `SOURCE_ONLY` in `sourceOnlyKeys.ts`. A new harvest file goes into `HARVEST_FILES`
in `harvestRecord.ts`; a spec that records one writes it with `harvestRecord` to `harvestRecordPath(file)`,
its note built by `harvestNote(subject, task)` from the running test's path and Vitest project, all from the
test-only entry `@miragon/bpmn-modeler-i18n-extras/testing`. A moved spec fails until its record is rewritten
with the new path. `harvestRecord.spec.ts` fails until every record is in that shape.

The recorder is `libs/shared/src/lib/harvestRecorder.ts`. The webview entries (`apps/bpmn-webview/src/main.ts`,
`templateEditorMain.ts`, `apps/dmn-webview/src/main.ts`) wire it only under `import.meta.env.DEV`, so
production builds leave it out.

## Refresh the overlay

1. Start the dev webview: `corepack yarn workspace @miragon/bpmn-modeler-webview serve` for BPMN and the
   template editor (`/template-editor.html`), `corepack yarn workspace @miragon/dmn-modeler-webview serve`
   for DMN with a `.dmn` that has a decision table.
2. In the page console (or with Playwright's `browser_evaluate`), paste the driver and run it:
   `await window.__harvestDrain()`, `__harvestDrainDmn()` or `__harvestDrainTemplateEditor()`.
3. Run `copy(JSON.stringify([...window.__harvested]))` in the console (with Playwright, return
   `[...window.__harvested]` and save it as JSON), then add the keys to the driver's record:
   `pbpaste | bun libs/bpmn-i18n-extras/tools/record-harvest.mjs harvested.json` (or `harvested-dmn.json`,
   `harvested-template-editor.json`). It keeps the record's note and the keys it already holds, so for the
   template editor run it once per page state.
   The records written by specs have no driver: rewrite `harvested-merge.json`, `harvested-diff.json`,
   `harvested-dmn-diff.json`, `harvested-modeler-features.json` or `harvested-form-preview.json` after
   changing one of their texts, since CI fails until they are current. A key the shared diff views start
   translating fails modeler-browser's `diffViewKeys.spec.ts` until `DIFF_VIEW_KEYS` lists it. Any other
   new text goes into its feature's texts constant, which its `*_KEYS` list reads; a text passed to
   `translate()` inline reaches no record, and lint fails it in the features these specs record (`eslint.config.cjs`).

   Each of these records' `note` names its spec and the command that rewrites it, in this form:

   ```bash
   corepack yarn vitest run --project <project> <spec> -u
   ```

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
