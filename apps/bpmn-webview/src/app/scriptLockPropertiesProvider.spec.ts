import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenScriptEditorsStore } from "./openScriptEditorsStore";
import { ScriptLockPropertiesProvider } from "./scriptLockPropertiesProvider";
import { OPEN_SCRIPT_EDITOR_EVENT } from "./scriptTaskContextPad";

/**
 * The provider's `getGroups` is a pure groups→groups transform: given the
 * stock Camunda groups and the open-script set, it swaps the script entry's
 * component for the locked renderer. Tested here without a live modeler by
 * feeding fixture groups shaped exactly like the stock provider's output.
 */

const ORIGINAL_SCRIPT_COMPONENT = () => null;

function scriptTaskGroups() {
    return [
        {
            id: "CamundaPlatform__Script",
            entries: [{ id: "scriptValue", component: ORIGINAL_SCRIPT_COMPONENT }],
        },
    ];
}

function listenerGroups() {
    return [
        {
            id: "CamundaPlatform__ExecutionListener",
            items: [
                {
                    id: "Task_1-executionListener-0",
                    entries: [
                        {
                            id: "Task_1-executionListener-0scriptValue",
                            component: ORIGINAL_SCRIPT_COMPONENT,
                            script: {
                                get: (key: string) =>
                                    key === "value"
                                        ? "listener code"
                                        : key === "scriptFormat"
                                          ? "groovy"
                                          : undefined,
                            },
                        },
                    ],
                },
            ],
        },
    ];
}

function scriptTaskElement() {
    return {
        id: "Task_1",
        businessObject: {
            script: "task code",
            get: (key: string) => (key === "scriptFormat" ? "javascript" : undefined),
        },
    };
}

function listenerElement() {
    return {
        id: "Task_1",
        businessObject: {
            extensionElements: {
                values: [
                    {
                        $type: "camunda:ExecutionListener",
                        get: (key: string) => (key === "event" ? "start" : undefined),
                        script: {
                            get: (key: string) =>
                                key === "value"
                                    ? "listener code"
                                    : key === "scriptFormat"
                                      ? "groovy"
                                      : undefined,
                        },
                    },
                ],
            },
        },
    };
}

let eventBus: { fire: ReturnType<typeof vi.fn> };
let store: OpenScriptEditorsStore;
let provider: ScriptLockPropertiesProvider;

beforeEach(() => {
    eventBus = { fire: vi.fn() };
    store = new OpenScriptEditorsStore(eventBus);
    provider = new ScriptLockPropertiesProvider(
        { registerProvider: vi.fn() },
        store,
        eventBus,
        (template: string) => template,
    );
});

describe("ScriptLockPropertiesProvider (script task)", () => {
    it("leaves the script entry editable when nothing is open", () => {
        const groups = scriptTaskGroups();

        provider.getGroups(scriptTaskElement())(groups);

        expect(groups[0].entries[0].component).toBe(ORIGINAL_SCRIPT_COMPONENT);
    });

    it("swaps the component and attaches the hint when the script is open", () => {
        store.set([
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                fileName: "Task_1.js",
            },
        ]);
        const groups = scriptTaskGroups();

        provider.getGroups(scriptTaskElement())(groups);
        const entry = groups[0].entries[0] as any;

        expect(entry.component).not.toBe(ORIGINAL_SCRIPT_COMPONENT);
        expect(entry.lockHintText).toContain("Task_1.js");
        // The locked field still reflects the live model content.
        expect(entry.lockGetValue()).toBe("task code");
    });

    it("reveal fires the open-editor event with the current model payload", () => {
        store.set([
            {
                elementId: "Task_1",
                kind: "script-task",
                listenerIndex: undefined,
                fileName: "Task_1.js",
            },
        ]);
        const groups = scriptTaskGroups();

        provider.getGroups(scriptTaskElement())(groups);
        (groups[0].entries[0] as any).lockReveal();

        expect(eventBus.fire).toHaveBeenCalledWith(OPEN_SCRIPT_EDITOR_EVENT, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "javascript",
            content: "task code",
        });
    });
});

describe("ScriptLockPropertiesProvider (listener)", () => {
    it("locks the listener's script entry addressed by the item id", () => {
        store.set([
            {
                elementId: "Task_1",
                kind: "execution-listener",
                listenerIndex: 0,
                fileName: "Task_1.execution-start.js",
            },
        ]);
        const groups = listenerGroups();

        provider.getGroups(listenerElement())(groups);
        const entry = (groups[0] as any).items[0].entries[0];

        expect(entry.component).not.toBe(ORIGINAL_SCRIPT_COMPONENT);
        expect(entry.lockGetValue()).toBe("listener code");

        entry.lockReveal();
        expect(eventBus.fire).toHaveBeenCalledWith(OPEN_SCRIPT_EDITOR_EVENT, {
            elementId: "Task_1",
            kind: "execution-listener",
            listenerIndex: 0,
            eventName: "start",
            scriptFormat: "groovy",
            content: "listener code",
        });
    });

    it("leaves a listener entry editable when only a different listener is open", () => {
        store.set([
            {
                elementId: "Task_1",
                kind: "execution-listener",
                listenerIndex: 1,
                fileName: "other.js",
            },
        ]);
        const groups = listenerGroups();

        provider.getGroups(listenerElement())(groups);

        expect((groups[0] as any).items[0].entries[0].component).toBe(ORIGINAL_SCRIPT_COMPONENT);
    });
});

describe("OpenScriptEditorsStore", () => {
    it("fires providersChanged on set so the panel re-renders", () => {
        store.set([]);
        expect(eventBus.fire).toHaveBeenCalledWith("propertiesPanel.providersChanged");
    });

    it("replaces the set wholesale (a removed script no longer reads as open)", () => {
        store.set([
            { elementId: "A", kind: "script-task", listenerIndex: undefined, fileName: "A.js" },
        ]);
        store.set([]);
        expect(store.get("A", "script-task", undefined)).toBeUndefined();
    });
});
