import { describe, expect, it, vi } from "vitest";

import { classifyEntries, executeEntryAction } from "./types";
import type { PopupMenuEntry } from "./types";

const noop = (): void => {};

/** Builds a flat leaf entry with a `group` marker. */
function leaf(label: string, group: { id: string; name: string }): PopupMenuEntry {
    return { label, group, action: noop };
}

describe("classifyEntries", () => {
    it("groups flat entries by their group marker", () => {
        const tasks = { id: "tasks", name: "Tasks" };
        const gateways = { id: "gateways", name: "Gateways" };

        const { bpmnGroups, templates } = classifyEntries({
            "append.user-task": leaf("User Task", tasks),
            "append.service-task": leaf("Service Task", tasks),
            "append.exclusive-gateway": leaf("Exclusive Gateway", gateways),
        });

        expect(templates).toHaveLength(0);
        expect(bpmnGroups).toHaveLength(2);

        const taskGroup = bpmnGroups.find((g) => g.id === "tasks");
        expect(taskGroup?.name).toBe("Tasks");
        expect(taskGroup?.entries.map((e) => e.id)).toEqual([
            "append.user-task",
            "append.service-task",
        ]);
        expect(bpmnGroups.find((g) => g.id === "gateways")?.entries).toHaveLength(1);
    });

    it("flattens drill-in categories, synthesizing a group from the category", () => {
        const { bpmnGroups } = classifyEntries({
            "append-tasks": {
                label: "Tasks",
                className: "bpmn-icon-task",
                entries: {
                    "append.user-task": { label: "User Task", action: noop },
                    "append.service-task": { label: "Service Task", action: noop },
                },
            },
        });

        expect(bpmnGroups).toHaveLength(1);
        expect(bpmnGroups[0]).toMatchObject({ id: "append-tasks", name: "Tasks" });
        expect(bpmnGroups[0].entries.map((e) => e.id)).toEqual([
            "append.user-task",
            "append.service-task",
        ]);
    });

    it("routes template children of a drill-in category to the templates panel", () => {
        const template = {
            id: "my-template",
            appliesTo: [],
        } as never;

        const { templates, bpmnGroups } = classifyEntries(
            {
                "append-templates": {
                    label: "Templates",
                    entries: {
                        "append.template-my-template": {
                            label: "My Template",
                            action: noop,
                        },
                    },
                },
            },
            [template],
        );

        expect(bpmnGroups).toHaveLength(0);
        expect(templates).toHaveLength(1);
        expect(templates[0].id).toBe("append.template-my-template");
        expect(templates[0].template).toBe(template);
    });

    describe("stepped templates", () => {
        const templatesGroup = { id: "templates", name: "Templates" };
        const icon = "data:image/svg+xml;base64,PHN2Zy8+";

        const rest = {
            id: "rest",
            name: "REST",
            description: "Call an API",
            documentationRef: "https://docs.example/rest",
            keywords: ["http"],
            appliesTo: ["bpmn:ServiceTask"],
            properties: [],
            steps: [
                { name: "GET", description: "Fetch a resource", presetId: "get" },
                {
                    name: "Auth",
                    keywords: ["login"],
                    steps: [{ name: "Basic", presetId: "basic" }],
                },
            ],
        };
        const mail = {
            id: "mail",
            name: "Mail",
            appliesTo: ["bpmn:SendTask"],
            properties: [],
            steps: [{ name: "Send", presetId: "send" }],
        };

        // What bpmn-js-create-append-anything's buildEntry emits for `rest` and `mail`.
        const entries = (getAction = noop, basicAction = noop): Record<string, PopupMenuEntry> => ({
            "append.template-rest": {
                label: "REST",
                description: "Call an API",
                documentationRef: "https://docs.example/rest",
                imageUrl: icon,
                search: ["http"],
                group: templatesGroup,
                entries: {
                    "step-0": {
                        label: "GET",
                        description: "Fetch a resource",
                        imageUrl: icon,
                        action: getAction,
                    },
                    "step-1": {
                        label: "Auth",
                        imageUrl: icon,
                        search: ["login"],
                        entries: {
                            "step-0": { label: "Basic", imageUrl: icon, action: basicAction },
                        },
                    },
                },
            },
            "append.template-mail": {
                label: "Mail",
                group: templatesGroup,
                entries: {
                    "step-0": { label: "Send", action: noop },
                },
            },
        });

        it("exposes every preset leaf as a uniquely identified template entry", () => {
            const getAction = vi.fn();
            const basicAction = vi.fn();

            const { templates, bpmnGroups } = classifyEntries(entries(getAction, basicAction), [
                rest,
                mail,
            ] as never);

            expect(bpmnGroups).toHaveLength(0);
            expect(templates.map((t) => [t.id, t.entry.label, t.entry.action])).toEqual([
                ["append.template-rest/step-0", "REST › GET", getAction],
                ["append.template-rest/step-1/step-0", "REST › Auth › Basic", basicAction],
                ["append.template-mail/step-0", "Mail › Send", noop],
            ]);
        });

        it("keeps the template and resolves each leaf's preset", () => {
            const { templates } = classifyEntries(entries(), [rest, mail] as never);

            expect(templates.map((t) => [t.template, t.presetId])).toEqual([
                [rest, "get"],
                [rest, "basic"],
                [mail, "send"],
            ]);
        });

        it("inherits the template's details and its ancestors' search terms", () => {
            const { templates } = classifyEntries(entries(), [rest, mail] as never);
            const basic = templates.find((t) => t.id === "append.template-rest/step-1/step-0");

            expect(basic?.entry).toMatchObject({
                description: "Call an API",
                documentationRef: "https://docs.example/rest",
                search: ["http", "login"],
            });
        });

        it("inherits search terms an ancestor gives as a single string", () => {
            const { templates } = classifyEntries({
                "append.template-mail": {
                    label: "Mail",
                    search: "smtp relay",
                    entries: { "step-0": { label: "Send", search: ["outbox"], action: noop } },
                },
            });

            expect(templates[0].entry.search).toEqual(["smtp relay", "outbox"]);
        });

        it("keeps a step's own description over the inherited one", () => {
            const { templates } = classifyEntries(entries(), [rest, mail] as never);
            const get = templates.find((t) => t.id === "append.template-rest/step-0");

            expect(get?.entry.description).toBe("Fetch a resource");
        });
    });

    it("drops entries that have neither an action nor children", () => {
        const { bpmnGroups, templates } = classifyEntries({
            "append.custom": { label: "Custom" },
            "append.user-task": leaf("User Task", { id: "tasks", name: "Tasks" }),
        });

        expect(templates).toHaveLength(0);
        expect(bpmnGroups).toHaveLength(1);
        expect(bpmnGroups[0].entries).toHaveLength(1);
        expect(bpmnGroups[0].entries[0].id).toBe("append.user-task");
    });
});

describe("executeEntryAction", () => {
    it("does not throw for an undefined action", () => {
        expect(() => executeEntryAction(undefined, new Event("click"))).not.toThrow();
    });

    it("invokes a plain function action", () => {
        const action = vi.fn();
        const event = new Event("click");
        executeEntryAction(action, event);
        expect(action).toHaveBeenCalledWith(event);
    });

    it("invokes the click handler of an object action", () => {
        const click = vi.fn();
        const event = new Event("click");
        executeEntryAction({ click }, event);
        expect(click).toHaveBeenCalledWith(event);
    });
});
