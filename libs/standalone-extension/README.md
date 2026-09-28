# @miragon/bpmn-modeler-standalone-extension

Theia frontend extension consumed by `apps/standalone/`. Contributes the Miragon Light/Dark color themes, the first-run theme picker, and disposes built-in IDE views (Extensions Marketplace, Debug, Test Explorer, Outline) that have no purpose in a BPMN modeler.

## Why a separate package

Theia's extension generator only iterates `dependencies` and `peerDependencies` — the root package's own `theiaExtensions` are silently ignored.

In Theia 1.75, `@theia/application-package` discovers extension packages from
the application's dependencies and peers, not its own `theiaExtensions` field.
Keeping this package separate also keeps its TypeScript compilation and asset
copy separate from the application's generated esbuild bundles. Its React peers
are provided by the standalone host; matching development dependencies support
building the extension on its own.
