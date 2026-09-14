/**
 * The design/implement mode filter (issue #1441).
 *
 * A properties provider registered at a very low priority so its groups→groups
 * middleware runs *last* — after the neutral, engine, and template providers
 * have built their groups (base 1000, C7/C8 500, templates 300, scriptLock 250,
 * C8 data 100; a lower number runs later). In `implement` mode it is the
 * identity. In `design` mode it reduces the panel to the engine-neutral surface:
 *
 *   1. keep only neutral group ids + host-registered custom group ids;
 *   2. strip engine-appended entries from the kept neutral groups;
 *   3. when an engine provider ran, drop the wholesale-replaced groups
 *      (`timer` / `multiInstance`) — their neutral entries are not restorable;
 *   4. drop any group left with no entries/items.
 *
 * The mode is switchable at runtime via {@link setMode}, which fires
 * `propertiesPanel.providersChanged` so a live panel re-derives immediately.
 */
import {
    NEUTRAL_GROUP_IDS,
    ENGINE_APPENDED_ENTRY_IDS,
    ENGINE_REPLACED_GROUP_IDS,
    hasEngineGroups,
} from "./engineGroupData";

export type PropertiesPanelMode = "design" | "implement";

// Structural slivers of the bpmn-js-properties-panel group/entry shapes and the
// DI services this provider reads — only the members it touches.
interface PropertiesEntry {
    id?: string;
}
interface PropertiesGroup {
    id: string;
    entries?: PropertiesEntry[];
    items?: unknown[];
}
interface CustomGroupsRegistry {
    getIds(): string[];
}
interface ModeFilterEventBus {
    fire(event: string): void;
}
interface ModeFilterInjector {
    get<T>(name: string, strict: false): T | null;
}
interface PropertiesPanelLike {
    registerProvider(priority: number, provider: unknown): void;
}

/**
 * Lower than every provider priority in the implement graph (C8 data provider
 * at 100 is the current lowest), so this middleware always runs last.
 */
const MODE_FILTER_PRIORITY = 10;

const NEUTRAL_GROUP_ID_SET: ReadonlySet<string> = new Set(NEUTRAL_GROUP_IDS);
const REPLACED_GROUP_ID_SET: ReadonlySet<string> = new Set(ENGINE_REPLACED_GROUP_IDS);

function isEmptyGroup(group: PropertiesGroup): boolean {
    const entries = Array.isArray(group.entries) ? group.entries : [];
    const items = Array.isArray(group.items) ? group.items : [];
    return entries.length === 0 && items.length === 0;
}

export class ModeFilterProvider {
    static $inject = ["propertiesPanel", "eventBus", "injector"];

    private mode: PropertiesPanelMode;

    constructor(
        propertiesPanel: PropertiesPanelLike,
        private readonly eventBus: ModeFilterEventBus,
        private readonly injector: ModeFilterInjector,
    ) {
        const configured = injector.get<string>("config.propertiesPanelMode", false);
        this.mode = configured === "implement" ? "implement" : "design";

        propertiesPanel.registerProvider(MODE_FILTER_PRIORITY, this);
    }

    getMode(): PropertiesPanelMode {
        return this.mode;
    }

    setMode(mode: PropertiesPanelMode): void {
        if (mode === this.mode) {
            return;
        }
        this.mode = mode;
        this.eventBus.fire("propertiesPanel.providersChanged");
    }

    getGroups(_element: unknown) {
        return (groups: PropertiesGroup[]) => {
            if (this.mode === "implement") {
                return groups;
            }
            return this.filterDesignGroups(groups);
        };
    }

    private customGroupIds(): ReadonlySet<string> {
        const registry = this.injector.get<CustomGroupsRegistry>("customPropertiesGroups", false);
        return registry ? new Set<string>(registry.getIds()) : new Set<string>();
    }

    private filterDesignGroups(groups: PropertiesGroup[]): PropertiesGroup[] {
        const custom = this.customGroupIds();
        const enginePresent = hasEngineGroups(groups.map((group) => group?.id));

        const kept: PropertiesGroup[] = [];

        for (const group of groups) {
            if (!group) {
                continue;
            }

            const id: string = group.id;
            const isNeutral = NEUTRAL_GROUP_ID_SET.has(id);

            // (1) allowlist: neutral groups + host custom groups only.
            if (!isNeutral && !custom.has(id)) {
                continue;
            }

            // (3) engine wholesale-replaced groups are not restorable — drop them
            // once any engine provider ran.
            if (enginePresent && REPLACED_GROUP_ID_SET.has(id)) {
                continue;
            }

            // (2) strip engine-appended entries from the kept neutral groups.
            const appended = ENGINE_APPENDED_ENTRY_IDS[id];
            if (appended && Array.isArray(group.entries)) {
                const excluded = new Set(appended);
                group.entries = group.entries.filter(
                    (entry) => !entry || !excluded.has(entry.id as string),
                );
            }

            // (4) drop groups left empty (custom groups keep their own contents).
            if (isNeutral && isEmptyGroup(group)) {
                continue;
            }

            kept.push(group);
        }

        return kept;
    }
}

export const ModeFilterModule = {
    __init__: ["propertiesPanelModeFilter"],
    propertiesPanelModeFilter: ["type", ModeFilterProvider],
};
