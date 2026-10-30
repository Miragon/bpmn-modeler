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
                errors: [`Templates for ${type} cannot be previewed yet.`],
            });
        },
    );

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
