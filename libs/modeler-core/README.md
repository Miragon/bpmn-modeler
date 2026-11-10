# `@miragon/bpmn-modeler-core`

The host-agnostic engine behind the editors: domain models, services, the host ports
(`src/kernel/port/hostPorts.ts`) and the editor-session registries (`EditorSessionStore`,
`WebviewMessageRouter`, `DiffPaneStore`).

Internal workspace, not published on its own.

## Consumers

- `apps/vscode-plugin` runs it in process through its `Vs*` port adapters. The desktop app runs the same
  extension.
- `apps/modeler-bridge` runs it out of process for the IntelliJ plugin, through RPC-backed port adapters.

## Rules

- Never import `vscode`. The `domain/` layer also never imports a Node host module (`node:*`, `fs`,
  `http`, `https`). `src/architecture.spec.ts` enforces both. Plain Node utilities such as `path` and
  `Buffer` are fine in services.
- Host capabilities (files, notifications, clipboard, ...) are reached only through ports: cross-cutting
  ones in `kernel/port/`, feature-owned ones in the feature's `port/`.
- Each feature folder uses the role folders `domain/`, `port/`, `service/`, `adapter/in/`,
  `adapter/out/` and `composition/`; `tools/repo-checks` checks their import direction. See
  [Role folders](../../docs/adr/role-folders.md).
- Consumers import from the package entry only, never deep paths:

  ```ts
  import { BpmnModelerService, EditorSessionStore } from "@miragon/bpmn-modeler-core";
  ```

## Develop

```bash
corepack yarn workspace @miragon/bpmn-modeler-core test
corepack yarn test:mutation
```
