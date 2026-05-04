# @miragon/bpmn-modeler-standalone-extension

Theia frontend extension consumed by `apps/standalone/`. Contributes the Miragon Light/Dark color themes, the first-run theme picker, and disposes built-in IDE views (Extensions Marketplace, Debug, Test Explorer, Outline) that have no purpose in a BPMN modeler.

## Why a separate package

Theia's extension generator only iterates `dependencies` and `peerDependencies` — the root package's own `theiaExtensions` are silently ignored.

`@theia/application-package@1.70.2` (`src/extension-package-collector.ts:38-46`):

```ts
for (const [dep, ver] of [
    ...Object.entries(pck.dependencies ?? {}),
    ...Object.entries(pck.peerDependencies ?? {})
]) {
    this.collectPackage(packagePath, dep, ver, optional);
}
```

A yarn `workspace:^` self-reference would bypass this, but it forces three competing build outputs (tsc-for-scripts, tsc-for-extension, Theia webpack) into the same `apps/standalone/lib/`. No public Theia app uses that pattern — `browser-app`, `electron-app`, `theia-blueprint` all ship sibling extension packages.
