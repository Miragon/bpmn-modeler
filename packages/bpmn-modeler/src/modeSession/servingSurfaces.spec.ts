import { describe, expect, it } from "vitest";
import { SURFACE_MODES, type DetectedEngine } from "@miragon/bpmn-modeler-types";
import type { BpmnModelerHandle } from "../publicApi";
import type { BpmnDesignerHandle } from "../design/publicApi";
import type { BpmnViewerHandle } from "../viewer/publicApi";
import type { SurfaceFactories } from "./publicApi";
import { servingSurfaces } from "./servingSurfaces";

type Factory = keyof SurfaceFactories;

/** Factories whose surface is a description of the call that built it. */
function describingFactories(offered: readonly Factory[]): SurfaceFactories {
    const all: Required<SurfaceFactories> = {
        view: async () => "view" as unknown as BpmnViewerHandle,
        design: async () => "design" as unknown as BpmnDesignerHandle,
        implement: async ({ engine, mode }) =>
            `implement(${engine}, ${mode})` as unknown as BpmnModelerHandle,
    };
    return Object.fromEntries(offered.map((factory) => [factory, all[factory]]));
}

describe("servingSurfaces", () => {
    it.each<{
        model: string;
        engine: DetectedEngine;
        offered: readonly Factory[];
        served: Record<string, string | undefined>;
    }>([
        {
            model: "a tagged model",
            engine: "c7",
            offered: ["view", "design", "implement"],
            served: {
                view: "view",
                design: "implement(c7, design)",
                implement: "implement(c7, implement)",
            },
        },
        {
            model: "a tagged model",
            engine: "c8",
            offered: ["implement"],
            served: {
                view: undefined,
                design: "implement(c8, design)",
                implement: "implement(c8, implement)",
            },
        },
        {
            model: "a tagged model",
            engine: "c7",
            offered: ["view", "design"],
            served: { view: "view", design: "design", implement: undefined },
        },
        {
            model: "an untagged model",
            engine: undefined,
            offered: ["view", "design", "implement"],
            served: { view: "view", design: "design", implement: undefined },
        },
        {
            model: "an untagged model",
            engine: undefined,
            offered: ["implement"],
            served: { view: undefined, design: undefined, implement: undefined },
        },
    ])("serves each mode on $model from $offered", async ({ engine, offered, served }) => {
        const serving = servingSurfaces(describingFactories(offered), engine);
        const context = {
            container: document.createElement("div"),
            engine,
            theme: "light" as const,
        };

        const built = Object.fromEntries(
            await Promise.all(
                SURFACE_MODES.map(async (mode) => [mode, await serving[mode]?.(context)]),
            ),
        );

        expect(built).toEqual(served);
    });
});
