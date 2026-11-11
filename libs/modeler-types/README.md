# `@miragon/bpmn-modeler-types`

The publishable half of the shared code: model types (engine, lint, settings, scripting, implementation,
diff), browser utilities (canvas resize, the text-editing predicate, the flushable input debounce) and
pure rules that browser code and `@miragon/bpmn-modeler-core` both apply (`scriptSurface.ts`,
`workspaceDefinitions.ts`, `xmlMarkup.ts`, `processVariables.ts`). Nearly every workspace imports it;
both npm packages inline it.

Internal workspace, not published on its own.

## The boundary

Everything here may ship in the npm packages. The webview ↔ host protocol (`Query`, `Command`, `HostApi`,
document flush) stays private in [`@miragon/bpmn-modeler-shared`](../shared/README.md).

- This package, the bpmn-js modules (`append-menu`, `bpmn-clipboard`, `code-link`, `definition-search`,
  `element-template-builder`, `element-template-chooser`, `flow-navigation`, `inline-scripting`,
  `model-navigation`, `properties-panel`) and both npm packages must never import
  `@miragon/bpmn-modeler-shared`. The ESLint rule `BND-PROTOCOL-PRIVATE` in `eslint.config.cjs` fails
  otherwise, and each npm package's `architecture.spec.ts` forbids naming the protocol.
- The webview apps are left out on purpose: they are the adapters that speak the protocol.
- A declaration here that a public type references ships in the published `.d.ts`, even unnamed. The
  `check-dts` scripts catch protocol symbols and private imports there, and `publicApi.spec.ts` pins the
  listed public names, but neither notices a changed declaration that still compiles. Treat such edits as
  public API changes.

## Usage

```ts
import { type Engine, isTextEditingSurface, observeCanvasSize } from "@miragon/bpmn-modeler-types";
```
