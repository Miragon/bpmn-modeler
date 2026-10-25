interface PopupMenuRegistry {
    registerProvider(menuId: string, priority: number, provider: object): void;
}

export const BPMN_TAB = { id: "bpmn", label: "BPMN" } as const;

const TEMPLATES_TAB_ID = "templates";

const TEMPLATE_ENTRY_PREFIX = "replace.template-";

// Below the default priority, so the template entries already exist.
const TAB_PRIORITY = 400;

export class ReplaceTemplatesTabProvider {
    static $inject = ["popupMenu", "translate"];

    constructor(
        popupMenu: PopupMenuRegistry,
        private readonly translate: (text: string) => string,
    ) {
        popupMenu.registerProvider("bpmn-replace", TAB_PRIORITY, this);
    }

    getPopupMenuEntries() {
        return <Entries extends Record<string, object>>(entries: Entries): Entries => {
            const templatesTab = { id: TEMPLATES_TAB_ID, label: this.translate("Templates") };
            const tabbedEntries: Record<string, object> = {};
            for (const [entryId, entry] of Object.entries(entries)) {
                tabbedEntries[entryId] = entryId.startsWith(TEMPLATE_ENTRY_PREFIX)
                    ? { ...entry, tab: templatesTab }
                    : entry;
            }
            return tabbedEntries as Entries;
        };
    }
}
