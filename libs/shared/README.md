# `@bpmn-modeler/shared`

Shared message types and utilities used by both the VS Code extension host
(`apps/modeler-plugin`) and the webviews (`apps/bpmn-webview`,
`apps/dmn-webview`, `apps/deployment-webview`).

## Usage

Add a workspace dependency in the consuming workspace's `package.json`:

```json
{
  "dependencies": {
    "@bpmn-modeler/shared": "workspace:*"
  }
}
```

Then import normally:

```ts
import { someUtil, SomeMessageType } from "@bpmn-modeler/shared";
```

Path resolution is handled by `tsconfig.base.json` (via `paths`) plus
`vite-tsconfig-paths` (for webviews) and `tsconfig-paths-webpack-plugin`
(for the extension host). No manual `vite.config` alias required.
