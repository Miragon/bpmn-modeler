import { describe, expect, it } from "vitest";

import { collectInlineScriptTasks, readScriptTaskFormat } from "./scriptModel";

/**
 * Builds a moddle-like business object whose `get(name)` reads back the same
 * attributes passed in, mirroring how bpmn-js exposes both namespaced and
 * plain attributes through a single accessor.
 */
function businessObject(attrs: Record<string, unknown>): any {
    return { ...attrs, get: (name: string) => attrs[name] };
}

/** Minimal element-registry double: `getAll` returns the seeded elements. */
function elementRegistry(elements: any[]): any {
    return { getAll: () => elements };
}

describe("readScriptTaskFormat", () => {
    it("prefers camunda:scriptFormat over the plain attribute", () => {
        const bo = businessObject({
            "camunda:scriptFormat": "javascript",
            "scriptFormat": "groovy",
        });
        expect(readScriptTaskFormat(bo)).toBe("javascript");
    });

    it("falls back to the plain scriptFormat when the namespaced one is unset", () => {
        const bo = businessObject({ scriptFormat: "groovy" });
        expect(readScriptTaskFormat(bo)).toBe("groovy");
    });

    it("returns an empty string when neither attribute is present", () => {
        expect(readScriptTaskFormat(businessObject({}))).toBe("");
    });
});

describe("collectInlineScriptTasks", () => {
    it("includes inline script tasks with their id, format, and content", () => {
        const task = {
            id: "Task_1",
            type: "bpmn:ScriptTask",
            businessObject: businessObject({
                "$type": "bpmn:ScriptTask",
                "camunda:scriptFormat": "javascript",
                "script": "print('hi')",
            }),
        };

        expect(collectInlineScriptTasks(elementRegistry([task]))).toEqual([
            { elementId: "Task_1", scriptFormat: "javascript", content: "print('hi')" },
        ]);
    });

    it("skips labels so a task is never collected twice", () => {
        const bo = businessObject({ $type: "bpmn:ScriptTask", script: "x=1" });
        const task = { id: "Task_1", type: "bpmn:ScriptTask", businessObject: bo };
        // A label shares its host's business object; only the shape must count.
        const label = { id: "Task_1_label", type: "label", businessObject: bo };

        const result = collectInlineScriptTasks(elementRegistry([task, label]));
        expect(result).toHaveLength(1);
        expect(result[0].elementId).toBe("Task_1");
    });

    it("skips external scripts that delegate to camunda:resource", () => {
        const task = {
            id: "Task_1",
            type: "bpmn:ScriptTask",
            businessObject: businessObject({
                "$type": "bpmn:ScriptTask",
                "camunda:resource": "deployment://script.js",
            }),
        };
        expect(collectInlineScriptTasks(elementRegistry([task]))).toEqual([]);
    });

    it("collects empty and unset inline scripts as content: '' so every task gets a stub", () => {
        const empty = {
            id: "Task_1",
            type: "bpmn:ScriptTask",
            businessObject: businessObject({
                "$type": "bpmn:ScriptTask",
                "camunda:scriptFormat": "groovy",
                "script": "",
            }),
        };
        const unset = {
            id: "Task_2",
            type: "bpmn:ScriptTask",
            businessObject: businessObject({ $type: "bpmn:ScriptTask" }),
        };
        expect(collectInlineScriptTasks(elementRegistry([empty, unset]))).toEqual([
            { elementId: "Task_1", scriptFormat: "groovy", content: "" },
            { elementId: "Task_2", scriptFormat: "", content: "" },
        ]);
    });

    it("ignores non-script-task elements", () => {
        const gateway = {
            id: "Gateway_1",
            type: "bpmn:ExclusiveGateway",
            businessObject: businessObject({ $type: "bpmn:ExclusiveGateway" }),
        };
        expect(collectInlineScriptTasks(elementRegistry([gateway]))).toEqual([]);
    });
});
