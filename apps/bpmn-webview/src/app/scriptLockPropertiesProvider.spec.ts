import { beforeEach, describe, expect, it, vi } from "vitest";

import { OpenScriptEditorsStore } from "./openScriptEditorsStore";
import { LockedScriptEntry, ScriptLockPropertiesProvider } from "./scriptLockPropertiesProvider";
import { OPEN_SCRIPT_EDITOR_EVENT } from "./scriptTaskContextPad";

/**
 * The locked entry is a hook-free renderer, so its returned preact vnode tree
 * can be walked directly — no DOM, no render host. These helpers collect nodes
 * from that tree so the component tests below assert on the actual markup
 * (readOnly textarea, badge, hint) that the crash previously hid.
 */
function childrenOf(node: any): any[] {
    const kids = node?.props?.children;
    return Array.isArray(kids) ? kids : kids != null ? [kids] : [];
}

function walkVNodes(root: any, visit: (node: any) => void): void {
    if (root == null || typeof root !== "object") {
        return;
    }
    visit(root);
    for (const child of childrenOf(root)) {
        walkVNodes(child, visit);
    }
}

function findByType(root: any, type: string): any[] {
    const found: any[] = [];
    walkVNodes(root, (node) => {
        if (node && node.type === type) {
            found.push(node);
        }
    });
    return found;
}

function textContentOf(root: any): string {
    let text = "";
    // walkVNodes only descends into element nodes, so primitive (string/number)
    // children are collected here from each element's child list.
    walkVNodes(root, (node) => {
        for (const child of childrenOf(node)) {
            if (typeof child === "string" || typeof child === "number") {
                text += child;
            }
        }
    });
    return text;
}

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

describe("LockedScriptEntry (rendered vnode tree)", () => {
    // Build a locked entry through the provider so the component receives the
    // exact props the panel would spread onto it.
    function lockedEntry() {
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
        return groups[0].entries[0] as any;
    }

    it("renders a read-only textarea carrying the live script value", () => {
        const tree = LockedScriptEntry(lockedEntry());
        const textareas = findByType(tree, "textarea");

        expect(textareas).toHaveLength(1);
        const textarea = textareas[0];
        expect(textarea.props.readOnly).toBe(true);
        // A `disabled` textarea is unselectable in Chromium, defeating copy.
        expect(textarea.props.disabled).toBeUndefined();
        expect(textarea.props.class).toContain("bio-properties-panel-input-monospace");
        expect(textarea.props.value).toBe("task code");
    });

    it("marks the label with the read-only badge", () => {
        const tree = LockedScriptEntry(lockedEntry());
        const labels = findByType(tree, "label");

        expect(labels).toHaveLength(1);
        expect(textContentOf(labels[0])).toContain("Read-only");
    });

    it("renders a hint whose onClick reveals the owning tab", () => {
        const entry = lockedEntry();
        const tree = LockedScriptEntry(entry);
        const hints = findByType(tree, "div").filter((node) =>
            (node.props.class ?? "").includes("script-lock-hint"),
        );

        expect(hints).toHaveLength(1);
        expect(textContentOf(hints[0])).toContain("Task_1.js");

        hints[0].props.onClick();
        expect(eventBus.fire).toHaveBeenCalledWith(
            OPEN_SCRIPT_EDITOR_EVENT,
            expect.objectContaining({ elementId: "Task_1", kind: "script-task" }),
        );
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
