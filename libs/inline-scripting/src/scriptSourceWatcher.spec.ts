import { beforeEach, describe, expect, it } from "vitest";

import type { OpenScriptEditorRef } from "@miragon/bpmn-modeler-types";

import { OpenScriptEditorsStore } from "./openScriptEditorsStore";
import {
    SCRIPT_SOURCE_CHANGED_EVENT,
    ScriptSourceChangedEvent,
    ScriptSourceWatcher,
} from "./scriptSourceWatcher";

/**
 * Minimal eventBus double: `on` registers, `fire` dispatches synchronously —
 * mirroring bpmn-js, whose `commandStack.changed` handlers run inside the
 * command's own call stack (which is why `noteApplied` must precede the write).
 */
function createEventBus() {
    const handlers = new Map<string, ((event?: unknown) => void)[]>();
    return {
        on(event: string, handler: (event?: unknown) => void) {
            handlers.set(event, [...(handlers.get(event) ?? []), handler]);
        },
        fire(event: string, payload?: unknown) {
            for (const handler of handlers.get(event) ?? []) {
                handler(payload);
            }
        },
    };
}

function scriptTaskElement(script: string | undefined) {
    // `$type` is required: `readScriptContent` now treats a business object that
    // is not a `bpmn:ScriptTask` as a morphed-away surface (→ undefined).
    return { businessObject: { $type: "bpmn:ScriptTask", script } };
}

const REF: OpenScriptEditorRef = {
    elementId: "Task_1",
    kind: "script-task",
    listenerIndex: undefined,
    fileName: "Task_1.groovy",
};

describe("ScriptSourceWatcher", () => {
    let eventBus: ReturnType<typeof createEventBus>;
    let elements: Map<string, unknown>;
    let store: OpenScriptEditorsStore;
    let watcher: ScriptSourceWatcher;
    let fired: ScriptSourceChangedEvent[];

    beforeEach(() => {
        eventBus = createEventBus();
        elements = new Map([["Task_1", scriptTaskElement("original")]]);
        store = new OpenScriptEditorsStore(eventBus);
        watcher = new ScriptSourceWatcher(
            eventBus,
            { get: (id: string) => elements.get(id) },
            store,
        );
        fired = [];
        eventBus.on(SCRIPT_SOURCE_CHANGED_EVENT, (event) =>
            fired.push(event as ScriptSourceChangedEvent),
        );
    });

    it("reports a model-side change against the open-time baseline", () => {
        store.set([REF]);
        elements.set("Task_1", scriptTaskElement("undone"));

        eventBus.fire("commandStack.changed");

        expect(fired).toEqual([
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                content: "undone",
            },
        ]);
    });

    it("stays silent while the model matches the baseline", () => {
        store.set([REF]);
        eventBus.fire("commandStack.changed");
        expect(fired).toEqual([]);
    });

    it("treats noteApplied content as the new baseline — keystrokes never echo", () => {
        store.set([REF]);

        // BpmnModeler.updateScriptContent: note first, then the moddle write
        // (which fires commandStack.changed synchronously).
        watcher.noteApplied("Task_1", "script-task", undefined, "typed");
        elements.set("Task_1", scriptTaskElement("typed"));
        eventBus.fire("commandStack.changed");

        expect(fired).toEqual([]);
    });

    it("still reports a later undo after a noted keystroke", () => {
        store.set([REF]);
        watcher.noteApplied("Task_1", "script-task", undefined, "typed");
        elements.set("Task_1", scriptTaskElement("typed"));
        eventBus.fire("commandStack.changed");

        // Ctrl+Z on the canvas reverts the keystroke command.
        elements.set("Task_1", scriptTaskElement("original"));
        eventBus.fire("commandStack.changed");

        expect(fired).toEqual([
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                content: "original",
            },
        ]);
    });

    it("ignores noteApplied for scripts that are not open", () => {
        watcher.noteApplied("Task_1", "script-task", undefined, "typed");

        store.set([REF]);
        eventBus.fire("commandStack.changed");

        // The pre-open note must not have created a baseline; the open-time
        // snapshot ("original") is the baseline, so nothing diverged.
        expect(fired).toEqual([]);
    });

    it("reports undefined when the element disappeared, exactly once", () => {
        store.set([REF]);
        elements.delete("Task_1");

        eventBus.fire("commandStack.changed");
        eventBus.fire("commandStack.changed");

        expect(fired).toEqual([
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                content: undefined,
            },
        ]);
    });

    it("maps an unset script-task property to empty content, not deletion", () => {
        store.set([REF]);
        elements.set("Task_1", scriptTaskElement(undefined));

        eventBus.fire("commandStack.changed");

        expect(fired[0].content).toBe("");
    });

    it("also checks on import.done — document reloads bypass the command stack", () => {
        store.set([REF]);
        elements.set("Task_1", scriptTaskElement("reloaded"));

        eventBus.fire("import.done");

        expect(fired[0].content).toBe("reloaded");
    });

    it("drops baselines for scripts whose editor closed", () => {
        store.set([REF]);
        store.set([]);
        elements.set("Task_1", scriptTaskElement("changed"));

        eventBus.fire("commandStack.changed");

        expect(fired).toEqual([]);
    });

    it("reports a missing listener script surface as deletion", () => {
        const listenerRef: OpenScriptEditorRef = {
            elementId: "Task_2",
            kind: "execution-listener",
            listenerIndex: 0,
            fileName: "Task_2.execution-start.groovy",
        };
        elements.set("Task_2", {
            businessObject: {
                extensionElements: {
                    values: [
                        {
                            $type: "camunda:ExecutionListener",
                            script: { value: "x" },
                        },
                    ],
                },
            },
        });
        store.set([listenerRef]);

        // Undo removed the listener's nested camunda:Script element.
        elements.set("Task_2", {
            businessObject: {
                extensionElements: {
                    values: [{ $type: "camunda:ExecutionListener" }],
                },
            },
        });
        eventBus.fire("commandStack.changed");

        expect(fired).toEqual([
            {
                elementId: "Task_2",
                kind: "execution-listener",
                listenerIndex: 0,
                content: undefined,
            },
        ]);
    });
});
