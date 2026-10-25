import { afterEach, describe, expect, it, vi } from "vitest";
import { Injector } from "didi";
import { BpmnModdle } from "bpmn-moddle";
import { createClipboardModules, type ClipboardBridge } from "./index";
import { createCopyEvent } from "./__fixtures__/clipboardEvents";

/**
 * Behavioural spec for the bridge-path clipboard module (`BridgedClipboard`).
 * The class is private to the lib, so it is exercised through the same DI wiring
 * the webview uses: `createClipboardModules` yields the module, and a didi
 * injector instantiates it against fake bpmn-js services + a real `bpmn-moddle`
 * (the reviver needs genuine type descriptors).
 *
 * The prefixed-JSON payload asserted here is byte-identical to upstream
 * `bpmn-js-native-copy-paste` — that wire compatibility is the point.
 */

const CLIP_PREFIX = "bpmn-js-clip----";

/** A fake EventBus that records handlers and lets a test fire them synchronously. */
class FakeEventBus {
    private readonly handlers = new Map<string, ((context: unknown) => unknown)[]>();

    on(
        event: string,
        priorityOrHandler: unknown,
        maybeHandler?: (context: unknown) => unknown,
    ): void {
        const handler = (maybeHandler ?? priorityOrHandler) as (context: unknown) => unknown;
        const list = this.handlers.get(event) ?? [];
        list.push(handler);
        this.handlers.set(event, list);
    }

