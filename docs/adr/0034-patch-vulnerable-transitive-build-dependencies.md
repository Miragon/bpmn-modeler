# 0034 — Pin patched transitive dependencies and replace Theia's archive extractor

- Status: accepted (#1531)
- Date: 2026-09-13
- Category: cross-cutting

## Context

The recursive dependency audit found critical vulnerabilities in `shell-quote`
through npm-run-all, `tar` through node-gyp and electron-builder, and `decompress`
through Theia's CLI and runtime plugin deployment code. These versions were
already present before the dependency updates in this PR.

`shell-quote` and `tar` have fixed releases. The original `decompress` package is
unmaintained and has no fixed release; its advisory recommends the maintained
`@xhmikosr/decompress` fork. Theia still uses CommonJS `require`, while the fork
exports an ES module.

## Decision

Use root Yarn resolutions for `shell-quote` 1.9.0 and `tar` 7.5.22. Resolve
`decompress` to `@xhmikosr/decompress` 11.1.4 with a Yarn patch that exposes a
CommonJS wrapper through conditional exports. The wrapper dynamically imports
the upstream implementation and preserves its asynchronous call contract.

Keep the existing Theia and node-gyp versions. The tar resolution crosses
node-gyp's declared major-version range, so verify its file and stream extraction
options alongside electron-builder's extraction path. The repository's Node 22
build environment satisfies both replacement packages' engine requirements.

Run the standalone dependency security tests in CI, covering shell operator
rejection, tar decompression limits, VSIX extraction, extension identity lookup,
and rejection of archive links outside the extraction directory. Also audit
transitive dependencies at critical severity in CI.

## Alternatives considered / rejected

Updating Theia alone does not remove the abandoned extractor. Backporting archive
containment fixes into `decompress` would leave this repository responsible for
maintaining security-sensitive extraction code. Suppressing the advisory would
leave the vulnerable implementation reachable during plugin installation.

## Consequences

The three critical advisories no longer match the resolved dependency graph.
The extractor replacement introduces a new maintainer and transitive dependency
tree; registry integrity checks and regression tests do not prove the absence of
malicious code. High-severity findings remain and need separate remediation.

The compatibility patch and overrides must be reviewed when Theia or node-gyp
changes. Remove them once those callers declare compatible, fixed dependencies.
Security tests cover the exercised interfaces, not full host packaging on every
platform.

References: [shell-quote advisory](https://github.com/advisories/GHSA-w7jw-789q-3m8p),
[tar advisory](https://github.com/advisories/GHSA-23hp-3jrh-7fpw),
[decompress advisory](https://github.com/advisories/GHSA-mp2f-45pm-3cg9).
