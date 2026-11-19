import OutlineModule from "bpmn-js/lib/features/outline";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import { escapeHTML } from "diagram-js/lib/util/EscapeUtil";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { bpmnElementIdOf, type BpmnDiagramElement } from "@miragon/bpmn-modeler/viewer";

import { ELEMENT_XML_CHANGES_TITLE } from "../../domain/elementXmlTexts";
import { CODE_ICON_SVG } from "./elementXmlEntry";

import "./elementXmlContextPad.css";

/** What the entry asks of the diff pane that adds it. */
export interface ElementXmlChangesEntryConfig {
    /** Read on every pad opening: the host announces it after the pane is built. */
    canShowElementXmlChanges(): boolean;
    showElementXmlChanges(elementId: string): void;
}

interface ContextPadEntry {
    group: string;
    html: string;
    title: string;
    action: { click: (event: Event, element: BpmnDiagramElement) => void };
}

type ContextPadEntries = Record<string, ContextPadEntry>;

interface ContextPad {
    registerProvider(provider: ElementXmlChangesContextPadProvider): void;
}

interface Canvas {
    getRootElement(): unknown;
}

type Translate = (template: string) => string;

/** One context-pad entry that asks the host for the element's XML changes. */
export class ElementXmlChangesContextPadProvider {
    static $inject = ["contextPad", "canvas", "translate", "elementXmlChangesEntryConfig"];

    constructor(
        contextPad: ContextPad,
        private readonly canvas: Canvas,
        private readonly translate: Translate,
        private readonly entryConfig: ElementXmlChangesEntryConfig,
    ) {
        contextPad.registerProvider(this);
    }

    getContextPadEntries(element: BpmnDiagramElement): ContextPadEntries {
        if (
            !this.entryConfig.canShowElementXmlChanges() ||
            element === this.canvas.getRootElement()
        ) {
            return {};
        }
        const title = this.translate(ELEMENT_XML_CHANGES_TITLE);
        return {
            "element-xml-changes": {
                group: "element-xml",
                html: `<button type="button" class="entry element-xml-changes-action" aria-label="${escapeHTML(title)}">${CODE_ICON_SVG}</button>`,
                title,
                action: {
                    click: (_event, clickedElement) =>
                        this.entryConfig.showElementXmlChanges(bpmnElementIdOf(clickedElement)),
                },
            },
        };
    }
}

/**
 * The diff pane's context pad: diagram-js's (bpmn-js's needs modeling), the
 * outline that shows the selection, and the shared translator for the entry.
 */
export function createElementXmlChangesModule(entryConfig: ElementXmlChangesEntryConfig) {
    return {
        __depends__: [ContextPadModule, OutlineModule, TranslateModule],
        __init__: ["elementXmlChangesContextPadProvider"],
        elementXmlChangesContextPadProvider: ["type", ElementXmlChangesContextPadProvider],
        elementXmlChangesEntryConfig: ["value", entryConfig],
    };
}
