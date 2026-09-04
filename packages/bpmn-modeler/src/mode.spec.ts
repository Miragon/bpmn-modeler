import { describe, it, expect, vi } from "vitest";
import { applyMode, normalizeMode, MODE_ATTRIBUTE, type ModePorts, type ModelerMode } from "./mode";

/**
 * A recording double for {@link ModePorts}: holds a mutable filter mode (as the
 * real `propertiesPanelModeFilter` does) and counts every port call, so the
 * orchestration invariants — idempotence, call order, the design-only
 * token-simulation stop — are asserted without a live modeler.
 */
function createPorts(initial: ModelerMode) {
    const calls: string[] = [];
    let filterMode = initial;
    const onModeChanged = vi.fn<(mode: ModelerMode) => void>();
    const ports: ModePorts = {
        getFilterMode: () => filterMode,
        setFilterMode: (mode) => {
            filterMode = mode;
            calls.push(`setFilterMode:${mode}`);
        },
        stopTokenSimulation: () => calls.push("stopTokenSimulation"),
        setModeAttribute: (mode) => calls.push(`setModeAttribute:${mode}`),
        onModeChanged,
    };
    return { ports, calls, onModeChanged, getFilterMode: () => filterMode };
}

describe("normalizeMode", () => {
    it("defaults an absent mode to implement (never design)", () => {
        expect(normalizeMode(undefined)).toBe("implement");
    });

    it("passes an explicit mode through", () => {
        expect(normalizeMode("design")).toBe("design");
        expect(normalizeMode("implement")).toBe("implement");
    });
});

describe("applyMode", () => {
    it("is a no-op when the filter already holds the target mode", () => {
        const { ports, calls, onModeChanged } = createPorts("implement");
        applyMode(ports, "implement");
        expect(calls).toEqual([]);
        expect(onModeChanged).not.toHaveBeenCalled();
    });

    it("entering design flips the filter, stops token simulation, stamps, then notifies", () => {
        const { ports, calls, onModeChanged } = createPorts("implement");
        applyMode(ports, "design");
        expect(calls).toEqual([
            "setFilterMode:design",
            "stopTokenSimulation",
            "setModeAttribute:design",
        ]);
        expect(onModeChanged).toHaveBeenCalledTimes(1);
        expect(onModeChanged).toHaveBeenCalledWith("design");
    });

    it("entering implement flips the filter and stamps, but never stops token simulation", () => {
        const { ports, calls, onModeChanged } = createPorts("design");
        applyMode(ports, "implement");
        expect(calls).toEqual(["setFilterMode:implement", "setModeAttribute:implement"]);
        expect(calls).not.toContain("stopTokenSimulation");
        expect(onModeChanged).toHaveBeenCalledTimes(1);
        expect(onModeChanged).toHaveBeenCalledWith("implement");
    });

    it("stamps the attribute in both modes", () => {
        const design = createPorts("implement");
        applyMode(design.ports, "design");
        expect(design.calls).toContain("setModeAttribute:design");

        const implement = createPorts("design");
        applyMode(implement.ports, "implement");
        expect(implement.calls).toContain("setModeAttribute:implement");
    });

    it("does not re-fire the attribute stamp or callback on a redundant call", () => {
        const { ports, calls, onModeChanged } = createPorts("implement");
        applyMode(ports, "design");
        calls.length = 0;
        onModeChanged.mockClear();

        applyMode(ports, "design");
        expect(calls).toEqual([]);
        expect(onModeChanged).not.toHaveBeenCalled();
    });

    it("tolerates a missing onModeChanged", () => {
        const { ports } = createPorts("implement");
        const { onModeChanged: _omit, ...portsWithoutCallback } = ports as ModePorts & {
            onModeChanged?: unknown;
        };
        expect(() => applyMode(portsWithoutCallback, "design")).not.toThrow();
    });

    it("MODE_ATTRIBUTE mirrors the theme attribute naming", () => {
        expect(MODE_ATTRIBUTE).toBe("data-bpmn-mode");
    });
});
