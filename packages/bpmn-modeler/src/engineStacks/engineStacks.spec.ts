import { describe, expect, it, vi } from "vitest";
import { UnsupportedEngineError, type Engine } from "@miragon/bpmn-modeler-types";

const loaded = vi.hoisted(() => ({ c7: vi.fn(), c8: vi.fn() }));

vi.mock("./c7", () => {
    loaded.c7();
    return { c7Stack: { Modeler: class {}, engineModules: ["c7-only"] } };
});
vi.mock("./c8", () => {
    loaded.c8();
    return { c8Stack: { Modeler: class {}, engineModules: [] } };
});

import { loadEngineStack } from "./index";

describe("loadEngineStack", () => {
    it("rejects an unknown engine without loading any stack", async () => {
        await expect(loadEngineStack("c9" as Engine)).rejects.toThrow(UnsupportedEngineError);
        expect(loaded.c7).not.toHaveBeenCalled();
        expect(loaded.c8).not.toHaveBeenCalled();
    });

    it("loads only the requested engine's stack", async () => {
        const stack = await loadEngineStack("c7");

        expect(stack.engineModules).toEqual(["c7-only"]);
        expect(loaded.c7).toHaveBeenCalledOnce();
        expect(loaded.c8).not.toHaveBeenCalled();
    });
});
