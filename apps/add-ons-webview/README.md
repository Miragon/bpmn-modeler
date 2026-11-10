# `apps/add-ons-webview/` — Add-ons view webview

Internal module. **Not published separately.**

Renders the **Add-ons** view: the BPMN plugins, bpmnlint rule packages and
element templates of the open workspace and the registered marketplaces, with
what the user may do about each. The core (`libs/modeler-core/src/addOns`)
builds every text of the model and decides every action; this page renders
the catalog it is sent and posts what the user chose.

It talks to its host over the add-ons view protocol in
[`libs/shared`](../../libs/shared/README.md) (`addOnsView.ts`). Every host
shell ships only an empty `<div id="app"></div>` and writes the brand mode
(`data-cd-theme`, `data-cd-kontrast`) on `<html>`.

## The view

Two tabs, **Workspace** and **Marketplaces**, each a list grouped by folder
and source beside the detail of the selected add-on. A search field and
filter chips narrow the list; "More actions" holds the catalog actions. From
640px of the view's own width list and detail stand side by side; below, the
detail opens in the list's place with **Back**. The layout follows the view's
width through container queries (`src/adapter/in/layout.ts` is the seam the
specs replace, as jsdom does no layout).

The page wears the Miragon brand, not the IDE's look: the host only signals
light, dark and high contrast. Its type sizes are the brand's (13px base),
so the IDE's font size does not reach it; the host's zoom still scales it.
Tab reaches every control; the tabs and the "…" menus keep the arrow keys
their ARIA roles require.

## Where the rules live

- `src/domain/viewState.ts`: the one reducer. It decides what a model, a
  reveal, a result or a user choice changes, which add-on each tab selects,
  what to ask the host and where focus goes. An action is resolved from the
  model, never from the markup. The tab, the selections and the open or
  closed headers survive a reload of the page; the search does not.
- `src/domain/catalogScope.ts`, `catalogFilter.ts`, `catalogSelection.ts`
  and `listContent.ts`: the tabs by the group's kind, the search and the
  chips, the selection rules and which empty state a list shows.
- `src/domain/expansion.ts`: what is open by default (a marketplace starts
  closed) and the user's open or closed choices.
- `src/domain/addOnStatus.ts`, `actionEmphasis.ts`, `placedActions.ts`: a
  row's status, how much a button stands out, Allow only at the end of a
  review.
- `src/domain/chromeTexts.ts`: the view's own words (tabs, chips, empty
  states, screen-reader summaries). Every other text comes from the core; a
  new word of the view goes here, never into an adapter.
- `src/adapter/in/addOnsView.ts`: builds the DOM with the DOM API, never
  `innerHTML`, as names and paths are workspace text; `toolbar.ts`,
  `listView.ts`, `detailView.ts` and `emptyStates.ts` build its parts.
- `src/adapter/in/icons.ts`: every Lucide icon the view shows.
- `src/adapter/in/styles/`: the Miragon brand tokens
  (`cd-tokens.generated.css`, vendored unchanged from the `miragon-brand`
  skill; never edit it, copy a new release over it and update the checksum
  `stylesheet.spec.ts` pins), the base and the view's stylesheet. Components
  use the `--cd-ui-*` roles, palette tokens only for button, badge and kind
  surfaces, and no `--vscode-*` variable.
- Geist and Geist Mono (`@fontsource-variable`, OFL-1.1) and Lucide (ISC)
  ship in the bundle; both plugins carry their licenses (`licenses/` in the
  VSIX, `META-INF/licenses/` in the IntelliJ jar).

## Local development

```bash
corepack yarn workspace @miragon/bpmn-modeler-add-ons-webview dev   # browser preview (portless)
corepack yarn workspace @miragon/bpmn-modeler-add-ons-webview test
```

The preview answers from `src/adapter/out/mockCatalog.ts`. Query flags:
`?state=loading|empty|noFolder|onlyMarketplaces|noMarketplace|marketplacesFailed|rereadFailed|failed`,
`?reveal=<add-on id or name>`, `?stale=1` (the first allow is refused as
stale) and `?theme=dark|hc` (the brand mode a host would post).
