/**
 * The custom-group slot (issue #1441).
 *
 * A host registers extra provider group ids here so they survive the design
 * mode filter's allowlist alongside the neutral groups. Hosts keep writing
 * providers against the unchanged upstream `registerProvider` contract — this
 * registry only marks which group ids are host-owned, so the {@link
 * ModeFilterProvider} does not strip them as "engine" groups. A missing registry
 * is treated as an empty set by the filter.
 *
 * Registration fires `propertiesPanel.providersChanged` so a live panel
 * re-derives its groups immediately.
 */
export class CustomGroupsRegistry {
    static $inject = ["eventBus"];

    private readonly ids = new Set<string>();

    constructor(private readonly eventBus: any) {}

    /** Marks the given group ids as host-owned (survive design mode). */
    registerGroups(ids: readonly string[]): void {
        for (const id of ids) {
            this.ids.add(id);
        }
        this.eventBus.fire("propertiesPanel.providersChanged");
    }

    has(id: string): boolean {
        return this.ids.has(id);
    }

    getIds(): string[] {
        return [...this.ids];
    }
}

export const CustomGroupsModule = {
    __init__: ["customPropertiesGroups"],
    customPropertiesGroups: ["type", CustomGroupsRegistry],
};
