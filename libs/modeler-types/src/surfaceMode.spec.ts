import { describe, expect, it } from "vitest";
import {
    defaultMode,
    isModeAvailable,
    planTransition,
    resolveInitialMode,
    type SurfaceMode,
} from "./surfaceMode";

describe("isModeAvailable", () => {
    it("always allows view and design regardless of engine", () => {
        for (const engine of ["c7", "c8", undefined] as const) {
            expect(isModeAvailable("view", engine)).toBe(true);
            expect(isModeAvailable("design", engine)).toBe(true);
        }
    });

    it("allows implement only for a tagged engine", () => {
        expect(isModeAvailable("implement", "c7")).toBe(true);
        expect(isModeAvailable("implement", "c8")).toBe(true);
        expect(isModeAvailable("implement", undefined)).toBe(false);
    });
});

describe("defaultMode", () => {
    it("lands a tagged model in implement", () => {
        expect(defaultMode("c7")).toBe("implement");
        expect(defaultMode("c8")).toBe("implement");
    });

    it("lands an untagged model in design", () => {
        expect(defaultMode(undefined)).toBe("design");
    });

    it("falls back inside the supplied available set", () => {
        // Tagged model, but implement is not offered → design if present.
        expect(defaultMode("c7", ["view", "design"])).toBe("design");
        // Only view offered → view, whatever the engine.
        expect(defaultMode("c7", ["view"])).toBe("view");
        // A single design factory → design.
        expect(defaultMode(undefined, ["design"])).toBe("design");
    });
});

describe("resolveInitialMode", () => {
    it("honours an available requested mode", () => {
        expect(resolveInitialMode("view", "c7")).toBe("view");
        expect(resolveInitialMode("design", undefined)).toBe("design");
        expect(resolveInitialMode("implement", "c8")).toBe("implement");
    });

    it("falls back to the default when the request is unavailable", () => {
        expect(resolveInitialMode("implement", undefined)).toBe("design");
    });

    it("falls back to the default for an absent or unrecognised request", () => {
        expect(resolveInitialMode(null, "c7")).toBe("implement");
        expect(resolveInitialMode(null, undefined)).toBe("design");
        expect(resolveInitialMode("nonsense", "c8")).toBe("implement");
    });

    it("rejects a request outside the supplied available set", () => {
        // Implement is engine-available but not offered by this consumer.
        expect(resolveInitialMode("implement", "c7", ["view", "design"])).toBe("design");
        // A saved view mode, but only design is offered now.
        expect(resolveInitialMode("view", undefined, ["design"])).toBe("design");
    });
});

describe("planTransition", () => {
    const engines = ["c7", "c8"] as const;

    it("is a no-op for the same mode", () => {
        expect(planTransition("view", "view", "c7")).toBe("none");
        expect(planTransition("design", "design", undefined)).toBe("none");
    });

    it("toggles design↔implement on a tagged model", () => {
        for (const engine of engines) {
            expect(planTransition("design", "implement", engine)).toBe("toggle");
            expect(planTransition("implement", "design", engine)).toBe("toggle");
        }
    });

    it("recreates anything involving view", () => {
        const modes: SurfaceMode[] = ["design", "implement"];
        for (const other of modes) {
            expect(planTransition("view", other, "c7")).toBe("recreate");
            expect(planTransition(other, "view", "c7")).toBe("recreate");
        }
    });

    it("recreates design↔implement on an untagged model", () => {
        // implement is unavailable here, but the planner is engine-honest.
        expect(planTransition("design", "implement", undefined)).toBe("recreate");
    });
});
