# `@miragon/bpmn-modeler-types`

The **public**, host-agnostic half of the modeler's shared code: domain/model
types (engine, lint, settings, scripting, implementation, diff), browser
utilities (canvas resize, text-editing-surface predicate, the flushable
`debounceInput` service of the BPMN and DMN editors) and the pure rules browser
code and `@miragon/bpmn-modeler-core` both apply (script-surface addressing in
`scriptSurface.ts`, workspace definitions, the XML comment and CDATA scan in
`xmlMarkup.ts`, process-variable extraction in `processVariables.ts`). None of
it depends on the webview ↔ host message protocol.

This package draws a hard line so the modeler can ship as a publishable
`@miragon/bpmn-modeler` npm package without dragging the host protocol along:
publishable types the package needs live here, while the internal Query/Command
protocol + `HostApi` stay private in `@miragon/bpmn-modeler-shared`. Everything
here is safe to publish; everything protocol-shaped stays in
`@miragon/bpmn-modeler-shared`.

## The boundary

- **Public (here):** anything a consumer of the modeler package may import.
  The npm surface is only what a package entry re-exports by name, so a shared
  rule here adds nothing to it; `check-dts` and `publicApi.spec.ts` gate it.
- **Protocol (in `@miragon/bpmn-modeler-shared`):** `Query`/`Command` bases,
  the concrete message classes, `HostApi`, document-flush plumbing.

The publishable libraries (`append-menu`, `bpmn-clipboard`, `code-link`,
`definition-search`, `element-template-chooser`, `flow-navigation`,
`inline-scripting`, `model-navigation`, `properties-panel`) and the
`packages/bpmn-modeler` and `packages/dmn-modeler` npm packages may import
**this** package but never `@miragon/bpmn-modeler-shared`. An eslint
`no-restricted-imports` rule (`BND-PROTOCOL-PRIVATE` in `eslint.config.cjs`)
fails the build if any of them, or this package itself, imports the protocol
package. The webview apps (`apps/*-webview`) are left out on purpose: they are
the host adapters that speak the protocol. Each npm package's
`architecture.spec.ts` also forbids its sources from naming the protocol.

## Usage

```json
{
  "dependencies": {
    "@miragon/bpmn-modeler-types": "workspace:*"
  }
}
```

```ts
import { Engine, isTextEditingSurface, observeCanvasSize } from "@miragon/bpmn-modeler-types";
```

Path resolution is handled by `tsconfig.base.json` (`paths`) plus
`vite-tsconfig-paths` (webviews) and `tsconfig-paths-webpack-plugin` (extension
host). Vitest projects take the `workspaceAliases` that the root
`vitest.shared.ts` generates from the same `paths`.
