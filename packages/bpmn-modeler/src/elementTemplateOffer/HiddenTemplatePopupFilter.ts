import { templateIdOfEntryKey } from "@miragon/bpmn-modeler-element-template-chooser/templateEntryKey";

import { ELEMENT_POPUP_MENUS } from "../popupMenus";

interface PopupMenuRegistry {
    registerProvider(menuId: string, priority: number, provider: object): void;
}

interface TemplateIdOffer {
    isTemplateIdOffered(templateId: string): boolean;
    isTemplateIdOfferedTo(element: unknown, templateId: string): boolean;
}

type ElementPopupMenu = (typeof ELEMENT_POPUP_MENUS)[number];

// Below the default priority (1000), so create-append-anything's template entries already exist.
const FILTER_PRIORITY = 100;

/** Drops the template entries of hidden templates from the replace, append and create menus. */
export class HiddenTemplatePopupFilter {
    static $inject = ["popupMenu", "elementTemplateOffer"];

    constructor(
        popupMenu: PopupMenuRegistry,
        private readonly offer: TemplateIdOffer,
    ) {
        for (const menu of ELEMENT_POPUP_MENUS) {
            popupMenu.registerProvider(menu, FILTER_PRIORITY, {
                getPopupMenuEntries: (target: unknown) => this.entriesFilter(menu, target),
            });
        }
    }

    private entriesFilter(menu: ElementPopupMenu, target: unknown) {
        // Only a replace entry acts on the target; append and create make a new element.
        const isOffered =
            menu === "bpmn-replace"
                ? (templateId: string) => this.offer.isTemplateIdOfferedTo(target, templateId)
                : (templateId: string) => this.offer.isTemplateIdOffered(templateId);
        return <Entries extends Record<string, object>>(entries: Entries): Entries => {
            const offeredEntries: Record<string, object> = {};
            for (const [key, entry] of Object.entries(entries)) {
                const templateId = templateIdOfEntryKey(key);
                if (templateId === undefined || isOffered(templateId)) {
                    offeredEntries[key] = entry;
                }
            }
            return offeredEntries as Entries;
        };
    }
}
