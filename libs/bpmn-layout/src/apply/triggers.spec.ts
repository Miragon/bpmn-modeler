import { describe, expect, it, vi } from "vitest";

import { LayoutKeyboard } from "./LayoutKeyboard";
import { LayoutPaletteProvider } from "./LayoutPaletteProvider";

function injector(services: Record<string, unknown>) {
    return { get: (name: string) => services[name] ?? null } as never;
}

function keyboardHarness(services: Record<string, unknown>) {
    let listener: ((context: { keyEvent: KeyboardEvent }) => unknown) | undefined;
    const keyboard = {
        addListener: (fn: (context: { keyEvent: KeyboardEvent }) => unknown) => {
            listener = fn;
        },
    };
    new LayoutKeyboard(keyboard as never, injector(services));
    return {
        press: (init: Partial<KeyboardEvent> & { key: string }) =>
            listener?.({ keyEvent: init as KeyboardEvent }),
        bound: () => listener !== undefined,
    };
}

describe("LayoutKeyboard", () => {
    it("formats on the bare format key", () => {
        const format = vi.fn().mockResolvedValue(undefined);
        const harness = keyboardHarness({ commandStack: {}, bpmnLayouter: { format } });

        expect(harness.press({ key: "l" })).toBe(true);
        expect(format).toHaveBeenCalledOnce();
    });

    it("ignores other keys", () => {
        const format = vi.fn();
        const harness = keyboardHarness({ commandStack: {}, bpmnLayouter: { format } });

        harness.press({ key: "k" });

        expect(format).not.toHaveBeenCalled();
    });

    // Ctrl+L, Cmd+L and friends belong to the browser and the host; claiming
    // them from the canvas would shadow bindings the user expects.
    it.each(["ctrlKey", "metaKey", "altKey", "shiftKey"] as const)(
        "leaves %s combinations alone",
        (modifier) => {
            const format = vi.fn();
            const harness = keyboardHarness({ commandStack: {}, bpmnLayouter: { format } });

            harness.press({ key: "l", [modifier]: true });

            expect(format).not.toHaveBeenCalled();
        },
    );

    it("binds nothing on a surface without a command stack", () => {
        expect(keyboardHarness({}).bound()).toBe(false);
    });
});

describe("LayoutPaletteProvider", () => {
    function paletteHarness(services: Record<string, unknown>) {
        const palette = { registerProvider: vi.fn() };
        const provider = new LayoutPaletteProvider(
            palette as never,
            (template: string) => template,
            injector(services),
        );
        return { palette, provider };
    }

    /** The stock bpmn-js tool group, in its real order. */
    function stockEntries() {
        return {
            "hand-tool": { group: "tools" },
            "lasso-tool": { group: "tools" },
            "space-tool": { group: "tools" },
            "global-connect-tool": { group: "tools" },
            "tool-separator": { group: "tools", separator: true },
            "create.start-event": { group: "event" },
        };
    }

    it("registers itself and contributes one entry to the tool group", () => {
        const format = vi.fn().mockResolvedValue(undefined);
        const { palette, provider } = paletteHarness({
            commandStack: {},
            bpmnLayouter: { format },
        });

        expect(palette.registerProvider).toHaveBeenCalledWith(provider);

        const entries = provider.getPaletteEntries()(stockEntries());
        // The tool group, not an element group: this acts on the whole diagram
        // rather than creating anything.
        expect(entries["format-diagram"].group).toBe("tools");
        // Own SVG in currentColor rather than a borrowed font glyph, and not
        // draggable — it is a click action, not a create tool.
        expect(entries["format-diagram"].html).toContain("currentColor");
        expect(entries["format-diagram"].html).toContain('draggable="false"');
    });

    // Placement, not just membership: bpmn-js closes the tool group with a
    // separator, so an appended entry renders *below* the divider and reads as
    // an element-creation tool. It has to sit before that separator.
    it("places the entry inside the tool group, ahead of its trailing separator", () => {
        const { provider } = paletteHarness({ commandStack: {} });

        const ids = Object.keys(provider.getPaletteEntries()(stockEntries()));

        expect(ids).toEqual([
            "hand-tool",
            "lasso-tool",
            "space-tool",
            "global-connect-tool",
            "format-diagram",
            "tool-separator",
            "create.start-event",
        ]);
    });

    it("falls back to appending when the palette has no connect tool to anchor on", () => {
        const { provider } = paletteHarness({ commandStack: {} });

        const ids = Object.keys(
            provider.getPaletteEntries()({ "hand-tool": { group: "tools" } }),
        );

        expect(ids).toEqual(["hand-tool", "format-diagram"]);
    });

    it("formats when the entry is clicked", () => {
        const format = vi.fn().mockResolvedValue(undefined);
        const { provider } = paletteHarness({ commandStack: {}, bpmnLayouter: { format } });

        provider.getPaletteEntries()(stockEntries())["format-diagram"].action!.click();

        expect(format).toHaveBeenCalledOnce();
    });

    it("registers nothing on a surface without a command stack", () => {
        const { palette } = paletteHarness({});

        expect(palette.registerProvider).not.toHaveBeenCalled();
    });
});
