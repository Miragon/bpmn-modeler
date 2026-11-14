# `@miragon/bpmn-modeler-add-ons-webview`

Renders the **Add-ons** view: the BPMN plugins, bpmnlint rule packages and element templates of the
open workspace and the registered marketplaces, with the actions the user may take on each. VS Code,
the desktop app and IntelliJ load it. Internal workspace, not published on its own.

## How it works

- **The core decides, the page renders.** `libs/modeler-core/src/addOns` builds every text of the
  model and decides every action; this page renders the catalog it receives and posts the user's
  choice. The protocol is `addOnsView.ts` in [`libs/shared`](../../libs/shared/README.md).
- **One empty shell.** Every host ships only `<div id="app"></div>` and writes the brand mode
  (`data-cd-theme`, `data-cd-kontrast`) on `<html>`; `src/adapter/in/addOnsView.ts` builds the DOM
  with the DOM API, never `innerHTML`, because names and paths are workspace text.
- **READMEs as DOM, never HTML.** A detail asks the host for the README of the add-on or marketplace
  it shows; `src/adapter/in/markdownView.ts` builds it from `marked`'s tokens, drops raw HTML, shows an
  image's alt text and keeps only absolute web and mail links.
- **One reducer.** `src/domain/viewState.ts` decides what a model, a reveal, a result or a user
  choice changes, which add-on the list selects, what to ask the host and where focus goes. Actions
  resolve from the model, never from the markup. The selection and open headers survive a reload;
  the search and the filter do not.
- **One list, three sections.** `src/domain/listSections.ts` splits the catalog into Needs attention
  (what offers Allow or has a problem), Installed (the folder groups, without those rows) and
  Marketplaces; an add-on shows in one place only.
- **The view's own words** (sections, row status words, the header line, empty states,
  screen-reader summaries) live in
  `src/domain/chromeTexts.ts`; every other text comes from the core.
- **Layout by container width.** From 640px of the view's own width, list and detail sit side by
  side; below, the detail replaces the list with **Back**. `src/adapter/in/layout.ts` is the seam
  the specs replace, as jsdom does no layout.
- **Miragon brand, not the IDE look.** The host only signals light, dark and high contrast; type
  sizes are the brand's, the host's zoom still scales them. `src/adapter/in/styles/cd-tokens.generated.css`
  is vendored from the `miragon-brand` skill: never edit it, copy a new release over it with the
  plugin's `brand-assets.mjs`, which reads `.miragon/brand-assets.yaml` and rewrites the checksums in
  `.miragon/brand-assets.sha256`. Components use the `--cd-ui-*` roles and no `--vscode-*`
  variable.
- **Bundled licenses.** Geist, Geist Mono (OFL-1.1) and Lucide (ISC) ship in the bundle; the build
  writes their licenses to `licenses/`, which both IDE plugins carry.

## Develop

```bash
corepack yarn workspace @miragon/bpmn-modeler-add-ons-webview dev    # browser preview
corepack yarn workspace @miragon/bpmn-modeler-add-ons-webview test
```

The preview answers from `src/adapter/out/mockCatalog.ts`. Query flags:
`?state=loading|empty|noFolder|onlyMarketplaces|noMarketplace|marketplacesFailed|rereadFailed|failed|allReviewed`,
`?reveal=<add-on id or name>`, `?preset=needsReview` (Review Add-ons, after any reveal), `?stale=1` (the first allow is refused as stale) and
`?theme=dark|hc`.
