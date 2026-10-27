import { describe, expect, it } from "vitest";

import {
    describeScriptSurface,
    findListenerAt,
    resolveScriptWriteTarget,
    type ScriptSurfaceElement,
} from "./scriptSurface";

function listener($type: string, script?: { value: string; scriptFormat: string }) {
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
const userTask = {
    $type: "bpmn:UserTask",
    extensionElements: {
        values: [classBasedExecutionListener, inlineTaskListener, inlineExecutionListener],
    },
};
const plainTask: ScriptSurfaceElement = { $type: "bpmn:Task" };

describe("findListenerAt", () => {
    it.each([
        ["the first execution listener", "execution-listener", 0, classBasedExecutionListener],
        ["the second execution listener", "execution-listener", 1, inlineExecutionListener],
        ["the first task listener", "task-listener", 0, inlineTaskListener],
    ] as const)(
        "finds %s by its index among listeners of that type",
        (_case, kind, index, found) => {
            expect(findListenerAt(userTask, kind, index)).toBe(found);
        },
    );

    it.each([
        ["past the last listener of that type", userTask, 2],
        ["without a listener index", userTask, undefined],
        ["on an element without extension elements", plainTask, 0],
        ["without an element", undefined, 0],
    ])("finds no listener %s", (_case, element, index) => {
        expect(findListenerAt(element, "execution-listener", index)).toBeUndefined();
    });
});

describe("resolveScriptWriteTarget", () => {
    it.each([
        ["content", "an inline script", { $type: "bpmn:ScriptTask", script: "x" }, "script"],
        ["content", "no script yet", { $type: "bpmn:ScriptTask" }, "script"],
        ["format", "an inline script", { $type: "bpmn:ScriptTask", script: "x" }, "scriptFormat"],
    ] as const)(
        "writes a script task's %s with %s to its own property",
        (field, _case, scriptTask, propertyName) => {
            expect(resolveScriptWriteTarget(scriptTask, "script-task", undefined, field)).toEqual({
                moddleElement: scriptTask,
                propertyName,
            });
        },
    );

    it.each([
        ["content", "execution-listener", 1, inlineExecutionListener, "value"],
        ["format", "execution-listener", 1, inlineExecutionListener, "scriptFormat"],
        ["content", "task-listener", 0, inlineTaskListener, "value"],
        ["format", "task-listener", 0, inlineTaskListener, "scriptFormat"],
    ] as const)(
        "writes a listener's %s to the nested camunda:Script of the %s",
        (field, kind, index, owner, propertyName) => {
            const target = resolveScriptWriteTarget(userTask, kind, index, field);

            expect(target?.moddleElement).toBe(owner.script);
            expect(target?.propertyName).toBe(propertyName);
        },
    );

    it.each(["content", "format"] as const)(
        "has no script-task %s target once the element is no longer a bpmn:ScriptTask",
        (field) => {
            // A replace-menu morph keeps the element id, so a late write still resolves it.
            const morphedTask: ScriptSurfaceElement = { $type: "bpmn:UserTask" };

            expect(
                resolveScriptWriteTarget(morphedTask, "script-task", undefined, field),
            ).toBeUndefined();
        },
    );

    it.each([
        ["for a listener without an inline script", userTask, 0],
        ["past the last listener of that type", userTask, 2],
        ["without a listener index", userTask, undefined],
        ["on an element without extension elements", plainTask, 0],
    ])("has no listener target %s", (_case, element, listenerIndex) => {
        expect(
            resolveScriptWriteTarget(element, "execution-listener", listenerIndex, "content"),
        ).toBeUndefined();
    });
});

describe("describeScriptSurface", () => {
    it.each([
        ["script-task", "Task_1"],
        ["execution-listener", "camunda:ExecutionListener #0 on Task_1"],
        ["task-listener", "camunda:TaskListener #0 on Task_1"],
    ] as const)("names the %s surface", (kind, description) => {
        expect(describeScriptSurface("Task_1", kind, 0)).toBe(description);
    });
});
