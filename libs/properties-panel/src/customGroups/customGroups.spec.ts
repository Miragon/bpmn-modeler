import { describe, it, expect, vi } from "vitest";

import { CustomGroupsRegistry } from "./CustomGroupsRegistry";

function eventBusStub() {
    return { fire: vi.fn() };
}

describe("CustomGroupsRegistry", () => {
    it("records registered ids and reports membership", () => {
        const registry = new CustomGroupsRegistry(eventBusStub());

        registry.registerGroups(["myGroup", "otherGroup"]);

        expect(registry.has("myGroup")).toBe(true);
        expect(registry.has("otherGroup")).toBe(true);
        expect(registry.has("unknown")).toBe(false);
        expect(registry.getIds().sort()).toEqual(["myGroup", "otherGroup"]);
    });

    it("starts empty", () => {
        const registry = new CustomGroupsRegistry(eventBusStub());

        expect(registry.getIds()).toEqual([]);
        expect(registry.has("anything")).toBe(false);
    });

    it("de-duplicates repeated registrations", () => {
        const registry = new CustomGroupsRegistry(eventBusStub());

        registry.registerGroups(["a"]);
        registry.registerGroups(["a", "b"]);

        expect(registry.getIds().sort()).toEqual(["a", "b"]);
    });

    it("fires providersChanged on registration so a live panel re-derives", () => {
        const eventBus = eventBusStub();
        const registry = new CustomGroupsRegistry(eventBus);

        registry.registerGroups(["a"]);

        expect(eventBus.fire).toHaveBeenCalledWith("propertiesPanel.providersChanged");
    });
});
