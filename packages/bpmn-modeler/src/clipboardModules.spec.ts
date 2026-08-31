import { describe, it, expect } from "vitest";
import { createClipboardModules, type ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

/**
 * Contract of the clipboard-override factory. The two DI modules and the value
 * bindings are the whole surface bootstrap/createModeler rely on; the
 * `text ?? element` default is what lets the single-bridge public API map onto
 * the two protocol channels a webview host actually needs.
 */

function fakeBridge(): ClipboardBridge {
    return { requestClipboard: () => Promise.resolve(""), writeClipboard: () => undefined };
}

describe("createClipboardModules", () => {
    it("returns the two DI modules plus one value binding", () => {
        const modules = createClipboardModules({ element: fakeBridge() }) as Record<
            string,
            unknown
        >[];

        expect(modules).toHaveLength(3);
        expect(modules[0]).toHaveProperty("bridgedClipboard");
        expect(modules[1]).toHaveProperty("labelClipboard");
        expect(modules[2]).toHaveProperty("elementClipboardBridge");
        expect(modules[2]).toHaveProperty("textClipboardBridge");
    });

    it("binds the element bridge to the element clipboard value", () => {
        const element = fakeBridge();

        const [, , values] = createClipboardModules({ element }) as Record<string, unknown[]>[];

        expect(values.elementClipboardBridge).toEqual(["value", element]);
    });

    it("defaults the text bridge to the element bridge when `text` is omitted", () => {
        const element = fakeBridge();

        const [, , values] = createClipboardModules({ element }) as Record<string, unknown[]>[];

        expect(values.textClipboardBridge).toEqual(["value", element]);
        expect(values.textClipboardBridge[1]).toBe(element);
    });

    it("binds distinct bridges when both element and text are supplied", () => {
        const element = fakeBridge();
        const text = fakeBridge();

        const [, , values] = createClipboardModules({ element, text }) as Record<
            string,
            unknown[]
        >[];

        expect(values.elementClipboardBridge[1]).toBe(element);
        expect(values.textClipboardBridge[1]).toBe(text);
    });
});
