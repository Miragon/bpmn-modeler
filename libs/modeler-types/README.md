# `@miragon/bpmn-modeler-types`

The **public**, host-agnostic half of the modeler's shared code: domain/model
types (engine, lint, settings, scripting, implementation, diff) and browser
utilities (theme, canvas resize, properties-panel focus/resizer, BPMN flow
order) that carry no dependency on the webview ↔ host message protocol.

This package exists to draw a hard line for epic #1293 (extract the BPMN
modeler into a publishable `@miragon/bpmn-modeler` npm package). The former
`@miragon/bpmn-modeler-shared` mixed two audiences behind one barrel:
publishable types the package needs, and the internal Query/Command protocol +
`HostApi` that must stay private. Inlining the publishable libs into the
package would otherwise drag the protocol along. Everything here is safe to
publish; everything protocol-shaped stays in `@miragon/bpmn-modeler-shared`.

## The boundary

- **Public (here):** anything a consumer of the modeler package may import.
- **Protocol (in `@miragon/bpmn-modeler-shared`):** `Query`/`Command` bases,
  the concrete message classes, `HostApi`, document-flush plumbing.

The publishable libraries (`append-menu`, `bpmn-clipboard`, `code-link`,
`element-template-chooser`, `inline-scripting`, `model-navigation`,
`flow-navigation`) and the webview `app/` layers may depend on **this** package
only. An eslint `no-restricted-imports` rule (`BND-PROTOCOL-PRIVATE`) fails the
build if any of them reach for `@miragon/bpmn-modeler-shared`, and the reverse
guard forbids this package from importing the protocol package.

## Usage

```json
{
  "dependencies": {
    "@miragon/bpmn-modeler-types": "workspace:*"
  }
}
```

```ts
import { Engine, initTheme, buildFlowOrder } from "@miragon/bpmn-modeler-types";
```

Path resolution is handled by `tsconfig.base.json` (`paths`) plus
`vite-tsconfig-paths` (webviews) and `tsconfig-paths-webpack-plugin` (extension
host). Vitest projects hard-code the alias in their own `vitest.config.ts`.
