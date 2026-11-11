import { describe, expect, it } from "vitest";

import type { DiagramElementLike } from "./candidates";
import type { ElementIdsService } from "./ElementIdsService";
import { FollowNameBehavior } from "./FollowNameBehavior";
import { labelOf, shape } from "./__fixtures__/diagram";

type Listener = (event: { context: Record<string, unknown> }) => void;

function setUp(followName: boolean) {
    const listeners = new Map<string, Listener>();
    const renamed: string[] = [];
    const elementIds = {
        getSettings: () => ({ style: "typePrefix" as const, followName }),
        renameFromName: (element: DiagramElementLike) => {
            renamed.push(element.id);
            return true;
        },
    } as unknown as ElementIdsService;
    new FollowNameBehavior(
        { on: (event, listener) => listeners.set(event, listener as unknown as Listener) },
        elementIds,
    );
    const fire = (command: string, context: Record<string, unknown>) =>
        listeners.get(`commandStack.${command}.postExecute`)!({ context });
    return { fire, renamed };
}

describe("FollowNameBehavior", () => {
    it("renames a random ID when the name is typed on the canvas", () => {
        const { fire, renamed } = setUp(true);

        fire("element.updateLabel", {
            element: shape("bpmn:Task", "Activity_0x1y2z3", "Check stock"),
        });

        expect(renamed).toEqual(["Activity_0x1y2z3"]);
    });

    it("renames the label's element, not the label", () => {
        const { fire, renamed } = setUp(true);
        const event = shape("bpmn:StartEvent", "Event_0x1y2z3", "Start");

        fire("element.updateLabel", { element: labelOf(event), oldLabel: "" });

        expect(renamed).toEqual(["Event_0x1y2z3"]);
    });

    it("follows an ID generated from the old name when the properties panel changes the name", () => {
        const { fire, renamed } = setUp(true);

        fire("element.updateProperties", {
            element: shape("bpmn:Task", "Activity_CheckStock", "Check inventory"),
            properties: { name: "Check inventory" },
            oldProperties: { name: "Check stock" },
        });

        expect(renamed).toEqual(["Activity_CheckStock"]);
    });

    it("follows a name changed on the element's own business object through its moddle properties", () => {
        const { fire, renamed } = setUp(true);
        const task = shape("bpmn:Task", "Activity_0x1y2z3", "Ship");

        fire("element.updateModdleProperties", {
            element: task,
            moddleElement: task.businessObject,
            properties: { name: "Ship" },
            oldProperties: { name: "" },
        });
        fire("element.updateModdleProperties", {
            element: task,
            moddleElement: { $type: "bpmn:Message" },
            properties: { name: "Order" },
            oldProperties: {},
        });

        expect(renamed).toEqual(["Activity_0x1y2z3"]);
    });

    it.each([
        [
            "an ID someone wrote",
            "element.updateProperties",
            { properties: { name: "B" }, oldProperties: { name: "A" } },
            "checkStock",
        ],
        [
            "a change that is not the name",
            "element.updateProperties",
            { properties: { id: "x" }, oldProperties: {} },
            "Activity_0x1y2z3",
        ],
    ])("leaves %s alone", (_, command, context, id) => {
        const { fire, renamed } = setUp(true);

        fire(command, { element: shape("bpmn:Task", id, "B"), ...context });

        expect(renamed).toEqual([]);
    });

    it("does nothing while the setting is off", () => {
        const { fire, renamed } = setUp(false);

        fire("element.updateLabel", { element: shape("bpmn:Task", "Activity_0x1y2z3", "Check") });

        expect(renamed).toEqual([]);
    });
});
