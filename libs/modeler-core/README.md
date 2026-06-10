# `@miragon/bpmn-modeler-core`

The host-agnostic BPMN/DMN modeling engine: domain models, services, the
host-capability ports (`hostPorts.ts`), and the `vscode`-free infrastructure
registries (`EditorSessionStore`, `WebviewMessageRouter`, `DiffPaneStore`).

This package must never import `vscode`, and its `domain/` layer must never
import a Node host module (`node:*`, `fs`, `http`/`https`) either — invariants
enforced by the CI gate in `src/architecture.spec.ts`. Host capabilities (file
I/O, notifications, clipboard, …) are reached only through the ports in
`shared/domain/hostPorts.ts`, which each host implements with its own adapters.
Pure Node utilities that exist in any Node host (`path`, `Buffer`) are used
directly by services and are not considered host capabilities.

## Consumers

- `apps/vscode-plugin` — the VS Code host, in-process, wires the engine through
  `Vs*` port adapters.
- The IntelliJ host bridge (on the `issue-920` branch) — out-of-process, wires
  the same engine through RPC-backed port adapters.

## Usage

Add a workspace dependency in the consuming workspace's `package.json`:

```json
{
  "dependencies": {
    "@miragon/bpmn-modeler-core": "workspace:*"
  }
}
```

Then import from the package entrypoint only (not deep relative paths):

```ts
import { BpmnModelerService, EditorSessionStore } from "@miragon/bpmn-modeler-core";
```

Path resolution is handled by `tsconfig.base.json` (via `paths`) plus
`vite-tsconfig-paths` (for webviews) and `tsconfig-paths-webpack-plugin`
(for the extension host). No manual `vite.config` alias required.
