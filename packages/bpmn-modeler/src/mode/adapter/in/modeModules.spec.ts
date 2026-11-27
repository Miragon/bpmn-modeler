import { describe, it, expect } from "vitest";
import {
    SURFACE_MODE_CHANGED,
    SURFACE_MODE_SERVICE,
    type SurfaceModeChangedEvent,
} from "@miragon/bpmn-modeler-types/domain";

import { SURFACE_ROOTS } from "../../../kernel/domain/kernelNames";
import { ModeAttribute } from "./modeModules";

function attributeHarness(withSurfaceMode: boolean) {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    const extraRoot = document.createElement("div");
    const configContainer = document.createElement("div");
    const listeners: Record<string, Array<(event: SurfaceModeChangedEvent) => void>> = {};
    const eventBus = {
        on: (event: string, listener: (event: SurfaceModeChangedEvent) => void) => {
            (listeners[event] ??= []).push(listener);
        },
    };
    const services: Record<string, unknown> = {
        "config.container": configContainer,
        "config.propertiesPanel": { parent: configContainer },
        [SURFACE_ROOTS]: [container, panel, extraRoot],
        [SURFACE_MODE_SERVICE]: withSurfaceMode ? { get: () => "implement" } : null,
    };
    const injector = {
        get: <T>(name: string, _strict: false): T | null => (services[name] ?? null) as T | null,
    };
    new ModeAttribute(eventBus, injector);
    const announce = (mode: "design" | "implement"): void => {
        (listeners[SURFACE_MODE_CHANGED] ?? []).forEach((listener) => listener({ mode }));
    };
    const attributes = (): Array<string | null> =>
        [container, panel, extraRoot, configContainer].map((root) =>
            root.getAttribute("data-bpmn-mode"),
        );
    return { announce, attributes, listeners };
}

describe("ModeAttribute", () => {
    it("marks every surface root with each new mode, and nothing it reads from the config", () => {
        const { announce, attributes } = attributeHarness(true);

        announce("design");
        expect(attributes()).toEqual(["design", "design", "design", null]);

        announce("implement");
        expect(attributes()).toEqual(["implement", "implement", "implement", null]);
    });

    it("leaves the roots alone until the mode changes", () => {
        const { attributes } = attributeHarness(true);

        expect(attributes()).toEqual([null, null, null, null]);
    });

    it("listens to nothing on a surface without a mode", () => {
        const { listeners } = attributeHarness(false);

        expect(listeners).toEqual({});
    });
});
