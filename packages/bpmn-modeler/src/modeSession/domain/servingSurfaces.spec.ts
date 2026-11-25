import { describe, expect, it } from "vitest";
import type { DetectedEngine, SurfaceMode } from "@miragon/bpmn-modeler-types/domain";
import { servingSurfaces, type ServingFactory } from "./servingSurfaces";

describe("servingSurfaces", () => {
    it.each<{
        model: string;
        engine: DetectedEngine;
        offered: readonly SurfaceMode[];
        served: Record<SurfaceMode, ServingFactory | undefined>;
    }>([
        {
            model: "a tagged model",
            engine: "c7",
            offered: ["view", "design", "implement"],
            served: {
                view: { kind: "own", factory: "view" },
                design: { kind: "modeler", engine: "c7", mode: "design" },
                implement: { kind: "modeler", engine: "c7", mode: "implement" },
            },
        },
        {
            model: "a tagged model",
            engine: "c8",
            offered: ["implement"],
            served: {
                view: undefined,
                design: { kind: "modeler", engine: "c8", mode: "design" },
                implement: { kind: "modeler", engine: "c8", mode: "implement" },
            },
        },
        {
            model: "a tagged model",
            engine: "c7",
            offered: ["view", "design"],
            served: {
                view: { kind: "own", factory: "view" },
                design: { kind: "own", factory: "design" },
                implement: undefined,
            },
        },
        {
            model: "an untagged model",
            engine: undefined,
            offered: ["view", "design", "implement"],
            served: {
                view: { kind: "own", factory: "view" },
                design: { kind: "own", factory: "design" },
                implement: undefined,
            },
        },
        {
            model: "an untagged model",
            engine: undefined,
            offered: ["implement"],
            served: { view: undefined, design: undefined, implement: undefined },
        },
    ])("serves each mode on $model from $offered", ({ engine, offered, served }) => {
        expect(servingSurfaces(offered, engine)).toEqual(served);
    });
});
