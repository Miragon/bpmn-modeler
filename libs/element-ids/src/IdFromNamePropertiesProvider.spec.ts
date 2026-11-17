import { h, render } from "@bpmn-io/properties-panel/preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ElementIdProposal, ElementIdsService } from "./ElementIdsService";
import { IdFromNameEntry, type IdFromNameEntryProps } from "./IdFromNameEntry";
import { IdFromNamePropertiesProvider } from "./IdFromNamePropertiesProvider";
import { fallbackTranslate } from "./translate";

const task = { id: "Activity_1", type: "bpmn:Task" };

// `null`: the host has no review of its own.
function provider(withPanel = true, hostReview: (() => void) | null = vi.fn()) {
    const registered: number[] = [];
    const services: Record<string, unknown> = withPanel
        ? { propertiesPanel: { registerProvider: (priority: number) => registered.push(priority) } }
        : {};
    const elementIds = {
        proposalFor: vi.fn(),
        renameFromName: vi.fn(),
        hostReview: vi.fn(() => hostReview ?? undefined),
    };
    const instance = new IdFromNamePropertiesProvider(
        { get: <T>(name: string) => (services[name] ?? null) as T | null },
        elementIds as unknown as ElementIdsService,
    );
    return { instance, registered, elementIds, hostReview };
}

const entryOf = (instance: IdFromNamePropertiesProvider) =>
    instance.getGroups(task)([{ id: "general", entries: [{ id: "id" }] }])[0]
        ?.entries?.[1] as unknown as IdFromNameEntryProps;

describe("IdFromNamePropertiesProvider", () => {
    it("registers below the engine and template providers and above the mode filter", () => {
        expect(provider().registered).toEqual([200]);
    });

    it("loads without a properties panel", () => {
        expect(() => provider(false)).not.toThrow();
    });

    it("puts the entry right after the ID in the general group", () => {
        const groups = [
            { id: "general", entries: [{ id: "name" }, { id: "id" }, { id: "versionTag" }] },
        ];

        const result = provider().instance.getGroups(task)(groups);

        expect(result[0]?.entries?.map((entry) => entry.id)).toEqual([
            "name",
            "id",
            "idFromName",
            "versionTag",
        ]);
    });

    it("leaves a panel without an ID entry alone", () => {
        const groups = [
            { id: "general", entries: [{ id: "name" }] },
            { id: "documentation", entries: [{ id: "id" }] },
        ];

        provider().instance.getGroups(task)(groups);

        expect(groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([
            ["name"],
            ["id"],
        ]);
    });

    it("wires the entry to the services and to the host's own review", () => {
        const { instance, elementIds, hostReview } = provider();
        const entry = entryOf(instance);

        entry.proposalFor(task);
        entry.renameFromName(task);

        expect(elementIds.proposalFor).toHaveBeenCalledWith(task);
        expect(elementIds.renameFromName).toHaveBeenCalledWith(task);
        expect(entry.openReview).toBe(hostReview);
    });

    it("offers no review of the whole diagram where the host has no panel for it", () => {
        expect(entryOf(provider(true, null).instance).openReview).toBeUndefined();
    });
});

describe("IdFromNameEntry", () => {
    let container: HTMLElement | undefined;

    afterEach(() => {
        if (container) {
            render(null, container);
            container.remove();
        }
    });

    function mount(
        status: ElementIdProposal["status"] | undefined,
        openReview: (() => void) | null = vi.fn(),
    ) {
        container = document.createElement("div");
        document.body.appendChild(container);
        const props: IdFromNameEntryProps = {
            element: task,
            proposalFor: () =>
                status === undefined
                    ? undefined
                    : ({
                          status,
                          newId: status === "rename" ? "Task_Check" : undefined,
                      } as ElementIdProposal),
            renameFromName: vi.fn(),
            openReview: openReview ?? undefined,
            translate: fallbackTranslate,
        };
        act(() => render(h(IdFromNameEntry, props), container!));
        const [generate, review] = [...container.querySelectorAll<HTMLButtonElement>(".eid-link")];
        return { props, generate: generate!, review };
    }

    it("offers the ID the name yields and renames to it", () => {
        const { props, generate } = mount("rename");

        expect(generate.disabled).toBe(false);
        expect(generate.title).toBe("Rename the ID to Task_Check");

        act(() => generate.click());

        expect(props.renameFromName).toHaveBeenCalledWith(task);
    });

    it.each<[ElementIdProposal["status"] | undefined, string]>([
        ["matches", "The ID already follows the name."],
        ["skipped", "Add a name to generate the ID from it."],
        [undefined, "Add a name to generate the ID from it."],
    ])("says why it cannot generate (%s)", (status, reason) => {
        const { generate } = mount(status);

        expect(generate.disabled).toBe(true);
        expect(generate.title).toBe(reason);
    });

    it("opens the host's review of the whole diagram", () => {
        const { props, review } = mount("matches");

        act(() => review!.click());

        expect(review!.textContent).toBe("Review all IDs…");
        expect(props.openReview).toHaveBeenCalled();
    });

    it("shows only Generate from name where the host has no review", () => {
        const { review } = mount("rename", null);

        expect(review).toBeUndefined();
        expect(container!.querySelector(".eid-separator")).toBeNull();
    });
});
