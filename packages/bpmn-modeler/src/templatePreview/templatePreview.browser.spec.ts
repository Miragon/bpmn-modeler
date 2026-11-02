import { afterEach, describe, expect, it } from "vitest";

import { afterPaint, removeMounts } from "../__fixtures__/surfaceMount";
import { createTemplatePreview, type TemplatePreviewHandle } from "./createTemplatePreview";

/**
 * Pins the preview against the real engine stacks: the template must pass the
 * upstream validator and render through each engine's template provider.
 */

const C7_SCHEMA = "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";
const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";

const C7_MAIL_TASK = {
    $schema: C7_SCHEMA,
    name: "Mail task",
    id: "com.example.mail",
    appliesTo: ["bpmn:ServiceTask"],
    groups: [{ id: "mail", label: "Mail settings" }],
    properties: [
        {
            type: "Hidden",
            value: "${mailDelegate}",
            binding: { type: "property", name: "camunda:delegateExpression" },
        },
        {
            label: "Recipient",
            group: "mail",
            type: "String",
            binding: { type: "camunda:inputParameter", name: "recipient" },
        },
    ],
};

const C8_STATUS_EVENT = {
    $schema: C8_SCHEMA,
    name: "Status update",
    id: "com.example.status",
    version: 3,
    appliesTo: ["bpmn:IntermediateThrowEvent"],
    elementType: {
        value: "bpmn:IntermediateThrowEvent",
        eventDefinition: "bpmn:MessageEventDefinition",
    },
    groups: [{ id: "status", label: "Status settings" }],
    properties: [
        {
            type: "Hidden",
            value: "status-update",
            binding: { type: "zeebe:taskDefinition", property: "type" },
        },
        {
            label: "New status",
            group: "status",
            type: "Dropdown",
            value: "rejected",
            choices: [
                { name: "Rejected", value: "rejected" },
                { name: "Accepted", value: "accepted" },
            ],
            binding: { type: "zeebe:input", name: "status" },
        },
    ],
};

const C7_ALL_GROUPS = {
    ...C7_MAIL_TASK,
    properties: [
        ...C7_MAIL_TASK.properties,
        {
            label: "Subject",
            type: "String",
            binding: { type: "camunda:inputParameter", name: "subject" },
        },
        {
            label: "Untyped input",
            binding: { type: "camunda:inputParameter", name: "untypedInput" },
        },
        {
            label: "Untyped output",
            binding: { type: "camunda:outputParameter", source: "result" },
        },
    ],
    scopes: [
        {
            type: "camunda:Connector",
            connectorId: "mail-connector",
            properties: [
                {
                    label: "Connector field",
                    type: "String",
                    binding: { type: "camunda:inputParameter", name: "connectorField" },
                },
            ],
        },
    ],
};

const C7_EXTERNAL_TASK = {
    $schema: C7_SCHEMA,
    name: "External task",
    id: "com.example.external",
    appliesTo: ["bpmn:ServiceTask"],
    properties: [
        { type: "Hidden", value: "external", binding: { type: "property", name: "camunda:type" } },
        { type: "Hidden", value: "topic", binding: { type: "property", name: "camunda:topic" } },
        {
            label: "Failure",
            value: "failure",
            binding: { type: "camunda:errorEventDefinition", errorRef: "error-1" },
        },
    ],
    scopes: [{ type: "bpmn:Error", id: "error-1", properties: [] }],
};

const previews: TemplatePreviewHandle[] = [];

async function openPreview() {
    const panel = document.createElement("div");
    document.body.appendChild(panel);
    const preview = await createTemplatePreview(panel, { theme: "light" });
    previews.push(preview);
    return { panel, preview };
}

function groupLabels(panel: HTMLElement): (string | null)[] {
    return Array.from(
        panel.querySelectorAll(".bio-properties-panel-group-header-title"),
        (title) => title.textContent,
    );
}

function groupHeader(panel: HTMLElement, groupId: string): HTMLElement | null {
    return panel.querySelector(
        `[data-group-id="group-${groupId}"] .bio-properties-panel-group-header`,
    );
}

