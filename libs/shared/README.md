# `@miragon/bpmn-modeler-shared`

The **private** webview ↔ host **message protocol** for BPMN, DMN, and Camunda
Form modeling: the `Query`/`Command` base classes and every concrete message
type, `HostApi`, document-flush plumbing, and the resolver and reply-registry
helpers.

Used by the extension host (`apps/vscode-plugin`), the modeler-bridge, and the
webview bootstrap/host-adapter layers. It is **not** publishable: it encodes the
internal transport contract.

## The public/protocol split

The publishable, host-agnostic types and browser utilities
(engine/lint/settings/scripting/implementation/diff types, `canvasResize`, the
`isTextEditingSurface` predicate, `asyncDebounce`) and the pure rules browser
code shares with the core, such as process-variable extraction, live in
[`@miragon/bpmn-modeler-types`](../modeler-types/README.md). This package
imports those types where its message payloads reference them, but never the
reverse — a `no-restricted-imports` eslint rule (`BND-PROTOCOL-PRIVATE`) keeps
the publishable libraries and npm packages off this protocol package; the
[`modeler-types` boundary](../modeler-types/README.md#the-boundary) lists them.

Alongside the protocol, this package also holds the private webview chrome that
is not worth publishing ([Architecture and hosts: package boundaries](../../docs/adr/architecture-and-hosts.md#package-boundaries)): the properties-panel `propertiesPanelFocus`
/ `propertiesPanelResizer` (DOM-id-coupled page chrome) and the shared
`hostTheme` adapter (`hostTheme.ts`) — it maps the VS Code `<body>`-class
light/dark signal to a page-level scope attribute on `<html>` plus each modeler
instance's own `setTheme`, and is used by both the BPMN and DMN webviews.

Reach for `@miragon/bpmn-modeler-types` for anything the published
`@miragon/bpmn-modeler` npm package could need; reach for this package only from
the bootstrap/host layers, `modeler-core`, and the hosts.

## Usage

```json
{
  "dependencies": {
    "@miragon/bpmn-modeler-shared": "workspace:*"
  }
}
```

```ts
import { BpmnFileQuery, HostApi } from "@miragon/bpmn-modeler-shared";
```

Path resolution is handled by `tsconfig.base.json` (via `paths`) plus
`vite-tsconfig-paths` (for webviews) and `tsconfig-paths-webpack-plugin`
(for the extension host). No manual `vite.config` alias required.
