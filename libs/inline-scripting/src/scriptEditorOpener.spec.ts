import { describe, expect, it, vi } from "vitest";

import { ScriptEditorOpener } from "./scriptEditorOpener";
import { OPEN_SCRIPT_EDITOR_EVENT } from "./scriptTaskContextPad";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

function build(elements: Record<string, unknown> = {}) {
    const eventBus = { fire: vi.fn() };
    const elementRegistry = { get: vi.fn((id: string) => elements[id]) };
    // Applies the properties like the real command stack does — the opener
    // reads `listener.script` right after converting.
    const modeling = {
        updateModdleProperties: vi.fn(
            (_element: unknown, target: Record<string, unknown>, props: Record<string, unknown>) =>
                Object.assign(target, props),
        ),
    };
    const bpmnFactory = {
        create: vi.fn((type: string, props: Record<string, unknown>) => ({
            $type: type,
            ...props,
        })),
    };

    const opener = new ScriptEditorOpener(eventBus, elementRegistry, modeling, bpmnFactory);

    return { opener, eventBus, modeling, bpmnFactory };
}

function scriptTaskElement(overrides: Record<string, unknown> = {}) {
    return {
        id: "Task_1",
        businessObject: {
            $type: "bpmn:ScriptTask",
            scriptFormat: "groovy",
            script: "println 'hi'",
            ...overrides,
        },
    };
}

function listenerElement(listeners: unknown[], id = "Task_1") {
    return {
        id,
        businessObject: {
            $type: "bpmn:ServiceTask",
            extensionElements: { values: listeners },
        },
    };
}

