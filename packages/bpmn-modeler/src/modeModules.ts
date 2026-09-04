/**
 * The design-mode chrome filter for the create/replace/append popup menus
 * (issue #1442, epic #1438).
 *
 * The properties-panel `propertiesPanelModeFilter` filters the *panel*; this DI
 * module filters the *popup menus* so design mode also hides the element-template
 * affordances there. It reads the mode lazily off `propertiesPanelModeFilter`
 * (the single source of truth), so nothing here holds a second mode field that
 * could drift, and a toggle takes effect on the next popup open (menus are
 * transient, rebuilt per open — no refresh needed).
 *
 * Two hooks:
 *  - a low-priority popup-menu provider on `bpmn-replace` / `bpmn-append` /
 *    `bpmn-create` that, in design mode, strips the template entries from the
 *    accumulated menu (see {@link stripTemplateEntries});
 *  - a high-priority `elementTemplates.select` guard that stops the event in
 *    design mode, since the template chooser subscribes at default priority in
 *    its constructor with no off switch.
 */
import type { ModelerMode } from "./mode";

/**
 * Below diagram-js's `DEFAULT_PRIORITY` (1000). diagram-js applies
 * function-returning popup-menu providers as middleware over the accumulated
 * entries in provider order, and a **lower** priority is pushed later and so
 * runs **last** (`diagram-js/lib/features/popup-menu/PopupMenu.js`). Running last
 * is what lets us strip the template entries the engine providers (e.g. C8's
 * `ElementTemplatesReplaceProvider`, keyed `replace.template-*` with
 * `group.id === "templates"`) added at default priority.
 */
const POPUP_MODE_FILTER_PRIORITY = 100;

/** The popup menus whose template entries design mode strips. */
const FILTERED_MENUS = ["bpmn-replace", "bpmn-append", "bpmn-create"] as const;

/** Runs before the template chooser (default 1000) so its handler never fires. */
const TEMPLATE_SELECT_GUARD_PRIORITY = 10000;

/** Element-template entries are keyed `template-*` or `<prefix>.template-*`. */
const TEMPLATE_ENTRY_KEY = /(^|\.)template-/;

/**
 * Drops the element-template entries from a popup-menu entry map — those keyed
 * `template-*` / `*.template-*`, plus any entry whose `group.id` is `"templates"`
 * (belt-and-braces for a differently-keyed provider). Pure; the identity on a
 * template-free menu.
 */
export function stripTemplateEntries(entries: Record<string, any>): Record<string, any> {
    const kept: Record<string, any> = {};
    for (const [key, entry] of Object.entries(entries)) {
        if (TEMPLATE_ENTRY_KEY.test(key)) {
            continue;
        }
        if (entry?.group?.id === "templates") {
            continue;
        }
        kept[key] = entry;
    }
    return kept;
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

    /**
     * Reads the mode off the panel filter (the single source of truth). Resolved
     * defensively — a surface without the panel filter registered is treated as
     * `implement` (identity), so the module is safe to register unconditionally.
     */
    private mode(): ModelerMode {
        return this.injector.get("propertiesPanelModeFilter", false)?.getMode() ?? "implement";
    }
}

export const ModeUiModule = {
    __init__: ["popupMenuModeFilter"],
    popupMenuModeFilter: ["type", PopupMenuModeFilter],
};
