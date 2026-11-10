# Resources

Example files to try the modeler against by hand. Tests do not read them; their fixtures sit next to
the specs (`__fixtures__/`).

[`example-process/`](example-process/) is a small workspace you open in VS Code, the desktop app or
IntelliJ:

| Path | What it holds |
| --- | --- |
| `c7/` | Camunda 7 diagrams, among them `lint-demo.bpmn` for the custom lint rule, and element templates in `c7/.camunda/element-templates/` |
| `c8/` | Camunda 8 diagrams and element templates in `c8/.camunda/element-templates/` |
| `forms/` | A JSON Forms schema (`ksof.form.json`) |
| `.bpmnlintrc`, `package.json` | A workspace lint config with a custom bpmnlint plugin, see [bpmnlint-custom-rules](example-process/bpmnlint-custom-rules/README.md) |

`example-process/` is its own Yarn project, outside the repository's workspaces. For a local Camunda
engine to deploy these diagrams to, see [`stack/c7`](../stack/c7/README.md) and
[`stack/c8`](../stack/c8/README.md).
