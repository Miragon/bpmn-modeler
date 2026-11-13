// Ahead of the pop-up service, which reads `onInput` from the same context object.
const BEFORE_POPUP_SERVICE = 1500;

/** The slice of a diagram-js EventBus that the properties panel's pop-up drives. */
export interface PopupEventBus {
    on(event: string, priority: number, callback: (event: unknown, context: unknown) => unknown): void;
    fire(event: string, context?: unknown): unknown;
}

/**
 * What is typed into a properties panel's FEEL pop-up. `@bpmn-io/properties-panel`
 * keeps it in a draft that it applies only when the pop-up closes, out of reach of
 * the input debounce, so a save sees it only through this.
 */
export interface PopupDraftInput {
    /** Follows the pop-up of the panel on this bus; once per view of a modeler. */
    track(eventBus: PopupEventBus): void;
    /** Whether an open pop-up holds typed input it has not applied yet. */
    hasPending(): boolean;
    /** Closes each pop-up that holds typed input, which applies it; leaves the others open. */
    flush(): void;
}

interface TrackedPopup {
    eventBus: PopupEventBus;
    typed: boolean;
}

function hasOnInput(context: unknown): context is { onInput: (...args: unknown[]) => unknown } {
    return (
        typeof context === "object" &&
        context !== null &&
        typeof (context as { onInput?: unknown }).onInput === "function"
    );
}

export function createPopupDraftInput(): PopupDraftInput {
    const popups: TrackedPopup[] = [];

    return {
        track(eventBus) {
            const popup: TrackedPopup = { eventBus, typed: false };
            popups.push(popup);
            eventBus.on("propertiesPanel.openPopup", BEFORE_POPUP_SERVICE, (_event, context) => {
                popup.typed = false;
                if (!hasOnInput(context)) return;
                const applyInput = context.onInput;
                context.onInput = (...args: unknown[]) => {
                    popup.typed = true;
                    return applyInput(...args);
                };
            });
            eventBus.on("propertiesPanelPopup.close", BEFORE_POPUP_SERVICE, () => {
                popup.typed = false;
            });
        },
        hasPending: () => popups.some((popup) => popup.typed),
        flush() {
            for (const popup of popups) {
                if (popup.typed) popup.eventBus.fire("propertiesPanel.closePopup");
            }
        },
    };
}
