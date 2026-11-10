# `@miragon/bpmn-modeler-shared`

The private webview ↔ host message protocol for BPMN, DMN and Camunda Forms: the `Query` and `Command`
bases, every message type, `HostApi`, document flush and the reply helpers. Next to it lives the webview
chrome that is not worth publishing: properties-panel focus and resizer and the `hostTheme` adapter.
`modeler-core`, the modeler bridge, the VS Code extension, the Orca plugin and every webview use it.

Internal workspace, never published: it encodes the internal transport contract.

## Rules

- Anything the published npm packages could need goes to
  [`@miragon/bpmn-modeler-types`](../modeler-types/README.md); this package may import from there,
  never the reverse. [The boundary](../modeler-types/README.md#the-boundary) lists who may not import
  this package.
- `hostTheme.ts` maps the host's light or dark signal to an attribute on `<html>` and to each modeler's
  `setTheme`; the BPMN and DMN webviews both use it.
- `harvestRecorder.ts` is the translation harvest seam of
  [`bpmn-i18n-extras`](../bpmn-i18n-extras/tools/README.md), wired only in dev builds.

Why the chrome lives here is in
[Package boundaries](../../docs/adr/architecture-and-hosts.md#package-boundaries).

## Usage

```ts
import { BpmnFileQuery, type HostApi } from "@miragon/bpmn-modeler-shared";
```
