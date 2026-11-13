/**
 * @internal The editor page around a canvas and its properties panel, for the
 * webviews and the Orca editors. Its look is `panelChrome.css` beside it, which
 * every page that mounts it imports. Not part of the modeler public API.
 */
import { installPanelShortcuts } from "./propertiesPanelFocus";
import { initResizer, type PropertiesPanelHandle } from "./propertiesPanelResizer";
import type { PanelStateStore } from "./propertiesPanelUiState";
import { bindPanelVisibility, type PanelVisibilityBinding } from "./propertiesPanelVisibility";
import { bindPanelWidth } from "./propertiesPanelWidthBinding";

/**
 * A shell sets this on its empty root when the host hides the panel by default,
 * so the panel mounts collapsed instead of flashing open before the bundle
 * applies its state.
 */
export const INITIALLY_COLLAPSED_PANEL_ATTRIBUTE = "data-panel-collapsed";

const COLLAPSED_CLASS = "collapsed";

export interface PanelChromeOptions {
    store: PanelStateStore;
    /** Receives a visibility the user chose, to report as the host's new default. */
    onVisibilityChosen?: (visible: boolean) => void;
    translate: (key: string) => string;
    /** Re-applies the toggle label on a language change; returns the unsubscribe. */
    onLanguageChange: (apply: () => void) => () => void;
    focusCanvas: () => void;
    isCanvasFocused: () => boolean;
    /** Closes the panel shortcuts, for a view without a canvas or before the editor is ready. */
    isEnabled?: () => boolean;
    /** Escape anywhere moves focus to the canvas. */
    escapeToCanvas?: boolean;
}

export interface EditorCanvas {
    dropZone: HTMLElement;
    canvas: HTMLElement;
}

export interface PanelChrome extends EditorCanvas {
    resizer: HTMLElement;
    /** The resizer collapses it. */
    panelHost: HTMLElement;
    /** The properties panel's parent and the root the shortcuts focus into. */
    panelMount: HTMLElement;
    panel: PropertiesPanelHandle;
    visibility: PanelVisibilityBinding;
    /** Leaves the panel and its resizer out, for a view the properties panel does not serve. */
    hidePanel(hidden: boolean): void;
    /** Removes the shortcuts and the resizer's listeners; the markup stays. */
    dispose(): void;
}

function element(className: string, id: string): HTMLElement {
    const node = document.createElement("div");
    node.className = className;
    node.id = id;
    return node;
}

/** The canvas alone, for a page without a properties panel such as a diff pane. */
export function mountEditorCanvas(root: HTMLElement): EditorCanvas {
    const dropZone = element("content with-diagram", "js-drop-zone");
    const canvas = element("canvas", "js-canvas");
    dropZone.append(canvas);
    root.classList.add("editor-page");
    root.replaceChildren(dropZone);
    return { dropZone, canvas };
}

/**
 * Replaces the root's content with the canvas, the resizer and the properties
 * panel, and binds the panel's width, visibility, toggle label and shortcuts.
 */
export function mountPanelChrome(root: HTMLElement, options: PanelChromeOptions): PanelChrome {
    const { dropZone, canvas } = mountEditorCanvas(root);
    const resizer = element("panel-resizer", "js-panel-resizer");
    const panelHost = element("properties-panel-parent", "js-properties-panel");
    const panelMount = element("panel-mount", "js-properties-panel-mount");
    if (root.hasAttribute(INITIALLY_COLLAPSED_PANEL_ATTRIBUTE)) {
        resizer.classList.add(COLLAPSED_CLASS);
        panelHost.classList.add(COLLAPSED_CLASS);
        panelHost.style.width = "0";
    }
    panelHost.append(panelMount);
    dropZone.append(resizer, panelHost);

    const panel = initResizer({
        resizer,
        panel: panelHost,
        getToggleLabel: (state) =>
            options.translate(
                state === "collapsed" ? "Open properties panel" : "Close properties panel",
            ) + " (Shift+P)",
        onLabelChange: options.onLanguageChange,
    });
    bindPanelWidth(panel, options.store);
    const visibility = bindPanelVisibility(panel, options.store, (visible) =>
        options.onVisibilityChosen?.(visible),
    );
    const removeShortcuts = installPanelShortcuts(
        {
            handle: panel,
            focusCanvas: options.focusCanvas,
            isCanvasFocused: options.isCanvasFocused,
            isEnabled: options.isEnabled,
            escapeToCanvas: options.escapeToCanvas,
        },
        { getPanelRoot: () => panelMount },
    );

    return {
        dropZone,
        canvas,
        resizer,
        panelHost,
        panelMount,
        panel,
        visibility,
        hidePanel(hidden) {
            panelHost.hidden = hidden;
            resizer.hidden = hidden;
        },
        dispose() {
            removeShortcuts();
            panel.dispose();
        },
    };
}
