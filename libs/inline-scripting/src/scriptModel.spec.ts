import { describe, expect, it } from "vitest";

import type {
    Element,
    ElementCollection,
    ElementLookup,
    ListenerModdle,
    ScriptTaskBusinessObject,
} from "./bpmnTypes";
import {
    collectInlineScriptTasks,
    describeScriptSurface,
    readScriptContent,
    readScriptTaskFormat,
    resolveScriptWriteTarget,
} from "./scriptModel";

/**
 * Builds a moddle-like business object whose `get(name)` reads back the same
 * attributes passed in, mirroring how bpmn-js exposes both namespaced and
 * plain attributes through a single accessor.
 */
function businessObject(attrs: Record<string, unknown>): ScriptTaskBusinessObject {
    return { ...attrs, get: (name: string) => attrs[name] } as unknown as ScriptTaskBusinessObject;
}

/** Minimal element-registry double: `getAll` returns the seeded elements. */
function elementRegistry(elements: Element[]): ElementCollection {
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

describe("readScriptContent", () => {
    /** Element-registry double whose `get(id)` returns the single seeded element. */
    function registryWith(element: Element): ElementLookup {
        return { get: (id: string) => (element?.id === id ? element : undefined) };
    }

    it("returns undefined when the element no longer exists", () => {
        const registry = { get: () => undefined };
        expect(readScriptContent(registry, "Task_1", "script-task", undefined)).toBeUndefined();
    });

    it("returns the script content for a live script task", () => {
        const element = {
            id: "Task_1",
            businessObject: { $type: "bpmn:ScriptTask", script: "print('hi')" },
        };
        expect(readScriptContent(registryWith(element), "Task_1", "script-task", undefined)).toBe(
            "print('hi')",
        );
    });

    it("returns '' when a live script task has no inline script yet", () => {
        const element = { id: "Task_1", businessObject: { $type: "bpmn:ScriptTask" } };
        expect(readScriptContent(registryWith(element), "Task_1", "script-task", undefined)).toBe(
            "",
        );
    });

    it("returns undefined when the element morphed away from a script task", () => {
        // Replace-menu morph: the id survives but the ScriptTask surface (and its
        // `script`) is gone — must read as absent so the host closes the tab.
        const element = {
            id: "Task_1",
            businessObject: { $type: "bpmn:ServiceTask" },
        };
        expect(
            readScriptContent(registryWith(element), "Task_1", "script-task", undefined),
        ).toBeUndefined();
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

describe("resolveScriptWriteTarget", () => {
    function listener(
        $type: string,
        script?: { value: string; scriptFormat: string },
    ): ListenerModdle {
        return script ? { $type, script: { $type: "camunda:Script", ...script } } : { $type };
    }

    const classBasedExecutionListener = listener("camunda:ExecutionListener");
    const inlineExecutionListener = listener("camunda:ExecutionListener", {
        value: "execution()",
        scriptFormat: "javascript",
    });
    const inlineTaskListener = listener("camunda:TaskListener", {
        value: "task()",
        scriptFormat: "groovy",
    });
    // Interleaved types: indices count only the listeners of the addressed type,
    // the way the properties panel numbers them.
    const userTask: ScriptTaskBusinessObject = {
        $type: "bpmn:UserTask",
        extensionElements: {
            values: [classBasedExecutionListener, inlineTaskListener, inlineExecutionListener],
        },
    };

    it.each([
        ["content", "script"],
        ["format", "scriptFormat"],
    ] as const)("writes a script task's %s to its own %s property", (field, propertyName) => {
        const scriptTask: ScriptTaskBusinessObject = { $type: "bpmn:ScriptTask", script: "x" };

        expect(resolveScriptWriteTarget(scriptTask, "script-task", undefined, field)).toEqual({
            moddleElement: scriptTask,
            propertyName,
        });
    });

    it.each([
        ["content", "value"],
        ["format", "scriptFormat"],
    ] as const)("writes a listener's %s to the nested camunda:Script %s", (field, propertyName) => {
        const executionTarget = resolveScriptWriteTarget(userTask, "execution-listener", 1, field);
        const taskTarget = resolveScriptWriteTarget(userTask, "task-listener", 0, field);

        expect(executionTarget?.moddleElement).toBe(inlineExecutionListener.script);
        expect(executionTarget?.propertyName).toBe(propertyName);
        expect(taskTarget?.moddleElement).toBe(inlineTaskListener.script);
    });

    it("has no script-task target once the element is no longer a bpmn:ScriptTask", () => {
        // A replace-menu morph keeps the element id, so a late host push still resolves it.
        const morphedTask: ScriptTaskBusinessObject = { $type: "bpmn:UserTask" };

        expect(
            resolveScriptWriteTarget(morphedTask, "script-task", undefined, "content"),
        ).toBeUndefined();
        expect(
            resolveScriptWriteTarget(morphedTask, "script-task", undefined, "format"),
        ).toBeUndefined();
    });

    it("has no target for a listener without an inline script", () => {
        expect(
            resolveScriptWriteTarget(userTask, "execution-listener", 0, "content"),
        ).toBeUndefined();
    });

    it.each([
        ["past the last listener of that type", 2],
        ["without a listener index", undefined],
    ])("has no target %s", (_case, listenerIndex) => {
        expect(
            resolveScriptWriteTarget(userTask, "execution-listener", listenerIndex, "content"),
        ).toBeUndefined();
    });

    it("has no listener target on an element without extension elements", () => {
        const plainTask: ScriptTaskBusinessObject = { $type: "bpmn:Task" };

        expect(resolveScriptWriteTarget(plainTask, "task-listener", 0, "format")).toBeUndefined();
    });
});

describe("describeScriptSurface", () => {
    it("names a script task by its element id", () => {
        expect(describeScriptSurface("Task_1", "script-task", undefined)).toBe("Task_1");
    });

    it.each([
        ["execution-listener", "camunda:ExecutionListener #0 on Task_1"],
        ["task-listener", "camunda:TaskListener #0 on Task_1"],
    ] as const)("names a %s by type, index, and element", (kind, description) => {
        expect(describeScriptSurface("Task_1", kind, 0)).toBe(description);
    });
});
