import { describe, expect, it, vi } from "vitest";
import DiagramPalette from "diagram-js/lib/features/palette/Palette";

import { needsPaletteCollapse, PaletteLayoutFix } from "./PaletteLayoutFix";

const entries = Object.fromEntries([
    ...Array.from({ length: 15 }, (_, index) => [`entry-${index}`, {}]),
    ["tool-separator", { separator: true }],
]);

describe("needsPaletteCollapse", () => {
    it("keeps the full-height palette while all rendered entries still fit", () => {
        expect(needsPaletteCollapse(769, entries)).toBe(false);
        expect(needsPaletteCollapse(756, entries)).toBe(false);
    });

    it("uses two columns once the rendered entries no longer fit", () => {
        expect(needsPaletteCollapse(755, entries)).toBe(true);
    });
});

describe("PaletteLayoutFix", () => {
    it("replaces the vendor collapse heuristic", () => {
        const palette: ConstructorParameters<typeof PaletteLayoutFix>[0] = {
            _needsCollapse: (_availableHeight, _entries) => true,
        };

        new PaletteLayoutFix(palette);

        expect(palette._needsCollapse!(769, entries)).toBe(false);
    });

    it("matches the installed diagram-js palette contract", () => {
        const eventBus = { on: vi.fn() };
        const palette = new DiagramPalette(
            eventBus as never,
            {} as never,
        ) as unknown as ConstructorParameters<typeof PaletteLayoutFix>[0];

        expect(typeof palette._needsCollapse).toBe("function");
        new PaletteLayoutFix(palette);
        expect(palette._needsCollapse!(769, entries)).toBe(false);
    });

    it("warns without breaking modeler startup when the private hook changes", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        new PaletteLayoutFix({} as ConstructorParameters<typeof PaletteLayoutFix>[0]);

        expect(warn).toHaveBeenCalledWith(
            "[bpmn-modeler] Unable to apply the palette layout correction.",
        );
        warn.mockRestore();
    });
});
