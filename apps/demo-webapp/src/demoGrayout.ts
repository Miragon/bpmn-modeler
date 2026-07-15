// Greys out (keeps visible + tooltip) the context-pad entries for host-only
// features — code-link and Edit Script — which can't work in the static demo.
const GRAYED_ENTRY_IDS = ["go-to-implementation", "edit-script"];
const TOOLTIP = "Nur in VS Code / IntelliJ verfügbar";

/* eslint-disable @typescript-eslint/no-explicit-any */
class DemoGrayoutContextPadProvider {
    static $inject = ["contextPad"];

    constructor(contextPad: any) {
        // Priority < 1000 so it runs after the providers that add these entries.
        contextPad.registerProvider(100, this);
    }

    getContextPadEntries(): (entries: Record<string, any>) => Record<string, any> {
        return (entries) => {
            for (const id of GRAYED_ENTRY_IDS) {
                const entry = entries[id];
                if (!entry) {
                    continue;
                }
                if (typeof entry.html === "string" && entry.html.includes('class="entry')) {
                    entry.html = entry.html.replace(
                        'class="entry',
                        'class="entry entry-demo-disabled',
                    );
                }
                entry.title = TOOLTIP;
                entry.action = { click: () => undefined };
            }
            return entries;
        };
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const DemoGrayoutModule = {
    __init__: ["demoGrayoutContextPadProvider"],
    demoGrayoutContextPadProvider: ["type", DemoGrayoutContextPadProvider],
};
