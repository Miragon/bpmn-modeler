import {
    OPEN_SCRIPT_EDITOR_EVENT,
    OpenScriptEditorEvent,
} from "./scriptTaskContextPad";

/**
 * bpmn-js DI module that injects "Open in VS Code Editor" icon buttons into
 * the Camunda 7 properties panel:
 *
 *   - One button on the **Script** group header for `bpmn:ScriptTask`
 *     elements.
 *   - One button per listener row in the **Execution Listeners** /
 *     **Task Listeners** groups, but only when that listener uses an
 *     inline `<camunda:script>` implementation.
 *
 * Implementation: a {@link MutationObserver} watches the properties-panel
 * container and runs the injection scan on every DOM mutation. The scan is
 * idempotent — already-processed elements are tagged with
 * `data-script-btn-injected="true"` so subsequent passes are no-ops.
 *
 * Click handlers fire {@link OPEN_SCRIPT_EDITOR_EVENT} on the bpmn-js event
 * bus with a {@link OpenScriptEditorEvent} payload. The webview entry point
 * forwards it to the extension host as `OpenScriptEditorCommand`, which
 * opens the inline script in a virtual `bpmn-script://` editor with kind-
 * aware `camunda.d.ts` IntelliSense stubs.
 *
 * The listener-row buttons read the listener identity (element id, type,
 * index) from the entry's `data-entry-id` attribute at *click time* rather
 * than capturing it in a closure, because bpmn-js-properties-panel may
 * re-render listener rows in place when listeners are added/removed/
 * reordered, which would invalidate any captured listener reference.
 */

/** `data-group-id` of the script-task properties group. */
const SCRIPT_GROUP_ID = "group-CamundaPlatform__Script";

/**
 * Pattern matching the `data-entry-id` of a listener entry in the C7
 * properties panel: `${elementId}-${listenerType}-${listenerIndex}`.
 *
 * The element id may itself contain dashes, so we anchor on the well-known
 * listener-type tokens.
 */
const LISTENER_ENTRY_ID_PATTERN =
    /^(.+)-(executionListener|taskListener)-(\d+)$/;

/** Attribute set on processed elements to avoid duplicate injection. */
const INJECTED_MARKER = "data-script-btn-injected";

/**
 * Visual Studio Code product mark (single-color) as inline SVG.
 *
 * Source: https://code.visualstudio.com/brand
 */
