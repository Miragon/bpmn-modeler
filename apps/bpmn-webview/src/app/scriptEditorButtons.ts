import { EDITOR_ICON_SVG } from "./editorIcon";
import type { ScriptEditorOpener } from "./scriptEditorOpener";

/**
 * bpmn-js DI module that injects "Open script in editor" icon buttons into
 * the Camunda 7 properties panel:
 *
 *   - One button on the **Script** group header for `bpmn:ScriptTask`
 *     elements.
 *   - One button per listener row in the **Execution Listeners** /
 *     **Task Listeners** groups. The button is always rendered; the
 *     {@link ScriptEditorOpener} converts non-inline-script listeners via
 *     the command stack before opening the editor.
 *
 * Implementation: a {@link MutationObserver} watches the properties-panel
 * container and runs the injection scan on every DOM mutation. The scan is
 * idempotent — already-processed elements are tagged with
 * `data-script-btn-injected="true"` so subsequent passes are no-ops.
 *
 * Click handlers delegate to {@link ScriptEditorOpener}, which fires the
 * unified open-editor event the webview entry point forwards to the
 * extension host as `OpenScriptEditorCommand`.
 *
 * The listener-row buttons read the listener identity (element id, type,
 * index) from the entry's `data-entry-id` attribute at *click time* rather
 * than capturing it in a closure, because bpmn-js-properties-panel may
 * re-render listener rows in place when listeners are added/removed/
 * reordered, which would invalidate any captured listener reference.
 */

// `data-group-id` of the script-task properties group.
const SCRIPT_GROUP_ID = "group-CamundaPlatform__Script";

/**
 * Pattern matching the `data-entry-id` of a listener entry in the C7
 * properties panel: `${elementId}-${listenerType}-${listenerIndex}`.
 *
 * The element id may itself contain dashes, so we anchor on the well-known
 * listener-type tokens.
 */
export const LISTENER_ENTRY_ID_PATTERN = /^(.+)-(executionListener|taskListener)-(\d+)$/;

// Attribute set on processed elements to avoid duplicate injection.
const INJECTED_MARKER = "data-script-btn-injected";

/**
 * bpmn-js DI service that observes the properties panel DOM and injects
 * "Open in Editor" icon buttons into the script group header and every
 * execution-listener / task-listener row.
 */
class ScriptEditorButtons {
    private observer: MutationObserver | undefined;

    static $inject = ["eventBus", "selection", "scriptEditorOpener"];

    constructor(
        private readonly eventBus: any,
        private readonly selection: any,
        private readonly opener: ScriptEditorOpener,
    ) {
        this.startObserving();
        this.eventBus.on("diagram.destroy", () => this.stopObserving());
    }

    private startObserving(): void {
        const container = document.querySelector("#js-properties-panel");
        if (!container) {
            return;
        }
        this.injectButtons(container);
        this.observer = new MutationObserver(() => this.injectButtons(container));
        this.observer.observe(container, { childList: true, subtree: true });
    }

    private stopObserving(): void {
        this.observer?.disconnect();
        this.observer = undefined;
    }

    private injectButtons(container: Element): void {
        this.injectScriptGroupHeaderButton(container);
        this.injectListenerItemButtons(container);
    }

    /**
     * Injects the icon button into the **Script** group header for
     * script-task elements. The properties panel renders this group only
     * for `bpmn:ScriptTask`, so the presence of `data-group-id` is a
     * reliable signal that the active selection has an inline script.
     */
    private injectScriptGroupHeaderButton(container: Element): void {
        const groupEl = container.querySelector(`[data-group-id="${SCRIPT_GROUP_ID}"]`);
        if (!groupEl) {
            return;
        }

        const buttonsContainer = groupEl.querySelector(
            ".bio-properties-panel-group-header-buttons",
        );
        if (!buttonsContainer || buttonsContainer.hasAttribute(INJECTED_MARKER)) {
            return;
        }

        const button = this.createButton(
            "bio-properties-panel-group-header-button script-editor-button",
        );
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            this.handleScriptHeaderClick();
        });
        buttonsContainer.insertBefore(button, buttonsContainer.firstChild);
        buttonsContainer.setAttribute(INJECTED_MARKER, "true");
    }

    /**
     * Injects an icon button into every execution-listener and task-listener
     * row. The button is always shown; the click handler is responsible for
     * converting non-inline-script listeners (Java class / expression /
     * delegate expression / external-resource script) into inline scripts
     * before opening the editor.
     */
    private injectListenerItemButtons(container: Element): void {
        const entries = container.querySelectorAll<HTMLElement>("[data-entry-id]");
        for (const entry of Array.from(entries)) {
            const id = entry.getAttribute("data-entry-id");
            if (!id) {
                continue;
            }
            if (!LISTENER_ENTRY_ID_PATTERN.test(id)) {
                continue;
            }

            const header = entry.querySelector<HTMLElement>(
                ".bio-properties-panel-collapsible-entry-header",
            );
            if (!header || header.hasAttribute(INJECTED_MARKER)) {
                continue;
            }

            const button = this.createButton("script-editor-button is-list-item");
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                this.handleListenerItemClick(button);
            });

            // Insert immediately after the title (i.e. before the remove-entry
            // button when present, otherwise at the end). CSS gives this
            // button `margin-right: auto` so it hugs the title text and the
            // delete icon stays at the row's right edge.
            const removeBtn = header.querySelector(".bio-properties-panel-remove-entry");
            if (removeBtn) {
                header.insertBefore(button, removeBtn);
            } else {
                header.appendChild(button);
            }
            header.setAttribute(INJECTED_MARKER, "true");
        }
    }

    private createButton(className: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.title = "Open script in editor";
        button.className = className;
        button.innerHTML = EDITOR_ICON_SVG;
        return button;
    }

    /**
     * Handler for the script-task **Script** group header button. Opens the
     * currently selected element's inline script.
     */
    private handleScriptHeaderClick(): void {
        const selected = this.selection.get();
        if (!selected || selected.length === 0) {
            return;
        }
        this.opener.openScriptTask(selected[0]);
    }

    /**
     * Handler for a listener-row icon button. Reads the listener identity
     * from the closest `[data-entry-id]` ancestor and delegates to the
     * opener, which resolves the listener via the element registry.
     */
    private handleListenerItemClick(button: HTMLElement): void {
        const entry = button.closest("[data-entry-id]");
        const id = entry?.getAttribute("data-entry-id") ?? "";
        const match = LISTENER_ENTRY_ID_PATTERN.exec(id);
        if (!match) {
            return;
        }
        this.opener.openListener(
            match[1],
            match[2] as "executionListener" | "taskListener",
            parseInt(match[3], 10),
        );
    }
}

/**
 * bpmn-js / didi module exporting the script-editor buttons service.
 * Register via `additionalModules` when creating the C7 modeler.
 */
export const ScriptEditorButtonsModule = {
    __init__: ["scriptEditorButtons"],
    scriptEditorButtons: ["type", ScriptEditorButtons],
};
