/**
 * bpmn-js context-pad provider that contributes a "Navigate to referenced
 * model" action.  The action appears on the floating context pad around the
 * selected element for Call Activities (with a resolvable
 * `calledElement` / `zeebe:calledElement processId`), Business Rule Tasks
 * (with `camunda:decisionRef` / `zeebe:calledDecision decisionId`), and C8 User
 * Tasks whose `zeebe:formDefinition formId` resolves to a workspace form.
 *
 * Clicking the entry calls {@link ModelNavigationPort.openReference}; the
 * consumer performs the workspace lookup and opens the referenced `.bpmn`,
 * `.dmn`, or `.form` file.
 * An optional preview capability adds a separate read-only linked-form action.
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

import type { ReferenceKind } from "@miragon/bpmn-modeler-types";

import { extractReference } from "./extractReference";
import type { BusinessObjectLike } from "./extractReference";
import type { FormReferenceStatusClient } from "./FormReferenceStatusClient";
import type { ModelNavigationPort } from "./ModelNavigationPort";
import type { FormPreviewController } from "./FormPreviewController";

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
 * The `modelNavigationPort` DI value is supplied by the consumer during
 * modeler construction; the module cannot be registered without it (see
 * {@link createModelNavigationModule}), so the library stays free of the
 * host protocol.
 */
export class NavigateContextPadProvider {
    static $inject = [
        "contextPad",
        "translate",
        "modelNavigationPort",
        "formReferenceStatusClient",
        "formPreviewController",
    ];

    private readonly translate: Translate;

    private readonly port: ModelNavigationPort;

    constructor(
        contextPad: ContextPad,
        translate: Translate,
        modelNavigationPort: ModelNavigationPort,
        private readonly formReferenceStatusClient: FormReferenceStatusClient,
        private readonly formPreviewController?: Pick<
            FormPreviewController,
            "isVisible" | "openManual"
        >,
    ) {
        this.translate = translate;
        this.port = modelNavigationPort;
        contextPad.registerProvider(this);
    }

    /**
     * Called by the context pad for the selected element. Returns navigation
     * entries when the element has a resolvable process, decision, or form reference,
     * or an empty object otherwise (no contribution).
     *
     * @param element The currently selected element.
     */
    getContextPadEntries(element: Element): ContextPadEntries {
        const kind = this.detectKind(element);
        if (!kind) {
            return {};
        }
        const reference = extractReference(element.businessObject, kind);
        if (
            !reference ||
            (kind === "form" && !this.formReferenceStatusClient.isResolved(reference))
        ) {
            return {};
        }

        const entries: ContextPadEntries = {
            "navigate-to-referenced-model": {
                group: "connect",
                html: `<div class="entry">${NAVIGATE_ICON_SVG}</div>`,
                title: this.translate("Navigate to referenced model"),
                action: {
                    // Re-extract on click so an edit made between pad-render
                    // and click (e.g. via keyboard in the properties panel)
                    // navigates to the current id, not a stale one.
                    click: (_event, clickedElement) => {
                        const current = extractReference(clickedElement.businessObject, kind);
                        if (
                            current &&
                            (kind !== "form" || this.formReferenceStatusClient.isResolved(current))
                        ) {
                            this.port.openReference({ id: current, kind });
                        }
                    },
                },
            },
        };
        if (
            kind === "form" &&
            (this.port.formPreview || this.port.previewForm) &&
            !this.formPreviewController?.isVisible(element)
        ) {
            const title = this.translate("Preview linked form");
            entries["preview-linked-form"] = {
                group: "connect",
                html: '<button type="button" class="entry" aria-label="Preview linked form" style="border:0;padding:0;color:inherit;font:inherit"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>',
                title,
                action: {
                    click: (_event, clickedElement) => {
                        const current = extractReference(clickedElement.businessObject, "form");
                        if (current && this.formReferenceStatusClient.isResolved(current)) {
                            if (this.port.formPreview)
                                this.formPreviewController?.openManual(clickedElement);
                            else void this.port.previewForm?.({ id: current, kind: "form" });
                        }
                    },
                },
            };
        }
        return entries;
    }

    private detectKind(element: Element): ReferenceKind | undefined {
        if (is(element, "bpmn:CallActivity")) {
            return "process";
        }
        if (is(element, "bpmn:BusinessRuleTask")) {
            return "decision";
        }
        if (is(element, "bpmn:UserTask")) {
            return "form";
        }
        return undefined;
    }
}
