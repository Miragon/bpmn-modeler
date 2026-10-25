import { describe, expect, it } from "vitest";

import { resolveScriptBodyTarget, type ScriptHolder } from "./scriptBodyTarget";

// Case names mirror inline-scripting's `resolveScriptWriteTarget` spec so drift
// between the two addressing rules shows up side by side.
describe("resolveScriptBodyTarget", () => {
    function listener($type: string, value?: string) {
        return value === undefined ? { $type } : { $type, script: { value } };
    }

    const classBasedExecutionListener = listener("camunda:ExecutionListener");
    const inlineExecutionListener = listener("camunda:ExecutionListener", "execution()");
    const inlineTaskListener = listener("camunda:TaskListener", "task()");
    // Interleaved types: indices count only the listeners of the addressed type,
    // the way the properties panel numbers them.
    const userTask: ScriptHolder = {
        $type: "bpmn:UserTask",
        extensionElements: {
            values: [classBasedExecutionListener, inlineTaskListener, inlineExecutionListener],
        },
    };

    it.each([
        ["an inline script", { $type: "bpmn:ScriptTask", script: "x" }],
        ["no script yet", { $type: "bpmn:ScriptTask" }],
    ])("writes a script task's content to its own script property with %s", (_case, scriptTask) => {
        expect(resolveScriptBodyTarget(scriptTask, "script-task", undefined)).toEqual({
            holder: scriptTask,
            propertyName: "script",
        });
    });

    it("writes a listener's content to the nested camunda:Script value", () => {
        const executionTarget = resolveScriptBodyTarget(userTask, "execution-listener", 1);
        const taskTarget = resolveScriptBodyTarget(userTask, "task-listener", 0);

        expect(executionTarget?.holder).toBe(inlineExecutionListener.script);
        expect(executionTarget?.propertyName).toBe("value");
        expect(taskTarget?.holder).toBe(inlineTaskListener.script);
        expect(taskTarget?.propertyName).toBe("value");
    });

    it("has no script-task target once the element is no longer a bpmn:ScriptTask", () => {
        const morphedTask: ScriptHolder = { $type: "bpmn:UserTask" };

        expect(resolveScriptBodyTarget(morphedTask, "script-task", undefined)).toBeUndefined();
    });

    it("has no target for a listener without an inline script", () => {
        expect(resolveScriptBodyTarget(userTask, "execution-listener", 0)).toBeUndefined();
    });

    it.each([
        ["past the last listener of that type", 2],
        ["without a listener index", undefined],
    ])("has no target %s", (_case, listenerIndex) => {
        expect(
            resolveScriptBodyTarget(userTask, "execution-listener", listenerIndex),
        ).toBeUndefined();
    });

    it("has no listener target on an element without extension elements", () => {
        const plainTask: ScriptHolder = { $type: "bpmn:Task" };

        expect(resolveScriptBodyTarget(plainTask, "task-listener", 0)).toBeUndefined();
    });
});
