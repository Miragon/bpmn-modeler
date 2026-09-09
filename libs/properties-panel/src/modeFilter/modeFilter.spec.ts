import { describe, it, expect, vi } from "vitest";

import { ModeFilterProvider, type PropertiesPanelMode } from "./ModeFilterProvider";

// Minimal group fixtures mimicking the shape real providers emit — an object
// with an `id` and an `entries` (or `items`) array. Only the fields the filter
// reads are populated.
function group(id: string, entryIds: string[] = ["_x"]): any {
    return { id, entries: entryIds.map((eid) => ({ id: eid })) };
}

interface Services {
    mode?: PropertiesPanelMode;
    customIds?: string[];
}

function build(services: Services = {}) {
    const eventBus = { fire: vi.fn() };
    const registry =
        services.customIds !== undefined ? { getIds: () => services.customIds } : false;

    const injector = {
        get(name: string, _strict?: boolean) {
            if (name === "config.propertiesPanelMode") return services.mode;
            if (name === "customPropertiesGroups") return registry;
            return undefined;
        },
    };

    const propertiesPanel = { registerProvider: vi.fn() };
    const provider = new ModeFilterProvider(propertiesPanel as any, eventBus, injector);
    return { provider, eventBus, propertiesPanel };
}

function run(provider: ModeFilterProvider, groups: any[]): any[] {
    return provider.getGroups({})(groups);
}

function ids(groups: any[]): string[] {
    return groups.map((g) => g.id);
}

describe("ModeFilterProvider", () => {
    it("registers at the low mode-filter priority", () => {
        const { propertiesPanel } = build();
        expect(propertiesPanel.registerProvider).toHaveBeenCalledWith(10, expect.anything());
    });

    it("is the identity in implement mode", () => {
        const { provider } = build({ mode: "implement" });
        const groups = [group("general"), group("CamundaPlatform__Implementation"), group("timer")];

        expect(run(provider, groups)).toBe(groups);
    });

    it("defaults to design mode when no mode is configured", () => {
        const { provider } = build();
        expect(provider.getMode()).toBe("design");
    });

    it("keeps neutral timer/multiInstance on a pure /design panel (no engine)", () => {
        const { provider } = build();
        const groups = [
            group("general", ["name", "id", "isExecutable"]),
            group("documentation", ["documentation"]),
            group("multiInstance", ["loopCardinality", "completionCondition"]),
            group("timer", ["timerEventDefinitionType"]),
        ];

        expect(ids(run(provider, groups))).toEqual([
            "general",
            "documentation",
            "multiInstance",
            "timer",
        ]);
    });

    it("strips engine-appended entries from kept neutral groups (C7 general/error)", () => {
        const { provider } = build();
        const groups = [
            group("general", ["name", "id", "versionTag", "isExecutable"]),
            group("error", ["errorRef", "errorName", "errorMessage", "errorCodeVariable"]),
            group("CamundaPlatform__Implementation", ["impl"]),
        ];

        const [general, error] = run(provider, groups);
        expect(general.entries.map((e: any) => e.id)).toEqual(["name", "id", "isExecutable"]);
        expect(error.entries.map((e: any) => e.id)).toEqual(["errorRef", "errorName"]);
    });

    it("drops engine (CamundaPlatform__*) groups and the replaced timer/multiInstance when C7 is present", () => {
        const { provider } = build();
        const groups = [
            group("general", ["name"]),
            group("multiInstance", ["loopCardinality", "collection", "elementVariable"]),
            group("timer", ["timerEventDefinitionType"]),
            group("CamundaPlatform__Implementation", ["impl"]),
            group("CamundaPlatform__Input", ["in"]),
        ];

        expect(ids(run(provider, groups))).toEqual(["general"]);
    });

    it("detects C8 via bare zeebe group ids and drops replaced groups", () => {
        const { provider } = build();
        const groups = [
            group("general", ["name"]),
            group("multiInstance", ["inputCollection"]),
            group("timer", ["timerEventDefinitionType"]),
            group("taskDefinition", ["type"]),
            group("Zeebe__ExtensionProperties", ["prop"]),
        ];

        expect(ids(run(provider, groups))).toEqual(["general"]);
    });

    it("keeps host-registered custom groups through the allowlist", () => {
        const { provider } = build({ customIds: ["myCustomGroup"] });
        const groups = [
            group("general", ["name"]),
            group("myCustomGroup", ["field"]),
            group("CamundaPlatform__Input", ["in"]),
        ];

        expect(ids(run(provider, groups))).toEqual(["general", "myCustomGroup"]);
    });

    it("drops neutral groups left empty after stripping", () => {
        const { provider } = build();
        const groups = [
            group("general", ["name"]),
            // an error group that carried only an engine-appended entry
            group("error", ["errorMessage"]),
        ];

        expect(ids(run(provider, groups))).toEqual(["general"]);
    });

    it("setMode flips behaviour and fires providersChanged", () => {
        const { provider, eventBus } = build();
        const groups = [group("general"), group("CamundaPlatform__Input")];

        // design (default) filters the engine group out
        expect(ids(run(provider, groups))).toEqual(["general"]);

        provider.setMode("implement");
        expect(eventBus.fire).toHaveBeenCalledWith("propertiesPanel.providersChanged");
        expect(provider.getMode()).toBe("implement");
        // implement is the identity
        expect(run(provider, groups)).toBe(groups);
    });

    it("setMode to the current mode does not fire providersChanged", () => {
        const { provider, eventBus } = build();
        eventBus.fire.mockClear();

        provider.setMode("design");

        expect(eventBus.fire).not.toHaveBeenCalled();
    });
});
