import { templateIdOfEntryKey } from "@miragon/bpmn-modeler-element-template-chooser/templateEntryKey";

interface PopupMenuRegistry {
    registerProvider(menuId: string, priority: number, provider: object): void;
}

interface TemplateIdOffer {
    isTemplateIdOffered(templateId: string): boolean;
}

// Below the default priority (1000), so create-append-anything's template entries already exist.
const FILTER_PRIORITY = 100;

const OFFERING_MENUS = ["bpmn-replace", "bpmn-append", "bpmn-create"] as const;

/** Drops the template entries of hidden templates from the replace, append and create menus. */
export class HiddenTemplatePopupFilter {
    static $inject = ["popupMenu", "elementTemplateOffer"];

    constructor(
        popupMenu: PopupMenuRegistry,
        private readonly offer: TemplateIdOffer,
    ) {
        for (const menu of OFFERING_MENUS) {
            popupMenu.registerProvider(menu, FILTER_PRIORITY, this);
        }
    }

    getPopupMenuEntries(_target: unknown) {
        return <Entries extends Record<string, object>>(entries: Entries): Entries => {
            const offeredEntries: Record<string, object> = {};
            for (const [key, entry] of Object.entries(entries)) {
                const templateId = templateIdOfEntryKey(key);
                if (templateId === undefined || this.offer.isTemplateIdOffered(templateId)) {
                    offeredEntries[key] = entry;
                }
            }
            return offeredEntries as Entries;
        };
    }
}
