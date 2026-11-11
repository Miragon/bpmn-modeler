# `@miragon/bpmn-modeler-standalone-extension`

The Theia frontend extension that turns a plain Theia shell into the desktop app in
[`apps/standalone`](../../apps/standalone). It contributes the Miragon light and dark themes with a
first-run picker, removes the IDE views a modeler does not need (Extensions, Debug, Test, Outline),
toggles a `.bpmn` or `.dmn` file between the modeler and the text editor, flushes pending modeler changes
before a secondary window docks back, and loads `src/styles/miragon.css`.

Internal workspace, not published on its own.

It also rebinds Theia's `PluginViewRegistry` (`CurrentTitlePluginViewRegistry`)
so a plugin view container restored from a stored layout shows the title and
icon its plugin contributes now. Theia stores both in the layout and lets a
view's stored container title override the current one, so an app update that
renames a container or changes its icon would otherwise not show until the
user resets the workbench layout. The rebind needs `@theia/plugin-ext` in
`dependencies`: Theia loads an extension's dependencies' modules first.

## Why a separate package

Theia's generator (`@theia/application-package`, Theia 1.76) discovers extensions only among an
application's `dependencies` and `peerDependencies`, never in the application's own `theiaExtensions`.
Keeping the extension separate also keeps its TypeScript build apart from the app's generated esbuild
bundles. The React peers come from the app; the matching dev dependencies let the extension build on its
own.

New contributions are bound in `src/frontend-module.ts`.

## Develop

```bash
corepack yarn workspace @miragon/bpmn-modeler-standalone-extension build
corepack yarn workspace @miragon/bpmn-modeler-standalone-extension test
```
