/**
 * bpmn-js module that shows a hover overlay on elements with resolved
 * implementation references.
 *
 * Receives its data from the extension host via {@link updateEntries} and
 * fires a custom `implementationLink.navigate` event on the diagram-js
 * event bus when the user clicks an overlay link. The webview message
 * handler listens for this event and posts a `NavigateToImplementationCommand`
 * to the extension host.
 */
import "./implementationLink.css";
import { createOverlayElement } from "./ImplementationLinkOverlay";

/** Simplified entry data received from the extension host. */
interface LinkEntry {
    /** Display text for the overlay. */
    readonly label: string;
    /** Whether the implementation file has been found in the workspace. */
    readonly resolved: boolean;
}

/**
 * diagram-js module that manages implementation-link overlays on BPMN elements.
 *
 * Injected services: `eventBus`, `overlays`, `elementRegistry` — all provided
 * by the bpmn-js / diagram-js core.
 */
class ImplementationLink {
    static $inject = ["eventBus", "overlays", "elementRegistry"];

    /** Current implementation map: BPMN element ID → link entry. */
    private entries: Record<string, LinkEntry> = {};

    /** ID of the currently visible overlay, if any. */
    private activeOverlayId: string | undefined;

    /** Element ID for which the overlay is currently shown. */
    private activeElementId: string | undefined;

    constructor(
        private readonly eventBus: any,
        private readonly overlays: any,
        private readonly elementRegistry: any,
    ) {
        this.registerListeners();
    }

    /**
     * Replaces the current entries map with fresh data from the extension host.
     *
     * Called by the webview message handler when an {@link ImplementationMapQuery}
     * is received.
     *
     * @param entries The new implementation map entries.
     */
    updateEntries(entries: Record<string, LinkEntry>): void {
        this.entries = entries;
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    /**
     * Registers event-bus listeners for element hover/out to show/hide overlays.
     */
    private registerListeners(): void {
        this.eventBus.on("element.hover", (event: any) => {
            const element = event.element;
            if (!element || element.type === "bpmn:Process" || element.type === "bpmn:Collaboration") {
                return;
            }

            const entry = this.entries[element.id];
            if (!entry) return;

            this.showOverlay(element.id, entry);
        });

        this.eventBus.on("element.out", () => {
            this.hideOverlay();
        });
    }

    /**
     * Creates and shows an overlay on the given element.
     *
     * @param elementId BPMN element ID.
     * @param entry Link data for the element.
     */
    private showOverlay(elementId: string, entry: LinkEntry): void {
        // Avoid recreating the overlay for the same element.
        if (this.activeElementId === elementId) return;

        this.hideOverlay();

        const overlayHtml = createOverlayElement(entry.label, entry.resolved, () => {
            this.eventBus.fire("implementationLink.navigate", {
                activityId: elementId,
            });
        });

        try {
            this.activeOverlayId = this.overlays.add(elementId, "implementation-link", {
                position: { bottom: 0, left: 0 },
                html: overlayHtml,
            });
            this.activeElementId = elementId;
        } catch {
            // Element may not exist in the canvas — silently ignore.
        }
    }

    /**
     * Removes the currently visible overlay, if any.
     */
    private hideOverlay(): void {
        if (this.activeOverlayId) {
            try {
                this.overlays.remove(this.activeOverlayId);
            } catch {
                // Overlay may already be gone.
            }
            this.activeOverlayId = undefined;
            this.activeElementId = undefined;
        }
    }
}

export default ImplementationLink;
