/**
 * bpmn-js context-pad provider that contributes a "Go to implementation"
 * action.  The action appears on the floating context pad around a selected
 * service / send / business-rule task that carries a Camunda implementation
 * reference — `camunda:class` / `camunda:delegateExpression` /
 * `camunda:expression` / external `camunda:topic` (C7) or a
 * `zeebe:taskDefinition type` (C8).
 *
 * Clicking the entry sends a {@link NavigateToImplementationCommand} to the
 * extension host, which resolves the reference to a workspace source file and
 * opens it (or shows a QuickPick / info notification on N / 0 matches).
 *
 * The entry mirrors `NavigateContextPadProvider`: an inline `html` fragment
 * with an embedded SVG, placed in the `connect` group so it shares a row with
 * the existing connect icon rather than starting an orphan row.  A business-
 * rule task may show both this entry and the model-navigation entry; they never
 * conflict because {@link extractImplementation} ignores `camunda:decisionRef`.
 */
import { is } from "bpmn-js/lib/util/ModelUtil";

import { NavigateToImplementationCommand } from "@miragon/bpmn-modeler-shared";

import { BusinessObjectLike, extractImplementation } from "./extractImplementation";
import { IMPLEMENTABLE_TYPES } from "./collectImplementations";
import type { CodeLinkMapClient } from "./CodeLinkMapClient";

interface ContextPad {
    registerProvider(provider: CodeLinkContextPadProvider): void;
}

interface Translate {
    (template: string): string;
}

/**
 * The slice of a bpmn-js element this feature reads. `id` is the activity id the
 * status map is keyed by; `businessObject` carries the Camunda binding.
 */
export interface Element {
    id?: string;
    type?: string;
    businessObject?: BusinessObjectLike;
}

interface VsCodeBridge {
    postMessage(message: unknown): void;
}

interface ContextPadEntry {
    group: string;
    html: string;
    title: string;
    action: { click: (event: Event, element: Element) => void };
}

export type ContextPadEntries = Record<string, ContextPadEntry>;

/**
 * Feather "code" glyph — `< >` chevrons.  Sized 22×22 to match the context
 * pad's entry box and drawn with `currentColor` so it inherits the theme's
 * foreground.  Deliberately distinct from the external-link icon used by the
 * model-navigation entry so the two are tellable apart when both are present.
 */
const CODE_ICON_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;

/**
 * Constructor-registered provider.  bpmn-js' `contextPad` collects entries by
 * calling {@link getContextPadEntries} on every registered provider; this one
 * contributes only when the selected element is an implementable task with a
 * resolvable implementation reference.
 *
 * The `vsCodeBridge` DI value is supplied by the bpmn-webview during modeler
 * construction so this library never calls `acquireVsCodeApi` itself (it may
 * only be invoked once per webview).
 */
export class CodeLinkContextPadProvider {
    static $inject = ["contextPad", "translate", "vsCodeBridge", "codeLinkMapClient"];

    private readonly translate: Translate;

    private readonly vsCodeBridge: VsCodeBridge;

    private readonly client: CodeLinkMapClient;

    constructor(
        contextPad: ContextPad,
        translate: Translate,
        vsCodeBridge: VsCodeBridge,
        codeLinkMapClient: CodeLinkMapClient,
    ) {
        this.translate = translate;
        this.vsCodeBridge = vsCodeBridge;
        this.client = codeLinkMapClient;
        contextPad.registerProvider(this);
    }

    /**
     * Called by the context pad for the selected element.  Returns a single
     * entry when the element is an implementable task with a resolvable
     * implementation reference that the host has not reported as missing, or an
     * empty object otherwise.
     *
     * @param element The currently selected element.
     */
    getContextPadEntries(element: Element): ContextPadEntries {
        if (!this.isImplementableTask(element)) {
            return {};
        }
        if (!extractImplementation(element.businessObject)) {
            return {};
        }
        // Hide the entry once the host has confirmed the reference resolves to
        // nothing in the workspace — there is no source file to navigate to.
        if (!this.client.isResolved(element)) {
            return {};
        }

        return {
            "go-to-implementation": {
                group: "connect",
                html: `<div class="entry">${CODE_ICON_SVG}</div>`,
                title: this.translate("Go to implementation"),
                action: {
                    // Re-extract on click so an edit made between pad-render and
                    // click (e.g. via the properties panel) navigates to the
                    // current reference, not a stale one.
                    click: (_event, clickedElement) => {
                        const current = extractImplementation(clickedElement.businessObject);
                        if (current) {
                            this.vsCodeBridge.postMessage(
                                new NavigateToImplementationCommand(
                                    current.reference,
                                    current.kind,
                                ),
                            );
                        }
                    },
                },
            },
        };
    }

    private isImplementableTask(element: Element): boolean {
        return IMPLEMENTABLE_TYPES.some((type) => is(element, type));
    }
}
