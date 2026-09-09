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

    it("flattens camunda-5.33 drill-in categories, synthesizing a group from the category", () => {
        // Children lost their `group` marker when the upstream provider nested
        // them; the category entry carries no `action`.
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

    it("routes nested template-category children to the templates panel", () => {
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

    it("drops entries that have neither an action nor children", () => {
        const { bpmnGroups, templates } = classifyEntries({
            "bpmn-tab": { label: "BPMN" },
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
