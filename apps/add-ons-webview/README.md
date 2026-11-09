# `apps/add-ons-webview/` — Artifacts view webview

Internal module. **Not published separately.**

Renders the **Artifacts** view: the BPMN plugins, bpmnlint rule packages and
element templates of the open workspace, grouped by workspace folder and
source, with what the user may do about each. The core
(`libs/modeler-core/src/addOns`) builds every text and decides every action;
this page only renders the catalog it is sent and posts what the user chose.

It talks to its host over the add-ons view protocol in
[`libs/shared`](../../libs/shared/README.md) (`addOnsView.ts`). Every host
shell ships only an empty `<div id="app"></div>`.

## Local development

```bash
corepack yarn workspace @miragon/bpmn-modeler-add-ons-webview dev   # browser preview (portless)
corepack yarn workspace @miragon/bpmn-modeler-add-ons-webview test
```
