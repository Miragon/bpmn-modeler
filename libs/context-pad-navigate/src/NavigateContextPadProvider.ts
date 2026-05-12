/**
 * bpmn-js context-pad provider that contributes a "Navigate to referenced
 * model" action.  The action appears on the floating context pad around the
 * selected element for Call Activities (with a resolvable
 * `calledElement` / `zeebe:calledElement processId`) and Business Rule
 * Tasks (with `camunda:decisionRef` / `zeebe:calledDecision decisionId`).
 *
 * Clicking the entry sends a {@link NavigateToReferencedModelCommand} to
 * the extension host, which performs the workspace lookup and opens the
 * referenced `.bpmn` or `.dmn` file.
 *
 * The entry is rendered as an inline `html` fragment with an embedded SVG
 * (same approach as the `append` entry from `bpmn-js-create-append-anything`)
 * and is placed in the `connect` group so it shares a row with the existing
 * connect icon rather than starting a fresh row.
 *
 * The pad is a 72-px-wide column that wraps entries 3-per-row inside each
 * `data-group` div.  On a Call Activity the default groups are: `model`
 * (6 entries — 2 full rows), `edit` (3 — 1 full row), `connect` (1).  Putting
 * a 7th entry in `model` or a 4th in `edit` leaves an orphan row of 1, so we
 * use `connect` (1 + 1 = 2) to avoid the lonely row.
 */
import { is } from "bpmn-js/lib/util/ModelUtil";

import { NavigateToReferencedModelCommand } from "@miragon/bpmn-modeler-shared";

import {
    BusinessObjectLike,
    extractReference,
    ReferenceKind,
} from "./extractReference";

interface ContextPad {
    registerProvider(provider: NavigateContextPadProvider): void;
}

interface Translate {
    (template: string): string;
}

interface Element {
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
 * Classic "external link" glyph — a rectangle with an outgoing arrow.
 * Sized 22×22 to match the context pad's entry box and drawn with
 * `currentColor` so it inherits the theme's foreground.
 */
const NAVIGATE_ICON_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>`;

/**
 * Constructor-registered provider.  bpmn-js' `contextPad` collects entries
 * by calling {@link getContextPadEntries} on every registered provider; we
 * only contribute when the selected element actually references a model.
 *
 * The `vsCodeBridge` DI value is supplied by the bpmn-webview during
 * modeler construction so this library does not call `acquireVsCodeApi`
 * itself (it may only be invoked once per webview).
 */
export class NavigateContextPadProvider {
    static $inject = ["contextPad", "translate", "vsCodeBridge"];

    private readonly translate: Translate;

    private readonly vsCodeBridge: VsCodeBridge;

    constructor(
        contextPad: ContextPad,
        translate: Translate,
        vsCodeBridge: VsCodeBridge,
    ) {
        this.translate = translate;
        this.vsCodeBridge = vsCodeBridge;
        contextPad.registerProvider(this);
    }

    /**
     * Called by the context pad for the selected element.  Returns a single
     * entry when the element has a resolvable process / decision reference,
     * or an empty object otherwise (no contribution).
     *
     * @param element The currently selected element.
     */
    getContextPadEntries(element: Element): ContextPadEntries {
        const kind = this.detectKind(element);
        if (!kind) {
            return {};
        }
        if (!extractReference(element.businessObject, kind)) {
            return {};
        }

        const postMessage = (latestReferenceId: string) => {
            this.vsCodeBridge.postMessage(
                new NavigateToReferencedModelCommand(latestReferenceId, kind),
            );
        };

        return {
            "navigate-to-referenced-model": {
                group: "connect",
                html: `<div class="entry">${NAVIGATE_ICON_SVG}</div>`,
                title: this.translate("Navigate to referenced model"),
                action: {
                    // Re-extract on click so an edit made between pad-render
                    // and click (e.g. via keyboard in the properties panel)
                    // navigates to the current id, not a stale one.
                    click: (_event, clickedElement) => {
                        const current = extractReference(
                            clickedElement.businessObject,
                            kind,
                        );
                        if (current) {
                            postMessage(current);
                        }
                    },
                },
            },
        };
    }

    private detectKind(element: Element): ReferenceKind | undefined {
        if (is(element, "bpmn:CallActivity")) {
            return "process";
        }
        if (is(element, "bpmn:BusinessRuleTask")) {
            return "decision";
        }
        return undefined;
    }
}
