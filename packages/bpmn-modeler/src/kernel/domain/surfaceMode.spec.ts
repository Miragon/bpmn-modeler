import { describe, expect, it } from "vitest";

import { normalizeMode, surfaceModeChange, type ModelerMode } from "./surfaceMode";

describe("normalizeMode", () => {
    it.each<{ requested: unknown; mode: ModelerMode }>([
        { requested: undefined, mode: "implement" },
        { requested: "implement", mode: "implement" },
        { requested: "design", mode: "design" },
        // A JavaScript caller is not held to the type: what the panel filter reads as Design is Design.
        { requested: "view", mode: "design" },
        { requested: "Implement", mode: "design" },
    ])("opens $requested as $mode", ({ requested, mode }) => {
        expect(normalizeMode(requested as ModelerMode | undefined)).toBe(mode);
    });
});

describe("surfaceModeChange", () => {
    it.each<{ current: ModelerMode; requested: ModelerMode }>([
        { current: "design", requested: "design" },
        { current: "implement", requested: "implement" },
    ])("changes nothing when $requested is asked of a surface in $current", (modes) => {
        expect(surfaceModeChange(modes.current, modes.requested)).toEqual({ kind: "unchanged" });
    });

    it.each<{ current: ModelerMode; requested: ModelerMode }>([
        { current: "design", requested: "implement" },
        { current: "implement", requested: "design" },
    ])("changes a surface in $current to $requested", ({ current, requested }) => {
        expect(surfaceModeChange(current, requested)).toEqual({ kind: "changed", mode: requested });
    });
});