function inlineListener(type: string, overrides: Record<string, unknown> = {}) {
    return {
        $type: type,
        event: "start",
        script: { scriptFormat: "javascript", value: "code()" },
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScriptEditorOpener", () => {
    describe("openScriptTask", () => {
        it("fires the open event for a script task", () => {
            const { opener, eventBus } = build();

            const opened = opener.openScriptTask(scriptTaskElement());

            expect(opened).toBe(true);
            expect(eventBus.fire).toHaveBeenCalledWith(OPEN_SCRIPT_EDITOR_EVENT, {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                eventName: undefined,
                scriptFormat: "groovy",
                content: "println 'hi'",
            });
        });

        it("opens an empty document when the script is unset", () => {
            const { opener, eventBus } = build();

            opener.openScriptTask(scriptTaskElement({ script: undefined, scriptFormat: "" }));

            expect(eventBus.fire).toHaveBeenCalledWith(
                OPEN_SCRIPT_EDITOR_EVENT,
                expect.objectContaining({ content: "", scriptFormat: "" }),
            );
        });

        it("returns false for non-script-task elements", () => {
            const { opener, eventBus } = build();

            const opened = opener.openScriptTask({
                id: "Task_1",
                businessObject: { $type: "bpmn:ServiceTask" },
            });

            expect(opened).toBe(false);
            expect(eventBus.fire).not.toHaveBeenCalled();
        });
    });

    describe("openListener", () => {
        it("fires the open event for an inline-script execution listener", () => {
            const element = listenerElement([inlineListener("camunda:ExecutionListener")]);
            const { opener, eventBus, modeling } = build({ Task_1: element });

            const opened = opener.openListener("Task_1", "executionListener", 0);

            expect(opened).toBe(true);
            expect(modeling.updateModdleProperties).not.toHaveBeenCalled();
            expect(eventBus.fire).toHaveBeenCalledWith(OPEN_SCRIPT_EDITOR_EVENT, {
                elementId: "Task_1",
                kind: "execution-listener",
                listenerIndex: 0,
                eventName: "start",
                scriptFormat: "javascript",
                content: "code()",
            });
        });

        it("maps taskListener to the task-listener kind", () => {
            const element = listenerElement([inlineListener("camunda:TaskListener")]);
            const { opener, eventBus } = build({ Task_1: element });

            opener.openListener("Task_1", "taskListener", 0);

            expect(eventBus.fire).toHaveBeenCalledWith(
                OPEN_SCRIPT_EDITOR_EVENT,
                expect.objectContaining({ kind: "task-listener" }),
            );
        });

        it("converts an external-resource script by stripping resource", () => {
            const listener = inlineListener("camunda:ExecutionListener", {
                script: { scriptFormat: "groovy", resource: "ext.groovy" },
            });
            const element = listenerElement([listener]);
            const { opener, modeling } = build({ Task_1: element });

            const opened = opener.openListener("Task_1", "executionListener", 0);

            expect(opened).toBe(true);
            expect(modeling.updateModdleProperties).toHaveBeenCalledWith(element, listener, {
                class: undefined,
                expression: undefined,
                delegateExpression: undefined,
            });
            expect(modeling.updateModdleProperties).toHaveBeenCalledWith(element, listener.script, {
                resource: undefined,
                value: "",
            });
        });

        it("converts a class listener by creating a fresh inline script", () => {
            const listener = {
                $type: "camunda:ExecutionListener",
                event: "end",
                class: "com.example.Listener",
            };
            const element = listenerElement([listener]);
            const { opener, modeling, bpmnFactory } = build({ Task_1: element });

            const opened = opener.openListener("Task_1", "executionListener", 0);

            expect(opened).toBe(true);
            expect(bpmnFactory.create).toHaveBeenCalledWith("camunda:Script", {
                scriptFormat: "",
                value: "",
            });
            expect(modeling.updateModdleProperties).toHaveBeenCalledWith(
                element,
                listener,
                expect.objectContaining({ class: undefined, script: expect.anything() }),
            );
        });

        it("returns false when the element or listener is missing", () => {
            const element = listenerElement([inlineListener("camunda:ExecutionListener")]);
            const { opener, eventBus } = build({ Task_1: element });

            expect(opener.openListener("Unknown", "executionListener", 0)).toBe(false);
            expect(opener.openListener("Task_1", "executionListener", 5)).toBe(false);
            expect(opener.openListener("Task_1", "taskListener", 0)).toBe(false);
            expect(eventBus.fire).not.toHaveBeenCalled();
        });
    });

    describe("openFirstScript", () => {
        it("prefers the script-task inline script over listeners", () => {
            const element = {
                id: "Task_1",
                businessObject: {
                    $type: "bpmn:ScriptTask",
                    script: "inline",
                    extensionElements: {
                        values: [inlineListener("camunda:ExecutionListener")],
                    },
                },
            };
            const { opener, eventBus } = build({ Task_1: element });

            expect(opener.openFirstScript(element)).toBe(true);
            expect(eventBus.fire).toHaveBeenCalledWith(
                OPEN_SCRIPT_EDITOR_EVENT,
                expect.objectContaining({ kind: "script-task" }),
            );
        });

        it("prefers execution listeners over task listeners", () => {
            const element = listenerElement([
                inlineListener("camunda:TaskListener"),
                inlineListener("camunda:ExecutionListener"),
            ]);
            const { opener, eventBus } = build({ Task_1: element });

            expect(opener.openFirstScript(element)).toBe(true);
            expect(eventBus.fire).toHaveBeenCalledWith(
                OPEN_SCRIPT_EDITOR_EVENT,
                expect.objectContaining({ kind: "execution-listener", listenerIndex: 0 }),
            );
        });

        it("falls back to the first task listener", () => {
            const element = listenerElement([inlineListener("camunda:TaskListener")]);
            const { opener, eventBus } = build({ Task_1: element });

            expect(opener.openFirstScript(element)).toBe(true);
            expect(eventBus.fire).toHaveBeenCalledWith(
                OPEN_SCRIPT_EDITOR_EVENT,
                expect.objectContaining({ kind: "task-listener" }),
            );
        });

        it("returns false when the element has no script", () => {
            const { opener, eventBus } = build();

            const opened = opener.openFirstScript({
                id: "Task_1",
                businessObject: { $type: "bpmn:UserTask" },
            });

            expect(opened).toBe(false);
            expect(eventBus.fire).not.toHaveBeenCalled();
        });
    });
});
