import { afterEach, describe, expect, it, vi } from "vitest";
import { Injector } from "didi";
import { BpmnModdle } from "bpmn-moddle";
import { createClipboardModules, type ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

/**
 * Behavioural spec for the bridge-path clipboard module (`BridgedClipboard`,
 * #1374). The class is private to the lib, so it is exercised through the same
 * DI wiring the webview uses: `createClipboardModules` yields the module, and a
 * didi injector instantiates it against fake bpmn-js services + a real
 * `bpmn-moddle` (the reviver needs genuine type descriptors).
 *
 * The prefixed-JSON payload asserted here is byte-identical to upstream
 * `bpmn-js-native-copy-paste` — that wire compatibility is the point of #1374.
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

function instantiate(bridge: ClipboardBridge): {
    eventBus: FakeEventBus;
    copyPaste: { paste: ReturnType<typeof vi.fn> };
    nativeCopyPaste: { toggle: ReturnType<typeof vi.fn> };
} {
    const eventBus = new FakeEventBus();
    const copyPaste = { paste: vi.fn() };
    const nativeCopyPaste = { toggle: vi.fn() };
    const canvas = { focus: vi.fn() };
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

    return { eventBus, copyPaste, nativeCopyPaste };
}

/** A minimal but real copyTree: one bpmn:Task descriptor at depth 0. */
const TREE = {
    "0": [{ businessObject: { $type: "bpmn:Task", id: "Task_1", name: "Do work" } }],
};

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("BridgedClipboard", () => {
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