const VSCODE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path fill="#007ACC" fill-rule="evenodd" clip-rule="evenodd" d="M70.912 99.317a6.223 6.223 0 0 0 4.96-.19l20.589-9.907A6.25 6.25 0 0 0 100 83.587V16.413a6.25 6.25 0 0 0-3.54-5.633L75.874.873a6.223 6.223 0 0 0-7.094 1.21L29.355 38.04 12.187 25.01a4.155 4.155 0 0 0-5.306.236l-5.503 5.009a4.176 4.176 0 0 0-.004 6.162L16.263 50 1.374 63.583a4.176 4.176 0 0 0 .004 6.162l5.503 5.009a4.155 4.155 0 0 0 5.306.236L29.355 61.96l39.425 35.958a6.222 6.222 0 0 0 2.132 1.4ZM75.015 27.276 45.11 50l29.906 22.724V27.276Z"/>
</svg>`;

/**
 * bpmn-js DI service that observes the properties panel DOM and injects
 * "Open in Editor" icon buttons into the script group header and each
 * script-typed listener row.
 */
class ScriptEditorButtons {
    private observer: MutationObserver | undefined;

    static $inject = ["eventBus", "selection", "elementRegistry"];

    constructor(
        private readonly eventBus: any,
        private readonly selection: any,
        private readonly elementRegistry: any,
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
        this.observer = new MutationObserver(() =>
            this.injectButtons(container),
        );
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
        const groupEl = container.querySelector(
            `[data-group-id="${SCRIPT_GROUP_ID}"]`,
        );
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
     * Injects an icon button into each listener row whose listener uses an
     * inline `<camunda:script>` implementation. Java-class /
     * expression / external-resource implementations are skipped so the
     * button never appears as a no-op affordance.
     */
    private injectListenerItemButtons(container: Element): void {
        const entries = container.querySelectorAll<HTMLElement>(
            "[data-entry-id]",
        );
        for (const entry of Array.from(entries)) {
            const id = entry.getAttribute("data-entry-id");
            if (!id) {
                continue;
            }
            const match = LISTENER_ENTRY_ID_PATTERN.exec(id);
            if (!match) {
                continue;
            }

            const header = entry.querySelector<HTMLElement>(
                ".bio-properties-panel-collapsible-entry-header",
            );
            if (!header || header.hasAttribute(INJECTED_MARKER)) {
                continue;
            }

            // Only inject for listeners that actually have an inline script.
            const elementId = match[1];
            const listenerType = match[2] as
                | "executionListener"
                | "taskListener";
            const listenerIndex = parseInt(match[3], 10);
            if (!this.hasInlineScript(elementId, listenerType, listenerIndex)) {
                continue;
            }

            const button = this.createButton(
                "script-editor-button is-list-item",
            );
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                this.handleListenerItemClick(button);
            });

            // Insert immediately after the title (i.e. before the remove-entry
            // button when present, otherwise at the end). CSS gives this
            // button `margin-right: auto` so it hugs the title text and the
            // delete icon stays at the row's right edge.
            const removeBtn = header.querySelector(
                ".bio-properties-panel-remove-entry",
            );
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
        button.title = "Open in VS Code Editor";
        button.className = className;
        button.innerHTML = VSCODE_ICON_SVG;
        return button;
    }

    /**
     * Handler for the script-task **Script** group header button. Reads the
     * currently selected element's inline script and fires the unified
     * open-editor event with `kind: "script-task"`.
     */
    private handleScriptHeaderClick(): void {
        const selected = this.selection.get();
        if (!selected || selected.length === 0) {
            return;
        }

        const element = selected[0];
        const bo = element.businessObject;
        if (!bo) {
            return;
        }

        const scriptFormat =
            bo.get?.("camunda:scriptFormat") ||
            bo.get?.("scriptFormat") ||
            bo.scriptFormat ||
            "";
        const content = bo.script || "";

        this.eventBus.fire(OPEN_SCRIPT_EDITOR_EVENT, {
            elementId: element.id,
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat,
            content,
        } as OpenScriptEditorEvent);
    }

    /**
     * Handler for a listener-row icon button.
     *
     * Reads the listener identity from the closest `[data-entry-id]`
     * ancestor and looks up the listener via the element registry — using
     * the registry rather than `selection.get()` because the properties
     * panel also displays the implicit root process when nothing is
     * selected, in which case the selection service returns an empty array.
     */
    private handleListenerItemClick(button: HTMLElement): void {
        const entry = button.closest("[data-entry-id]");
        const id = entry?.getAttribute("data-entry-id") ?? "";
        const match = LISTENER_ENTRY_ID_PATTERN.exec(id);
        if (!match) {
            return;
        }
        const elementId = match[1];
        const listenerType = match[2] as "executionListener" | "taskListener";
        const listenerIndex = parseInt(match[3], 10);

        const listener = this.lookupListener(
            elementId,
            listenerType,
            listenerIndex,
        );
        if (!listener?.script) {
            // Should never happen — injection only runs when a script exists.
            // Bail loudly so a regression in upstream id formatting is
            // visible in the console rather than producing a confusing no-op.
            console.warn(
                `Listener ${listenerType}[${listenerIndex}] on ${elementId} has no inline script.`,
            );
            return;
        }

        const kind =
            listenerType === "executionListener"
                ? "execution-listener"
                : "task-listener";

        this.eventBus.fire(OPEN_SCRIPT_EDITOR_EVENT, {
            elementId,
            kind,
            listenerIndex,
            eventName:
                listener.get?.("event") ?? listener.event ?? undefined,
            scriptFormat:
                listener.script.get?.("scriptFormat") ??
                listener.script.scriptFormat ??
                "",
            content:
                listener.script.get?.("value") ??
                listener.script.value ??
                "",
        } as OpenScriptEditorEvent);
    }

    /**
     * Returns true when the given listener exists on the element and its
     * implementation is an inline `<camunda:script>`. Used to decide
     * whether to render the icon button at injection time.
     */
    private hasInlineScript(
        elementId: string,
        listenerType: "executionListener" | "taskListener",
        listenerIndex: number,
    ): boolean {
        const listener = this.lookupListener(
            elementId,
            listenerType,
            listenerIndex,
        );
        if (!listener?.script) {
            return false;
        }
        const value =
            listener.script.get?.("value") ?? listener.script.value;
        return typeof value === "string";
    }

    private lookupListener(
        elementId: string,
        listenerType: "executionListener" | "taskListener",
        listenerIndex: number,
    ): any {
        const element = this.elementRegistry.get(elementId);
        if (!element) {
            return undefined;
        }
        const extensionType =
            listenerType === "executionListener"
                ? "camunda:ExecutionListener"
                : "camunda:TaskListener";
        const listeners = (
            element.businessObject?.extensionElements?.values || []
        ).filter((e: any) => e.$type === extensionType);
        return listeners[listenerIndex];
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
