/**
 * bpmn-js DI service that decorates the diagram-js `popupMenu` to intercept
 * the `bpmn-append` and `bpmn-create` menus from the
 * `bpmn-js-create-append-anything` plugin.
 *
 * Instead of the default flat dropdown, this service renders a custom
 * Preact-based two-panel overlay with element templates on the left and
 * categorised BPMN elements on the right.
 */
import { render, h } from "preact";
import { AppendMenuOverlay } from "./components/AppendMenuOverlay";
import { classifyEntries, executeEntryAction } from "./types";
import type { PopupMenuEntry, PopupMenuEntryAction } from "./types";
import type { ElementTemplate } from "@miragon/bpmn-modeler-element-template-chooser";

// Provider IDs that this override intercepts.
const INTERCEPTED_PROVIDERS = new Set(["bpmn-append", "bpmn-create"]);

// Maximum number of favourite BPMN elements.
const MAX_FAVOURITES = 6;

/**
 * Decorates `popupMenu.open()` so that `bpmn-append` and `bpmn-create`
 * menus render in a custom overlay rather than the default popup.
 *
 * All other popup menu types (e.g. `bpmn-replace`) pass through to the
 * original implementation unchanged.
 */
class AppendMenuOverride {
    static $inject = ["popupMenu", "canvas", "eventBus", "injector"];

    private favourites: string[] = [];

    /**
     * Sets the favourite BPMN element types to pin at the top of the palette.
     *
     * @param types Array of BPMN type strings (e.g. `["bpmn:ServiceTask", "bpmn:UserTask"]`).
     *   Maximum of 6 items; extras are silently dropped.
     */
    setFavourites(types: string[]): void {
        this.favourites = types.slice(0, MAX_FAVOURITES);
    }

    constructor(popupMenu: any, canvas: any, eventBus: any, injector: any) {
        const elementTemplates: any | null = injector.get("elementTemplates", false);

        const originalOpen = popupMenu.open.bind(popupMenu);
        const originalClose = popupMenu.close.bind(popupMenu);
        const originalIsOpen = popupMenu.isOpen.bind(popupMenu);

        let customMenuOpen = false;
        let closeCustomMenu: (() => void) | null = null;

        // Tears down the custom overlay and resets state.
        const destroyCustomMenu = () => {
            if (closeCustomMenu) {
                closeCustomMenu();
                closeCustomMenu = null;
            }
            customMenuOpen = false;
        };

        // --- Override popupMenu.open ---
        popupMenu.open = (target: any, providerId: string, position: any, options?: any) => {
            if (!INTERCEPTED_PROVIDERS.has(providerId)) {
                return originalOpen(target, providerId, position, options);
            }

            /**
             * Close any currently open menu (custom or default).
             */
            if (customMenuOpen) {
                destroyCustomMenu();
            } else if (originalIsOpen()) {
                originalClose();
            }

            // Collect entries from all registered providers.
            const context: {
                entries: Record<string, PopupMenuEntry>;
                headerEntries: Record<string, PopupMenuEntry>;
                empty: boolean;
            } = popupMenu._getContext(target, providerId);

            // Gather full template objects for enrichment.
            let allTemplates: ElementTemplate[] = [];
            if (elementTemplates) {
                try {
                    allTemplates = elementTemplates.getAll();
                } catch {
                    // elementTemplates service may not have templates loaded yet.
                }
            }

            const classified = classifyEntries(context.entries, allTemplates);

            const canvasContainer: HTMLElement = canvas.getContainer();

            // Append the overlay to document.body so it renders above
            // the properties panel (which is a sibling of the canvas).
            const container = document.createElement("div");
            container.className = "am-overlay-root";
            document.body.appendChild(container);

            const close = () => {
                render(null, container);
                container.remove();
            };

            const handleSelect = (action: PopupMenuEntryAction, event: Event) => {
                close();
                customMenuOpen = false;
                closeCustomMenu = null;
                executeEntryAction(action, event);
            };

            const handleCancel = () => {
                close();
                customMenuOpen = false;
                closeCustomMenu = null;
            };

            const canvasBounds = canvasContainer.getBoundingClientRect();

            render(
                h(AppendMenuOverlay, {
                    templateEntries: classified.templates,
                    bpmnGroups: classified.bpmnGroups,
                    favourites: this.favourites,
                    position: { x: position.x, y: position.y },
                    canvasBounds: {
                        right: canvasBounds.right,
                        bottom: canvasBounds.bottom,
                    },
                    onSelect: handleSelect,
                    onCancel: handleCancel,
                }),
                container,
            );

            customMenuOpen = true;
            closeCustomMenu = close;
        };

        // --- Override popupMenu.isOpen ---
        popupMenu.isOpen = () => {
            return customMenuOpen || originalIsOpen();
        };

        // --- Override popupMenu.close ---
        popupMenu.close = () => {
            if (customMenuOpen) {
                destroyCustomMenu();
            }
            originalClose();
        };

        // --- Auto-close on diagram events ---
        eventBus.on(["contextPad.close", "canvas.viewbox.changing", "commandStack.changed"], () => {
            if (customMenuOpen) {
                destroyCustomMenu();
            }
        });
    }
}

export { AppendMenuOverride };