    fire(event: string, context: unknown): unknown {
        let result: unknown;
        for (const handler of this.handlers.get(event) ?? []) {
            result = handler(context);
        }
        return result;
    }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function bridgeSpies(clipboardText: string): {
    bridge: ClipboardBridge;
    requestClipboard: ReturnType<typeof vi.fn>;
    writeClipboard: ReturnType<typeof vi.fn>;
} {
    const requestClipboard = vi.fn<() => Promise<string>>().mockResolvedValue(clipboardText);
    const writeClipboard = vi.fn<(text: string) => void>();
    return { bridge: { requestClipboard, writeClipboard }, requestClipboard, writeClipboard };
}

const liveEventBuses: FakeEventBus[] = [];

function instantiate(bridge: ClipboardBridge): {
    eventBus: FakeEventBus;
    copyPaste: { paste: ReturnType<typeof vi.fn> };
    nativeCopyPaste: { toggle: ReturnType<typeof vi.fn> };
    canvas: { focus: ReturnType<typeof vi.fn>; isFocused: ReturnType<typeof vi.fn> };
} {
    const eventBus = new FakeEventBus();
    liveEventBuses.push(eventBus);
    const copyPaste = { paste: vi.fn() };
    const nativeCopyPaste = { toggle: vi.fn() };
    // Element copies only start from a keydown on the focused canvas.
    const canvas = { focus: vi.fn(), isFocused: vi.fn(() => true) };
    const moddle = BpmnModdle();

    const [BridgedClipboardModule] = createClipboardModules({ element: bridge });

    const injector = new Injector([
        BridgedClipboardModule,
        {
            elementClipboardBridge: ["value", bridge],
            eventBus: ["value", eventBus],
            copyPaste: ["value", copyPaste],
            moddle: ["value", moddle],
            nativeCopyPaste: ["value", nativeCopyPaste],
            canvas: ["value", canvas],
        },
    ] as never);
    injector.init();

    return { eventBus, copyPaste, nativeCopyPaste, canvas };
}

/** Stands in for VS Code's own webview `copy` handler, which runs after the capture phase. */
function dispatchCopyObservedByHost(target: EventTarget = document.body) {
    const event = createCopyEvent();
    const hostCopyHandler = vi.fn();
    document.addEventListener("copy", hostCopyHandler);
    target.dispatchEvent(event);
    document.removeEventListener("copy", hostCopyHandler);
    return { event, hostCopyHandler };
}

/** A minimal but real copyTree: one bpmn:Task descriptor at depth 0. */
const TREE = {
    "0": [{ businessObject: { $type: "bpmn:Task", id: "Task_1", name: "Do work" } }],
};

const OTHER_TREE = {
    "0": [{ businessObject: { $type: "bpmn:Task", id: "Task_2", name: "Review" } }],
};

afterEach(() => {
    // Detach every instance's document copy listener so no pending payload
    // leaks into the next test.
    liveEventBuses.splice(0).forEach((eventBus) => eventBus.fire("diagram.destroy", {}));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
});

describe("BridgedClipboard", () => {
    it("removes its capture-phase document copy listener on diagram destroy", () => {
        const addSpy = vi.spyOn(document, "addEventListener");
        const removeSpy = vi.spyOn(document, "removeEventListener");

        const { eventBus } = instantiate(bridgeSpies("").bridge);

        const added = addSpy.mock.calls.filter(([type]) => type === "copy");
        expect(added).toHaveLength(1);

        eventBus.fire("diagram.destroy", {});

        const removed = removeSpy.mock.calls.filter(([type]) => type === "copy");
        expect(removed).toHaveLength(1);
        expect(removed[0][1]).toBe(added[0][1]);
        expect(removed[0][2]).toBe(added[0][2]);
    });

    it("disables the native copy-paste layer on construction", () => {
        const { nativeCopyPaste } = instantiate(bridgeSpies("").bridge);
        expect(nativeCopyPaste.toggle).toHaveBeenCalledWith(false);
    });

    it("writes prefixed JSON and marks the copy handled on elementsCopied", () => {
        const { bridge, writeClipboard } = bridgeSpies("");
        const { eventBus } = instantiate(bridge);

        const context: { tree: unknown; hints: { clip?: boolean } } = { tree: TREE, hints: {} };
        eventBus.fire("copyPaste.elementsCopied", context);

        expect(writeClipboard).toHaveBeenCalledWith(CLIP_PREFIX + JSON.stringify(TREE));
        expect(context.hints.clip).toBe(false);
    });

    it("revives prefixed clipboard JSON into copyPaste.paste with the snapshotted context", async () => {
        const { bridge } = bridgeSpies(CLIP_PREFIX + JSON.stringify(TREE));
        const { eventBus, copyPaste } = instantiate(bridge);

        const result = eventBus.fire("copyPaste.pasteElements", { point: { x: 1, y: 2 } });
        expect(result).toBe(false);

        await flush();

        expect(copyPaste.paste).toHaveBeenCalledTimes(1);
        const pasted = copyPaste.paste.mock.calls[0][0] as {
            point: unknown;
            tree: Record<string, { businessObject: { $type: string; set?: unknown } }[]>;
        };
        expect(pasted.point).toEqual({ x: 1, y: 2 });
        // The revived node is a real moddle instance, not the raw descriptor.
        const revived = pasted.tree["0"][0].businessObject;
        expect(revived.$type).toBe("bpmn:Task");
        expect(typeof revived.set).toBe("function");
    });

    it("does nothing when the clipboard text lacks the prefix", async () => {
        const { bridge } = bridgeSpies("just some plain text");
        const { eventBus, copyPaste } = instantiate(bridge);

        eventBus.fire("copyPaste.pasteElements", {});
        await flush();

        expect(copyPaste.paste).not.toHaveBeenCalled();
    });

    it("fails soft on a prefixed but unparseable payload — logs, never throws", async () => {
        const { bridge } = bridgeSpies(CLIP_PREFIX + "not-valid-json{");
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { eventBus, copyPaste } = instantiate(bridge);

        expect(() => eventBus.fire("copyPaste.pasteElements", {})).not.toThrow();
        await flush();

        expect(errorSpy).toHaveBeenCalled();
        expect(copyPaste.paste).not.toHaveBeenCalled();
    });

    it("is a no-op when the paste context already carries a tree (re-triggered paste)", () => {
        const { bridge, requestClipboard } = bridgeSpies(CLIP_PREFIX + JSON.stringify(TREE));
        const { eventBus, copyPaste } = instantiate(bridge);

        const result = eventBus.fire("copyPaste.pasteElements", { tree: TREE });

        expect(result).toBeUndefined();
        expect(requestClipboard).not.toHaveBeenCalled();
        expect(copyPaste.paste).not.toHaveBeenCalled();
    });
});

describe("BridgedClipboard copy event", () => {
    it("puts the copied elements on the clipboard ahead of the host's copy handler", () => {
        const { eventBus } = instantiate(bridgeSpies("").bridge);
        eventBus.fire("copyPaste.elementsCopied", { tree: TREE });

        const { event, hostCopyHandler } = dispatchCopyObservedByHost();

        expect(event.defaultPrevented).toBe(true);
        expect(event.clipboardData.getData("text/plain")).toBe(CLIP_PREFIX + JSON.stringify(TREE));
        expect(hostCopyHandler).not.toHaveBeenCalled();
    });

    it("hands the copied elements to a single copy event only", () => {
        const { eventBus } = instantiate(bridgeSpies("").bridge);
        eventBus.fire("copyPaste.elementsCopied", { tree: TREE });
        dispatchCopyObservedByHost();

        const { event, hostCopyHandler } = dispatchCopyObservedByHost();

        expect(event.defaultPrevented).toBe(false);
        expect(event.clipboardData.getData("text/plain")).toBe("");
        expect(hostCopyHandler).toHaveBeenCalledTimes(1);
    });

    it("leaves a plain text copy alone when no elements were copied", () => {
        instantiate(bridgeSpies("").bridge);

        const { event, hostCopyHandler } = dispatchCopyObservedByHost();

        expect(event.defaultPrevented).toBe(false);
        expect(hostCopyHandler).toHaveBeenCalledTimes(1);
    });

    // IntelliJ and VS Code for the Web fire no copy event for the canvas Cmd+C,
    // so only the bridge write delivers those elements and the payload stays parked.
    it.each([
        ["a text field", () => document.createElement("input")],
        ["static text", () => Object.assign(document.createElement("p"), { textContent: "Docs" })],
        ["a select", () => document.createElement("select")],
    ])(
        "lets a copy from %s through after an element copy that fired no copy event",
        (_, createCopySource) => {
            const { eventBus, canvas } = instantiate(bridgeSpies("").bridge);
            eventBus.fire("copyPaste.elementsCopied", { tree: TREE });
            const copySource = createCopySource();
            document.body.appendChild(copySource);
            canvas.isFocused.mockReturnValue(false);

            const { event, hostCopyHandler } = dispatchCopyObservedByHost(copySource);

            expect(event.defaultPrevented).toBe(false);
            expect(event.clipboardData.getData("text/plain")).toBe("");
            expect(hostCopyHandler).toHaveBeenCalledTimes(1);
        },
    );

    it("drops elements parked by a canvas copy once the user copies elsewhere", () => {
        const { eventBus, canvas } = instantiate(bridgeSpies("").bridge);
        eventBus.fire("copyPaste.elementsCopied", { tree: TREE });
        canvas.isFocused.mockReturnValue(false);
        dispatchCopyObservedByHost();
        canvas.isFocused.mockReturnValue(true);

        const { event } = dispatchCopyObservedByHost();

        expect(event.defaultPrevented).toBe(false);
    });

    it("puts canvas-copied elements on the clipboard while a text selection lingers in a field", () => {
        const { eventBus } = instantiate(bridgeSpies("").bridge);
        const nameField = document.createElement("input");
        document.body.appendChild(nameField);
        eventBus.fire("copyPaste.elementsCopied", { tree: TREE });

        // Clicking the user-select:none canvas moves focus but keeps the field's
        // selection, and Chromium targets the copy event at that selection.
        const { event, hostCopyHandler } = dispatchCopyObservedByHost(nameField);

        expect(event.defaultPrevented).toBe(true);
        expect(event.clipboardData.getData("text/plain")).toBe(CLIP_PREFIX + JSON.stringify(TREE));
        expect(hostCopyHandler).not.toHaveBeenCalled();
    });

    it("lets the focused modeler answer a copy when several share the document", () => {
        const unfocusedModeler = instantiate(bridgeSpies("").bridge);
        const focusedModeler = instantiate(bridgeSpies("").bridge);
        unfocusedModeler.eventBus.fire("copyPaste.elementsCopied", { tree: TREE });
        unfocusedModeler.canvas.isFocused.mockReturnValue(false);
        focusedModeler.eventBus.fire("copyPaste.elementsCopied", { tree: OTHER_TREE });

        const { event } = dispatchCopyObservedByHost();

        expect(event.clipboardData.getData("text/plain")).toBe(
            CLIP_PREFIX + JSON.stringify(OTHER_TREE),
        );
    });

    it("marks the copy handled even when bpmn-js passed no hints", () => {
        const { eventBus } = instantiate(bridgeSpies("").bridge);
        const context: { tree: unknown; hints?: { clip?: boolean } } = { tree: TREE };

        eventBus.fire("copyPaste.elementsCopied", context);

        expect(context.hints).toEqual({ clip: false });
    });
});

describe("BridgedClipboard focus repair", () => {
    function selectionChangedWhileWebviewFocused(webviewHasFocus: boolean) {
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        });
        vi.spyOn(document, "hasFocus").mockReturnValue(webviewHasFocus);
        const { eventBus, canvas } = instantiate(bridgeSpies("").bridge);
        return {
            canvas,
            changeSelection: () => eventBus.fire("selection.changed", {}),
        };
    }

    it("returns focus to the canvas after a selection change so Cmd+C keeps working", () => {
        const { canvas, changeSelection } = selectionChangedWhileWebviewFocused(true);

        changeSelection();

        expect(canvas.focus).toHaveBeenCalledTimes(1);
    });

    it("never pulls focus out of another pane, e.g. a side-by-side text editor", () => {
        const { canvas, changeSelection } = selectionChangedWhileWebviewFocused(false);

        changeSelection();

        expect(canvas.focus).not.toHaveBeenCalled();
    });

    it.each([
        ["an input", () => document.createElement("input")],
        ["a textarea", () => document.createElement("textarea")],
        [
            "a contenteditable element",
            () => {
                const editable = document.createElement("div");
                editable.tabIndex = 0;
                // jsdom does not implement isContentEditable.
                Object.defineProperty(editable, "isContentEditable", { value: true });
                return editable;
            },
        ],
    ])("leaves focus in %s the user is typing in", (_, createField) => {
        const { canvas, changeSelection } = selectionChangedWhileWebviewFocused(true);
        const field = createField();
        document.body.appendChild(field);
        field.focus();

        changeSelection();

        expect(canvas.focus).not.toHaveBeenCalled();
    });
});
