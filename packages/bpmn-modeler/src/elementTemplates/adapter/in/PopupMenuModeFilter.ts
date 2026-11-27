import { isTemplatePopupEntry } from "@miragon/bpmn-modeler-append-menu";
import { surfaceModeSupports } from "@miragon/bpmn-modeler-types";
import {
    type EditableSurfaceMode,
    SURFACE_MODE_SERVICE,
    type SurfaceModeService,
} from "@miragon/bpmn-modeler-types/domain";

import { ELEMENT_POPUP_MENUS } from "../../../kernel/domain/popupMenus";

// Run after the default-priority (1000) providers so their template entries can be removed.
const POPUP_MODE_FILTER_PRIORITY = 100;

/** Runs before the template chooser (default 1000) so its handler never fires. */
const TEMPLATE_SELECT_GUARD_PRIORITY = 10000;

interface PopupEntry {
    group?: { id?: string };
    [key: string]: unknown;
}

interface PopupMenuLike {
    registerProvider(id: string, priority: number, provider: unknown): void;
}

interface ModeFilterEventBus {
    on(event: string, priority: number, cb: (event: { stopPropagation(): void }) => void): void;
}

interface ModeFilterInjector {
    get<T>(name: string, strict: false): T | null;
}

export function stripTemplateEntries<T extends PopupEntry>(
    entries: Record<string, T>,
): Record<string, T> {
    const nonTemplateEntries: Record<string, T> = {};
    for (const [key, entry] of Object.entries(entries)) {
        if (!isTemplatePopupEntry(key, entry)) {
            nonTemplateEntries[key] = entry;
        }
    }
    return nonTemplateEntries;
}

export class PopupMenuModeFilter {
    static $inject = ["popupMenu", "eventBus", "injector"];

    constructor(
        popupMenu: PopupMenuLike,
        eventBus: ModeFilterEventBus,
        private readonly injector: ModeFilterInjector,
    ) {
        for (const id of ELEMENT_POPUP_MENUS) {
            popupMenu.registerProvider(id, POPUP_MODE_FILTER_PRIORITY, this);
        }
        eventBus.on("elementTemplates.select", TEMPLATE_SELECT_GUARD_PRIORITY, (event) => {
            if (!this.offersTemplates()) {
                event.stopPropagation();
            }
        });
    }

    getPopupMenuEntries(_target: unknown) {
        return (entries: Record<string, PopupEntry>) =>
            this.offersTemplates() ? entries : stripTemplateEntries(entries);
    }

    private offersTemplates(): boolean {
        return surfaceModeSupports(this.mode(), "elementTemplates");
    }

    // Read the surface's mode each time a menu opens, so a menu cannot keep a stale copy.
    private mode(): EditableSurfaceMode {
        return (
            this.injector.get<SurfaceModeService>(SURFACE_MODE_SERVICE, false)?.get() ?? "implement"
        );
    }
}

/** Hides template entries and choices while the surface's mode offers no element templates. */
export const PopupMenuModeFilterModule = {
    __init__: ["popupMenuModeFilter"],
    popupMenuModeFilter: ["type", PopupMenuModeFilter],
};
