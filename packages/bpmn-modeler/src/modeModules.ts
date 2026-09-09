import type { ModelerMode } from "./mode";

// Run after the default-priority (1000) providers so their template entries can be removed.
const POPUP_MODE_FILTER_PRIORITY = 100;

const FILTERED_MENUS = ["bpmn-replace", "bpmn-append", "bpmn-create"] as const;

/** Runs before the template chooser (default 1000) so its handler never fires. */
const TEMPLATE_SELECT_GUARD_PRIORITY = 10000;

const TEMPLATE_ENTRY_KEY = /(^|\.)template-/;

export function stripTemplateEntries(entries: Record<string, any>): Record<string, any> {
    const nonTemplateEntries: Record<string, any> = {};
    for (const [key, entry] of Object.entries(entries)) {
        if (TEMPLATE_ENTRY_KEY.test(key)) {
            continue;
        }
        if (entry?.group?.id === "templates") {
            continue;
        }
        nonTemplateEntries[key] = entry;
    }
    return nonTemplateEntries;
}

export class PopupMenuModeFilter {
    static $inject = ["popupMenu", "eventBus", "injector"];

    constructor(
        popupMenu: any,
        eventBus: any,
        private readonly injector: any,
    ) {
        for (const id of FILTERED_MENUS) {
            popupMenu.registerProvider(id, POPUP_MODE_FILTER_PRIORITY, this);
        }
        eventBus.on("elementTemplates.select", TEMPLATE_SELECT_GUARD_PRIORITY, (event: any) => {
            if (this.mode() === "design") {
                event.stopPropagation();
            }
        });
    }

    getPopupMenuEntries(_target: unknown) {
        return (entries: Record<string, any>) =>
            this.mode() === "design" ? stripTemplateEntries(entries) : entries;
    }

    // Read the panel filter each time so popup menus cannot retain a stale mode.
    private mode(): ModelerMode {
        return this.injector.get("propertiesPanelModeFilter", false)?.getMode() ?? "implement";
    }
}

export const ModeUiModule = {
    __init__: ["popupMenuModeFilter"],
    popupMenuModeFilter: ["type", PopupMenuModeFilter],
};
