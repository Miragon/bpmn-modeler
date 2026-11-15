# Security Policy

## Reporting a vulnerability

Please report a vulnerability privately through
[GitHub's private vulnerability reporting](https://github.com/Miragon/bpmn-modeler/security/advisories/new).
Do not open a public issue for it.

A useful report names the affected distribution (VS Code extension, IntelliJ
plugin, desktop app, Orca plugin or npm package) and its version, and gives the
steps or a model file that reproduce the problem.

## Supported versions

Fixes ship in a new release of the affected distribution. Older releases do not
receive backports, so update to the latest version before reporting.

## Scope

The modeler opens files from the workspace it runs in. Code a workspace can make
the modeler run, such as bpmn-js plugins and lint rule packages, is gated by the
[workspace code allowance](https://miragon.github.io/bpmn-modeler/vscode/features/add-ons);
a way around that gate is in scope.

Advisories in third-party dependencies are tracked with Dependabot. A report
about one is welcome when you can show it is reachable in a shipped distribution.