function isOpen(panel: HTMLElement, groupId: string): boolean | undefined {
    return groupHeader(panel, groupId)?.classList.contains("open");
}

afterEach(async () => {
    await afterPaint();
    previews.splice(0).forEach((preview) => preview.destroy());
    document.body.replaceChildren();
    removeMounts();
});

describe("createTemplatePreview", () => {
    it("renders a C7 template's groups on a service task", async () => {
        const { panel, preview } = await openPreview();

        const outcome = await preview.show(C7_MAIL_TASK, "c7");
        await afterPaint();

        expect(outcome).toEqual({ rendered: true, errors: [] });
        expect(groupLabels(panel)).toContain("Mail settings");
        expect(panel.textContent).toContain("Mail task");
    });

    it("renders a C8 template on the element type it declares", async () => {
        const { panel, preview } = await openPreview();

        const outcome = await preview.show(C8_STATUS_EVENT, "c8");
        await afterPaint();

        expect(outcome).toEqual({ rendered: true, errors: [] });
        expect(groupLabels(panel)).toContain("Status settings");
        expect(panel.textContent).toContain("Status update");
    });

    it("reports schema errors instead of rendering the template", async () => {
        const { preview } = await openPreview();

        const outcome = await preview.show(
            { ...C7_MAIL_TASK, properties: [{ type: "Bogus", binding: { type: "property" } }] },
            "c7",
        );

        expect(outcome.rendered).toBe(false);
        expect(outcome.errors).not.toHaveLength(0);
    });

    it("reports a template whose fields the validator cannot even read", async () => {
        const { preview } = await openPreview();

        const outcome = await preview.show({ ...C8_STATUS_EVENT, appliesTo: "bpmn:Task" }, "c8");

        expect(outcome.rendered).toBe(false);
        expect(outcome.errors).not.toHaveLength(0);
    });

    it("keeps the last template that rendered when the next one fails", async () => {
        const { panel, preview } = await openPreview();
        await preview.show(C7_MAIL_TASK, "c7");

        const outcome = await preview.show({ ...C8_STATUS_EVENT, appliesTo: "bpmn:Task" }, "c8");
        await afterPaint();

        expect(outcome.rendered).toBe(false);
        expect(groupLabels(panel)).toContain("Mail settings");
    });

    it("previews a template written for a newer engine version", async () => {
        const { panel, preview } = await openPreview();

        const outcome = await preview.show(
            { ...C8_STATUS_EVENT, engines: { camunda: "^99.0" } },
            "c8",
        );
        await afterPaint();

        expect(outcome.rendered).toBe(true);
        expect(groupLabels(panel)).toContain("Status settings");
    });

    it("switches engines between templates", async () => {
        const { panel, preview } = await openPreview();

        await preview.show(C7_MAIL_TASK, "c7");
        const outcome = await preview.show(C8_STATUS_EVENT, "c8");
        await afterPaint();

        expect(outcome.rendered).toBe(true);
        expect(groupLabels(panel)).toContain("Status settings");
        expect(groupLabels(panel)).not.toContain("Mail settings");
    });

    it.each(["bpmn:Process", "bpmn:SequenceFlow"])(
        "explains that %s templates cannot be previewed yet",
        async (type) => {
            const { preview } = await openPreview();

            const outcome = await preview.show(
                { ...C7_MAIL_TASK, appliesTo: [type], properties: [] },
                "c7",
            );

            expect(outcome).toEqual({
                rendered: false,
                errors: [],
            unsupportedType: type,
            });
        },
    );

    describe("the template's groups", () => {
        it.each([
            ["a template group", "ElementTemplates__CustomProperties-mail"],
            ["fields without a group", "ElementTemplates__CustomProperties"],
            ["a scope", "ElementTemplates__CustomGroup-camunda-Connector"],
            ["untyped inputs", "ElementTemplates__Input"],
            ["untyped outputs", "ElementTemplates__Output"],
        ])("opens %s of a C7 template", async (_, groupId) => {
            const { panel, preview } = await openPreview();

            await preview.show(C7_ALL_GROUPS, "c7");
            await afterPaint();

            expect(isOpen(panel, groupId)).toBe(true);
        });

        it("opens an external task template's errors", async () => {
            const { panel, preview } = await openPreview();

            const outcome = await preview.show(C7_EXTERNAL_TASK, "c7");
            await afterPaint();

            expect(outcome).toEqual({ rendered: true, errors: [] });
            expect(isOpen(panel, "ElementTemplates__Error")).toBe(true);
        });

        it.each([
            ["without openByDefault", {}],
            ["with openByDefault off", { openByDefault: false }],
        ])("opens a C8 template's group %s", async (_, group) => {
            const { panel, preview } = await openPreview();

            await preview.show(
                {
                    ...C8_STATUS_EVENT,
                    groups: [{ id: "status", label: "Status settings", ...group }],
                },
                "c8",
            );
            await afterPaint();

            expect(isOpen(panel, "ElementTemplates__CustomProperties-status")).toBe(true);
        });

        it("leaves the panel's other groups as they are", async () => {
            const { panel, preview } = await openPreview();

            await preview.show(C7_MAIL_TASK, "c7");
            await afterPaint();

            expect(isOpen(panel, "documentation")).toBe(false);
        });

        it("keeps a group the user collapsed collapsed while the template is edited", async () => {
            const { panel, preview } = await openPreview();
            const groupId = "ElementTemplates__CustomProperties-mail";
            await preview.show(C7_MAIL_TASK, "c7");
            await afterPaint();

            groupHeader(panel, groupId)?.click();
            await expect.poll(() => isOpen(panel, groupId)).toBe(false);

            await preview.show({ ...C7_MAIL_TASK, name: "Edited mail task" }, "c7");
            await afterPaint();

            expect(panel.textContent).toContain("Edited mail task");
            expect(isOpen(panel, groupId)).toBe(false);
        });

        it("opens a group that appears while the template is edited", async () => {
            const { panel, preview } = await openPreview();
            await preview.show(C7_MAIL_TASK, "c7");
            await afterPaint();

            await preview.show(
                {
                    ...C7_MAIL_TASK,
                    groups: [{ id: "extra", label: "Extra" }],
                    properties: [
                        {
                            label: "Recipient",
                            group: "extra",
                            type: "String",
                            binding: { type: "camunda:inputParameter", name: "recipient" },
                        },
                    ],
                },
                "c7",
            );
            await afterPaint();

            expect(isOpen(panel, "ElementTemplates__CustomProperties-extra")).toBe(true);
        });

        it("opens them again after switching engines", async () => {
            const { panel, preview } = await openPreview();

            await preview.show(C7_MAIL_TASK, "c7");
            await preview.show(C8_STATUS_EVENT, "c8");
            await afterPaint();

            expect(isOpen(panel, "ElementTemplates__CustomProperties-status")).toBe(true);
        });
    });

    it("renders the last of overlapping calls", async () => {
        const { panel, preview } = await openPreview();

        const first = preview.show(C7_MAIL_TASK, "c7");
        const last = preview.show(C8_STATUS_EVENT, "c8");
        await Promise.all([first, last]);
        await afterPaint();

        expect(groupLabels(panel)).toContain("Status settings");
    });

    it("re-renders the shown template in a new language", async () => {
        const { panel, preview } = await openPreview();
        await preview.show(C7_MAIL_TASK, "c7");
        await afterPaint();
        const generalLabel = () => groupLabels(panel)[0];
        const english = generalLabel();

        preview.setLocale("de");
        await expect.poll(generalLabel).not.toBe(english);

        preview.setLocale("en");
        await expect.poll(generalLabel).toBe(english);
    });

    it("themes the panel and removes its canvas on destroy", async () => {
        const { panel, preview } = await openPreview();
        await preview.show(C7_MAIL_TASK, "c7");

        preview.setTheme("dark");
        expect(panel.getAttribute("data-bpmn-theme")).toBe("dark");

        const canvases = () => document.querySelectorAll("[aria-hidden='true'] .djs-container");
        expect(canvases()).toHaveLength(1);
        await afterPaint();
        previews.splice(0).forEach((handle) => handle.destroy());
        expect(canvases()).toHaveLength(0);
    });
});
