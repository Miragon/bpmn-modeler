# Standalone app

- Status: accepted
- Last reviewed: 2026-11-13

## Context

The standalone app loads the VS Code extension in Theia/Electron and ships as a
packaged desktop application, on Linux inside a Flatpak sandbox. It inherits
Theia's dependency tree, its Electron runtime and a git and language-grammar
setup that users cannot be asked to provide. This topic records the constraints on
that tree. Release routing and publishing are in
[Release and publishing](release-and-publishing.md).

## Contents

- [Theia and Electron runtime](#theia-and-electron-runtime)
- [Dependency security overrides](#dependency-security-overrides)
- [Linux Git](#linux-git)
- [Built-in languages](#built-in-languages)
- [Windows packages](#windows-packages)
- [Restored view containers](#restored-view-containers)

## Decision

### Theia and Electron runtime

- All Theia extensions must resolve the same core widget runtime: duplicate core
  instances apply Inversify decorators to the shared Lumino Widget twice and stop
  the frontend from starting. The
  [runtime compatibility check](../../apps/standalone/scripts/theia-runtime.test.mjs)
  uses Theia's extension discovery to verify module resolution in CI.
- Use `@theia/scm` and the Timeline integration for Git history. The deprecated
  `@theia/scm-extra` stopped publishing in 1.75, and keeping its last release
  brings in an older core.
- Pin Electron to an exact version in `@theia/electron`'s peer major, at or above
  that peer, and do not override it independently in electron-builder. Patch
  releases within a major keep the native-module ABI, so running ahead of Theia's
  exact peer is allowed when a security advisory needs a newer patch before Theia
  ships one; return to Theia's peer once it reaches the fixed version. (The app
  currently runs ahead of Theia's pin for that reason.)
- Keep the app in ASAR but unpack only the generated `lib/backend/native/rg*`
  binary used for file search: a native subprocess cannot execute from inside
  ASAR, and unpacking all app code is not needed. Theia resolves the unpacked
  sidecar path since 1.76
  ([packaged binary check](../../apps/standalone/scripts/packaged-runtime.test.mjs),
  [Quick Open check](../../apps/standalone/scripts/packaged-search.test.mjs)).

### Dependency security overrides

Three advisories in Theia's and node-gyp's tree are addressed with root
resolutions instead of waiting for upstream: `shell-quote` and `tar` are pinned to
fixed versions, and the unmaintained `decompress` is replaced by
`@xhmikosr/decompress` through a Yarn patch that exposes a CommonJS wrapper (it
dynamically imports the maintained implementation and keeps the asynchronous call
contract Theia's CommonJS callers need). This keeps Theia and node-gyp usable
without maintaining a security-sensitive archive extractor fork.

- The `tar` override crosses node-gyp's declared major range, so file/stream
  extraction options and electron-builder's extraction path are tested.
- [Dependency security tests](../../apps/standalone/scripts/dependency-security.test.mjs)
  run in CI for shell-operator rejection, tar decompression limits, VSIX
  extraction, extension identity and rejection of archive links outside the
  destination. CI audits direct dependencies at high severity and transitive ones
  at critical. These check exercised interfaces and the resolved graph, not every
  host package or upstream's trustworthiness, and do not imply lower-severity
  findings are remediated.
- Review the overrides and the patch when Theia or node-gyp changes and remove them
  once callers declare compatible fixed dependencies. Updating Theia alone does not
  necessarily remove the abandoned extractor. Suppressing the advisory or
  maintaining extraction backports would leave the maintenance problem unresolved.

### Linux Git

Use `org.freedesktop.Platform` at runtime and `org.freedesktop.Sdk` only for
building. Bundle Git under `/app` from the checksum-pinned source archive in
[`git.yml`](../../apps/standalone/flatpak/git.yml), following Obsidian's Flatpak
packaging. Disable Perl, Rust and Tcl/Tk components; the modeler uses the Git CLI
and its HTTPS helper. The Platform runtime supplies SSH and `--socket=ssh-auth`
lets sandboxed Git use the host's SSH agent. The
[release workflow](../../.github/workflows/publish-standalone.yml) checks Git in the
finished application's runtime, not the build SDK.

Shipping the full SDK at runtime would add development tools, and forwarding Git to
the host would need general host-command permission. The cost is that the package
carries its own Git version (update the source URL and checksum for Git fixes) and
that Git stays sandboxed: host-only credential helpers and hook dependencies need
sandbox-compatible alternatives.

### Built-in languages

The standalone host ships common syntax grammars without requiring users to install
extensions. Declare the Open VSX `eclipse-theia.builtin-extension-pack` VSIX at an
exact version in the standalone `theiaPlugins` manifest, and keep the existing
explicit `vscode.git` pin rather than upgrading Git with a language change. Use
Theia's standard downloader to expand `extensionPack` and resolve dependencies; do
not maintain a separate list of downloaded plugins. electron-builder copies the
result as extra resources.

- Exclude only `vscode.prompt` and `vscode.terminal-suggest` via
  `theiaPluginsExcludeIds`: the pack references both but Open VSX returns no
  versions for either, which otherwise fails the whole preparation. Keep every other
  download error fatal rather than enabling `--ignore-errors`, and recheck the
  exclusions when updating the pack.
- The [runtime configuration test](../../apps/standalone/scripts/theia-runtime.test.mjs)
  guards the pack pin, the exclusions, retained language members and fatal download
  errors; the [packaged runtime test](../../apps/standalone/scripts/packaged-runtime.test.mjs)
  checks representative language registrations in the artifact.
- Grammars work offline after installation, but the pin does not make downloads
  reproducible (the pack's members and their dependencies resolve to the latest
  Theia-compatible versions at download time). Grammars are not language-server
  support, and prompt-file support and terminal suggestions do not ship.

### Windows packages

Users without administrator rights or with managed machines need the app without running
an installer. Windows ships as an NSIS installer and as a zip of the unpacked app, as
Camunda Modeler does. The zip is attached only to the versioned release, not to the
`standalone-latest` updater feed: electron-updater on Windows installs the NSIS build, so
the app checks for updates only when the NSIS uninstaller sits next to its executable.
The [installation test](../../apps/standalone/scripts/standalone-installation.test.mjs)
guards that check and the targets. Cost: the zip updates only by downloading a newer zip
and registers no file associations.

### Restored view containers

Theia stores a plugin view container's title and icon in the saved layout and restores
them over the ones the extension contributes now. It also leaves an existing view widget
in the container the layout kept it in and closes a newly contributed container as empty.
When the extension gave [Add-ons and Deploy](add-ons.md#vs-code) their own containers,
an updated app would therefore have kept the old layout. `libs/standalone-extension`
rebinds Theia's `PluginViewRegistry` to give a restored container the current title and
icon and to take a view out of a container that no longer lists it, so Theia builds it
anew in its own container. A view the user dragged keeps its place.
