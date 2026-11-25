import EventBus from "diagram-js/lib/core/EventBus";
import { Injector, type ModuleDeclaration } from "didi";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SURFACE_ROOTS } from "../../../kernel/domain/kernelNames";
import { clipboard, clipboardModulesOf } from "./clipboardFeature";

const originalExecCommand = Object.getOwnPropertyDescriptor(Document.prototype, "execCommand");
beforeAll(() => {
    Object.defineProperty(Document.prototype, "execCommand", {
        value: vi.fn(() => false),
        configurable: true,
        writable: true,
    });
});
afterAll(() => {
    if (originalExecCommand) {
        Object.defineProperty(Document.prototype, "execCommand", originalExecCommand);
    } else {
        delete (Document.prototype as { execCommand?: unknown }).execCommand;
    }
});
afterEach(() => document.body.replaceChildren());

function makeBridge() {
    return { requestClipboard: vi.fn(async () => ""), writeClipboard: vi.fn() };
}

function providerNames(modules: readonly unknown[]): string[] {
    return modules.flatMap((module) =>
        Object.keys(module as object).filter((key) => !key.startsWith("__")),
    );
}

// Runs only the polyfill module, the feature's last, and pastes into a contenteditable.
function pasteThroughPolyfill(feature: ReturnType<typeof clipboard>): void {
    const root = document.createElement("div");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.tabIndex = -1;
    root.append(editable);
    document.body.append(root);
    const eventBus = new EventBus();
    new Injector([
        { eventBus: ["value", eventBus], [SURFACE_ROOTS]: ["value", [root]] },
        feature.modules.at(-1) as ModuleDeclaration,
    ]).init();
    eventBus.fire("diagram.init");
    editable.focus();
    document.execCommand("paste");
    eventBus.fire("diagram.destroy");
}

describe("clipboard", () => {
    it("lists the bridged clipboard modules, then the text polyfill", () => {
        const feature = clipboard({ bridge: makeBridge() });

        expect(feature.id).toBe("clipboard");
        expect(providerNames(feature.modules)).toContain("elementClipboardBridge");
        expect(providerNames(feature.modules).at(-1)).toBe("clipboardTextPolyfill");
    });

    it("requires native copy and paste, which the bridge module takes over", () => {
        expect(clipboard({ bridge: makeBridge() }).requires).toEqual(["nativeCopyPaste"]);
    });

    it("pastes text through the element bridge when no text bridge is given", () => {
        const bridge = makeBridge();

        pasteThroughPolyfill(clipboard({ bridge }));

        expect(bridge.requestClipboard).toHaveBeenCalledOnce();
    });

    it("pastes text through the text bridge when one is given", () => {
        const bridge = makeBridge();
        const text = makeBridge();

        pasteThroughPolyfill(clipboard({ bridge, text }));

        expect(text.requestClipboard).toHaveBeenCalledOnce();
        expect(bridge.requestClipboard).not.toHaveBeenCalled();
    });
});

describe("clipboardModulesOf", () => {
    it("is empty without a clipboard option, so the native browser clipboard applies", () => {
        expect(clipboardModulesOf(undefined)).toEqual([]);
    });

    it("is the feature's modules with one", () => {
        const bridge = makeBridge();

        expect(providerNames(clipboardModulesOf({ bridge }))).toEqual(
            providerNames(clipboard({ bridge }).modules),
        );
    });
});
