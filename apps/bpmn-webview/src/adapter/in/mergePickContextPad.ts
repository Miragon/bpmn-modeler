import ContextPadModule from "diagram-js/lib/features/context-pad";
import SelectionModule from "diagram-js/lib/features/selection";
import { escapeHTML } from "diagram-js/lib/util/EscapeUtil";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { bpmnElementIdOf, type BpmnDiagramElement } from "@miragon/bpmn-modeler/viewer";

import type { MergePadDecision } from "../../domain/mergePadDecisions";
import { type MergeTranslate, padDecisionText } from "../../domain/mergeTexts";
import {
    MERGE_DECISION_ICONS,
    type MergeDecisionGlyph,
    mergeDecisionGlyph,
} from "./mergeDecisionIcons";
import { installMergeTooltips, MERGE_TOOLTIP_ATTRIBUTE } from "./mergeTooltip";

import "./mergePickContextPad.css";

/** What the decision entries ask of the merge pane that adds them. */
export interface MergePickEntryConfig {
    /** Read on every pad opening: the host sends what each element allows with every state. */
    decisionsOf(elementId: string): readonly MergePadDecision[];
    decide(elementId: string, decision: MergePadDecision): void;
    /** Receives the provider once diagram-js built it, to refresh an open pad after each state. */
    attach(provider: MergePickContextPadProvider): void;
}

interface ContextPadEntry {
    group: string;
    html: string;
    action: { click: (event: Event, element: BpmnDiagramElement) => void };
}

type ContextPadEntries = Record<string, ContextPadEntry>;

interface ContextPad {
    registerProvider(provider: MergePickContextPadProvider): void;
    isOpen(): boolean;
    open(target: BpmnDiagramElement, force: boolean): void;
}

interface Selection {
    get(): readonly BpmnDiagramElement[];
}

interface Canvas {
    getRootElement(): unknown;
}

const ENTRY_IDS: Record<MergeDecisionGlyph, string> = {
    keep: "merge-keep",
    keepInside: "merge-keep-inside",
    leaveOut: "merge-leave-out",
    keepRemovedFlows: "merge-keep-removed-flows",
    undo: "merge-undo",
};

/**
 * The merge pane's decisions beside "Show XML changes", as icons at
 * diagram-js's place for the pad: keep the element from this pane's side,
 * with everything inside, leave it out, keep the flows removed with it and
 * undo the pick. The pane decides which apply. Each icon names its side in
 * its label and shows the merge chrome's styled tooltip, never a native
 * `title`, which would show a second one.
 */
export class MergePickContextPadProvider {
    static $inject = ["contextPad", "canvas", "selection", "translate", "mergePickEntryConfig"];

    constructor(
        private readonly contextPad: ContextPad,
        private readonly canvas: Canvas,
        private readonly selection: Selection,
        private readonly translate: MergeTranslate,
        private readonly entryConfig: MergePickEntryConfig,
    ) {
        contextPad.registerProvider(this);
        installMergeTooltips(document);
        entryConfig.attach(this);
    }

    /** Reopens an open pad, which diagram-js rebuilds only on a selection or element change, on the host's latest state. */
    refresh(): void {
        const [selected] = this.selection.get();
        if (selected !== undefined && this.contextPad.isOpen())
            this.contextPad.open(selected, true);
    }

    getContextPadEntries(element: BpmnDiagramElement): ContextPadEntries {
        if (element === this.canvas.getRootElement()) return {};
        return Object.fromEntries(
            this.entryConfig
                .decisionsOf(bpmnElementIdOf(element))
                .map((decision) => [ENTRY_IDS[mergeDecisionGlyph(decision)], this.entry(decision)]),
        );
    }

    private entry(decision: MergePadDecision): ContextPadEntry {
        const { label, tooltip } = padDecisionText(decision, this.translate);
        return {
            group: "merge-pick",
            html: `<button type="button" class="entry merge-pick-action" aria-label="${escapeHTML(label)}" ${MERGE_TOOLTIP_ATTRIBUTE}="${escapeHTML(tooltip)}">${MERGE_DECISION_ICONS[mergeDecisionGlyph(decision)]}</button>`,
            action: {
                click: (_event, clicked) =>
                    this.entryConfig.decide(bpmnElementIdOf(clicked), decision),
            },
        };
    }
}

/** The merge pane's decision entries on diagram-js's context pad, with the shared translator. */
export function createMergePickModule(entryConfig: MergePickEntryConfig) {
    return {
        __depends__: [ContextPadModule, SelectionModule, TranslateModule],
        __init__: ["mergePickContextPadProvider"],
        mergePickContextPadProvider: ["type", MergePickContextPadProvider],
        mergePickEntryConfig: ["value", entryConfig],
    };
}
