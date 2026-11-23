import ContextPadModule from "diagram-js/lib/features/context-pad";
import SelectionModule from "diagram-js/lib/features/selection";
import { escapeHTML } from "diagram-js/lib/util/EscapeUtil";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { bpmnElementIdOf, type BpmnDiagramElement } from "@miragon/bpmn-modeler/viewer";
import type { MergePadEntry } from "@miragon/bpmn-modeler-shared";

import { padEntryOf } from "../../domain/mergePaneCommands";
import type { MergePadDecision } from "../../domain/mergePadDecisions";
import { padDecisionText } from "../../domain/mergeTexts";
import type { MergeTranslate } from "../../domain/mergeTranslate";
import { ConnectionPadPlacement, connectionPadPlacementModule } from "./connectionPadPlacement";
import { MERGE_DECISION_ICONS } from "./mergeDecisionIcons";
import { installMergeTooltips, MERGE_TOOLTIP_ATTRIBUTE } from "./mergeTooltip";

import "./mergePickContextPad.css";

/** What the decision entries ask of the merge pane that adds them. */
export interface MergePickEntryConfig {
    /** Read on every pad opening: the host sends what each element allows with every state. */
    decisionsOf(elementId: string): readonly MergePadDecision[];
    decide(elementId: string, decision: MergePadDecision): void;
    /** Receives the provider once diagram-js built it, to refresh an open pad after each state. */
    attach(provider: MergePickContextPadProvider): void;
    /** Told of every selection change, a step's and the partner's included, whose pad a keyboard command runs. */
    selectionChanged(): void;
}

type PadTarget = BpmnDiagramElement | readonly BpmnDiagramElement[];

interface ContextPadEntry {
    group: string;
    html: string;
    action: { click: (event: Event, target: PadTarget) => void };
}

type ContextPadEntries = Record<string, ContextPadEntry>;

interface ContextPad {
    registerProvider(provider: MergePickContextPadProvider): void;
    isOpen(): boolean;
    open(target: PadTarget, force: boolean): void;
}

interface Selection {
    get(): readonly BpmnDiagramElement[];
}

interface Canvas {
    getRootElement(): unknown;
}

interface EventBus {
    on(event: string, listener: () => void): void;
}

const ENTRY_IDS: Record<MergePadEntry, string> = {
    keep: "merge-keep",
    keepInside: "merge-keep-inside",
    leaveOut: "merge-leave-out",
    keepRemovedWith: "merge-keep-removed-with",
    mergeXml: "merge-xml",
    undo: "merge-undo",
};

/**
 * The merge pane's decisions beside "Show XML changes", as icons at
 * diagram-js's place for the pad: keep the element from this pane's side,
 * with everything inside, leave it out, keep what was removed with it,
 * merge its XML by hand and undo the pick. The pane decides which apply. Each icon names its side in
 * its label and shows the merge chrome's styled tooltip, never a native
 * `title`, which would show a second one.
 */
export class MergePickContextPadProvider {
    static $inject = [
        "contextPad",
        "canvas",
        "selection",
        "eventBus",
        "translate",
        "mergePickEntryConfig",
        "connectionPadPlacement",
    ];

    constructor(
        private readonly contextPad: ContextPad,
        private readonly canvas: Canvas,
        private readonly selection: Selection,
        eventBus: EventBus,
        private readonly translate: MergeTranslate,
        private readonly entryConfig: MergePickEntryConfig,
        private readonly padPlacement: ConnectionPadPlacement,
    ) {
        contextPad.registerProvider(this);
        installMergeTooltips(document);
        eventBus.on("selection.changed", () => entryConfig.selectionChanged());
        entryConfig.attach(this);
    }

    /** The BPMN id of the element selected alone, whose pad shows its decisions; none for the root. */
    selectedElementId(): string | undefined {
        const selected = this.selection.get();
        const [only] = selected;
        return selected.length === 1 && only !== this.canvas.getRootElement()
            ? bpmnElementIdOf(only)
            : undefined;
    }

    /** Reopens an open pad, which diagram-js rebuilds only on a selection or element change, on the host's latest state. */
    refresh(): void {
        const [selected] = this.selection.get();
        if (selected !== undefined && this.contextPad.isOpen())
            this.contextPad.open(this.padPlacement.padTargetOf(selected), true);
    }

    /** A connection's pad, which {@link ConnectionPadPlacement} opens for it alone. */
    getMultiElementContextPadEntries(elements: BpmnDiagramElement[]): ContextPadEntries {
        const element = ConnectionPadPlacement.elementOf(elements);
        return element ? this.getContextPadEntries(element) : {};
    }

    getContextPadEntries(element: BpmnDiagramElement): ContextPadEntries {
        if (element === this.canvas.getRootElement()) return {};
        return Object.fromEntries(
            this.entryConfig
                .decisionsOf(bpmnElementIdOf(element))
                .map((decision) => [ENTRY_IDS[padEntryOf(decision)], this.entry(decision)]),
        );
    }

    private entry(decision: MergePadDecision): ContextPadEntry {
        const { label, tooltip } = padDecisionText(decision, this.translate);
        return {
            group: "merge-pick",
            html: `<button type="button" class="entry merge-pick-action" aria-label="${escapeHTML(label)}" ${MERGE_TOOLTIP_ATTRIBUTE}="${escapeHTML(tooltip)}">${MERGE_DECISION_ICONS[padEntryOf(decision)]}</button>`,
            action: {
                click: (_event, target) =>
                    this.entryConfig.decide(
                        bpmnElementIdOf(ConnectionPadPlacement.elementOf(target)!),
                        decision,
                    ),
            },
        };
    }
}

/** The merge pane's decision entries on diagram-js's context pad, with the shared translator. */
export function createMergePickModule(entryConfig: MergePickEntryConfig) {
    return {
        __depends__: [
            ContextPadModule,
            connectionPadPlacementModule,
            SelectionModule,
            TranslateModule,
        ],
        __init__: ["mergePickContextPadProvider"],
        mergePickContextPadProvider: ["type", MergePickContextPadProvider],
        mergePickEntryConfig: ["value", entryConfig],
    };
}
