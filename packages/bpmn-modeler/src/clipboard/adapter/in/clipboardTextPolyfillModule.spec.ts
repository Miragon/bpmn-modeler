import EventBus from "diagram-js/lib/core/EventBus";
import { Injector } from "didi";
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";

import { SURFACE_ROOTS } from "../../../kernel/domain/kernelNames";
import { createClipboardTextPolyfillModule } from "./clipboardTextPolyfillModule";

// jsdom ships no execCommand; the polyfill captures this stub as its native delegate.
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

function fakeDiagram() {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    document.body.append(container, panel);
    const eventBus = new EventBus();
    const bridge = { requestClipboard: vi.fn(async () => ""), writeClipboard: vi.fn() };
    new Injector([
        { eventBus: ["value", eventBus], [SURFACE_ROOTS]: ["value", [container, panel]] },
        createClipboardTextPolyfillModule(bridge),
    ]).init();
    return { eventBus, container, panel, bridge };
}

function editableIn(root: HTMLElement): HTMLElement {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.tabIndex = -1;
    root.append(editable);
    editable.focus();
    return editable;
}

const patched = () => Object.hasOwn(document, "execCommand");

afterEach(() => document.body.replaceChildren());

describe("createClipboardTextPolyfillModule", () => {
    it("routes a contenteditable paste in any surface root through the text bridge", () => {
        const { eventBus, panel, bridge } = fakeDiagram();
        eventBus.fire("diagram.init");
        editableIn(panel);

        document.execCommand("paste");

        expect(bridge.requestClipboard).toHaveBeenCalledOnce();
        eventBus.fire("diagram.destroy");
    });

    it("patches execCommand from diagram.init until diagram.destroy", () => {
        const { eventBus } = fakeDiagram();
        expect(patched()).toBe(false);

        eventBus.fire("diagram.init");
        expect(patched()).toBe(true);

        eventBus.fire("diagram.destroy");
        expect(patched()).toBe(false);
    });

    it("installs nothing when an earlier diagram.init listener throws", () => {
        const { eventBus } = fakeDiagram();
        eventBus.on("diagram.init", () => {
            throw new Error("late poison");
        });

        expect(() => eventBus.fire("diagram.init")).toThrow("late poison");

        expect(patched()).toBe(false);
    });
});
