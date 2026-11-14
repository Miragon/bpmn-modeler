import type { AddOnReadmePayload } from "@miragon/bpmn-modeler-shared";

/* The preview's READMEs, by the add-on or marketplace id the mock catalog lists. */

const RESIZE_TASKS = `# Resize Tasks

Lets you resize tasks, subprocesses and call activities by dragging their corners, with a **minimum size** so labels never get cut off.

## What it changes

- Adds resize handles to every activity on the canvas.
- Snaps the new size to the grid, so lanes stay aligned.
- Keeps the label inside the shape while you drag.

It does **not** change the process part of the file: only the \`<bpmndi:BPMNShape>\` bounds.

## Install

Copy this folder into the \`plugins\` folder of your config folder:

\`\`\`sh
cp -R resize .camunda/plugins/
\`\`\`

Then **Allow** it in the Add-ons view. See the [BPMN plugins guide](https://miragon.github.io/bpmn-modeler/vscode/features/bpmn-plugins) for how allowances work.

> Tested with bpmn-js 18. Older modelers ignore the plugin.

![Resizing a task](./docs/resize.gif)
`;

const PALETTE = `# Palette

Groups the palette by what you model most: events, tasks, gateways, then everything else.

- [x] Camunda 8
- [x] Camunda 7
- [ ] Zeebe user task forms
`;

const ACME_RULES = `# @acme/bpmnlint-plugin-rules

Acme's modelling conventions as bpmnlint rules.

| Rule | Default | Checks |
| :-- | :-: | :-- |
| \`acme/task-name\` | error | A task name starts with a verb |
| \`acme/no-gateway-join-fork\` | warn | A gateway either joins or forks |
| \`acme/timer-iso\` | error | A timer uses an ISO 8601 duration |

## Use it

Add it to your \`.bpmnlintrc\`:

\`\`\`json
{ "extends": ["bpmnlint:recommended", "plugin:@acme/rules/recommended"] }
\`\`\`
`;

const SHARED_MARKETPLACE = `# Acme shared templates

The element templates every Acme team uses: mail, Slack, the order service and the document archive.

## Templates

- **Mail Task**: sends a mail through the Acme mail gateway.
- **Order Service**: creates, cancels and looks up orders.
- **Archive Document**: stores a document in the archive and returns its id.

## Contributing

Open a pull request against \`main\`; the [template style guide](https://example.com/acme/templates/STYLE.md) lists what a review checks.
`;

export const MOCK_READMES: Readonly<Record<string, AddOnReadmePayload>> = {
    "plugin:/work/.camunda/plugins/resize": { kind: "shown", markdown: RESIZE_TASKS, truncated: false },
    "plugin:/work/.camunda/plugins/palette": { kind: "shown", markdown: PALETTE, truncated: false },
    "rulePackage:/work/node_modules/@acme/bpmnlint-plugin-rules": {
        kind: "shown",
        markdown: ACME_RULES,
        truncated: false,
    },
    "marketplace:shared": { kind: "shown", markdown: SHARED_MARKETPLACE, truncated: false },
    "plugin:/work/.camunda/plugins/lasso": {
        kind: "unreadable",
        text: "Its README could not be read. The log says why.",
    },
};

export function mockReadmeOf(targetId: string): AddOnReadmePayload {
    return MOCK_READMES[targetId] ?? { kind: "none" };
}
