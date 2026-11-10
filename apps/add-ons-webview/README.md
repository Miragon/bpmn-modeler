# `apps/add-ons-webview/` — Add-ons view webview

Internal module. **Not published separately.**

Renders the **Add-ons** view: the BPMN plugins, bpmnlint rule packages and
element templates of the open workspace, grouped by workspace folder and
source, with what the user may do about each. The core
(`libs/modeler-core/src/addOns`) builds every text and decides every action;
this page only renders the catalog it is sent and posts what the user chose.

It talks to its host over the add-ons view protocol in
[`libs/shared`](../../libs/shared/README.md) (`addOnsView.ts`). Every host
shell ships only an empty `<div id="app"></div>`.

## Where the rules live

- `src/domain/viewState.ts`: the one reducer. It decides what a model, a
  reveal, a result or a user choice changes, what to ask the host and where
  focus goes. An action is resolved from the model, never from the markup.
- `src/domain/outline.ts` and `outlineMove.ts`: the heads in order, what is
  open by default (a marketplace starts closed) and what each key does.
- `src/domain/placedActions.ts`: Allow sits only at the end of a review.
- `src/adapter/in/catalogView.ts`: builds the DOM with the DOM API, never
  `innerHTML`, as names and paths are workspace text.
- `src/adapter/in/styles/hostThemeVariables.json`: every `--vscode-*`
  variable the stylesheet may read, the set IntelliJ maps.

## Local development

```bash
corepack yarn workspace @miragon/bpmn-modeler-add-ons-webview dev   # browser preview (portless)
corepack yarn workspace @miragon/bpmn-modeler-add-ons-webview test
```

The preview answers from `src/adapter/out/mockCatalog.ts`. Query flags:
`?state=loading|empty|noFolder|failed`, `?reveal=<add-on id or name>`,
`?stale=1` (the first allow is refused as stale) and `?theme=dark|hc`.
