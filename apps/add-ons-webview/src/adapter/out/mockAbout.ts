import type {
    AddOnAboutPayload,
    AddOnLicensePayload,
    AddOnReadmePayload,
} from "@miragon/bpmn-modeler-shared";

/* The preview's READMEs, licenses and stars, by the add-on or marketplace id the mock catalog lists. */

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

const shown = (markdown: string): AddOnReadmePayload => ({ kind: "shown", markdown, truncated: false });

const packageLicense = (text: string, declared = text): AddOnLicensePayload => ({
    kind: text === declared ? "known" : "other",
    text,
    label: `License: ${declared}, as its package.json says`,
});

/* The texts copy the core's so the preview reads like a host; the core stays their home. */
export const MOCK_ABOUT: Readonly<Record<string, AddOnAboutPayload>> = {
    "plugin:/work/.camunda/plugins/resize": { readme: shown(RESIZE_TASKS), license: packageLicense("MIT") },
    "plugin:/work/.camunda/plugins/palette": { readme: shown(PALETTE), license: packageLicense("Apache-2.0") },
    "rulePackage:/work/node_modules/@acme/bpmnlint-plugin-rules": {
        readme: shown(ACME_RULES),
        license: packageLicense("Custom license", "SEE LICENSE IN LICENSE.md"),
    },
    "marketplace:shared": {
        readme: shown(SHARED_MARKETPLACE),
        license: { kind: "known", text: "MIT", label: "License: MIT License, as GitHub detected it" },
        stars: { text: "1.2k", label: "1,234 stars on GitHub, as of the last marketplace update" },
    },
    // Cached by an earlier update; the last one failed.
    "marketplace:broken": {
        readme: { kind: "none" },
        license: { kind: "none", text: "No license", label: "GitHub found no license file in the repository." },
        stars: { text: "3", label: "3 stars on GitHub, as of the last marketplace update" },
    },
    "plugin:/work/.camunda/plugins/lasso": {
        readme: { kind: "unreadable", text: "Its README could not be read. The log says why." },
    },
};

export function mockAboutOf(targetId: string): AddOnAboutPayload {
    return MOCK_ABOUT[targetId] ?? { readme: { kind: "none" } };
}
