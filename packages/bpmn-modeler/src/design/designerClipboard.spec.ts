import { afterEach, describe, expect, it, vi } from "vitest";
import { Injector } from "didi";
import { BpmnModdle } from "bpmn-moddle";
import NativeCopyPasteModule from "bpmn-js-native-copy-paste";
import { createClipboardModules, type ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

/**
 * Didi-level contract test for the designer's clipboard wiring. The designer
 * itself cannot boot in jsdom (diagram-js-minimap CJS interop — see ADR 0011 and
 * the createDesigner.spec.ts header), so this asserts the DI contract directly:
 * the bridge path (`BridgedClipboard`) only works because the designer also
 * registers `NativeCopyPasteModule`, whose `nativeCopyPaste` service the bridge
 * disables on construction. Plain bpmn-js does not register that service — the
 * regression this guards is the designer opening to a blank canvas with
 * `No provider for "nativeCopyPaste"`.
 */

/** A fake EventBus with the on/off/fire NativeCopyPaste + BridgedClipboard need. */
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

    off(event: string, handler: (context: unknown) => unknown): void {
        const list = this.handlers.get(event);
        if (!list) return;
        this.handlers.set(
            event,
            list.filter((h) => h !== handler),
        );
    }
}

function bridge(): ClipboardBridge {
    return { requestClipboard: vi.fn().mockResolvedValue(""), writeClipboard: vi.fn() };
}

function designerClipboardInjector(modules: unknown[]): Injector {
    const [BridgedClipboardModule] = createClipboardModules({ element: bridge() });
    return new Injector([
        ...modules,
        BridgedClipboardModule,
        {
            elementClipboardBridge: ["value", bridge()],
            eventBus: ["value", new FakeEventBus()],
            copyPaste: ["value", { paste: vi.fn() }],
            moddle: ["value", BpmnModdle()],
            canvas: ["value", { focus: vi.fn() }],
        },
    ] as never);
}

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("designer clipboard wiring", () => {
    it("resolves the bridged clipboard and disables NativeCopyPaste when NativeCopyPasteModule is registered", () => {
        const injector = designerClipboardInjector([NativeCopyPasteModule]);

        const nativeCopyPaste = injector.get<{ toggle: (active: boolean) => void }>(
            "nativeCopyPaste",
        );
        const toggle = vi.spyOn(nativeCopyPaste, "toggle");

        expect(injector.get("bridgedClipboard")).toBeDefined();
        expect(toggle).toHaveBeenCalledWith(false);
    });

    it("throws No provider for nativeCopyPaste without NativeCopyPasteModule (plain bpmn-js)", () => {
        const injector = designerClipboardInjector([]);

        expect(() => injector.get("bridgedClipboard")).toThrow(/No provider for "nativeCopyPaste"/);
    });
});
