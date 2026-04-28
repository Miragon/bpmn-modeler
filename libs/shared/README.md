# `libs/shared/` — webview shared library

Internal module. **Not published separately.**

Provides the typed Query/Command message protocol and shared utilities used
by every webview in this repo (BPMN, DMN, deployment) to talk to the
extension host. Consumed via the `@bpmn-modeler/shared` path alias defined
in `tsconfig.base.json`.

## Usage from a webview workspace

Add the alias to your `vite.config.mts`:

```ts
export default defineConfig( {
    // ...
    resolve: {
        alias: [
            {
                find: "@bpmn-modeler/shared",
                replacement: path.resolve(
                    __dirname,
                    "../../libs/shared/src"
                )
            }
        ]
    },
    // ...
} );
```
