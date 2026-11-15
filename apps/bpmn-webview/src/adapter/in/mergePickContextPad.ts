import ContextPadModule from "diagram-js/lib/features/context-pad";
import { escapeHTML } from "diagram-js/lib/util/EscapeUtil";
import type { MergePanePickable, MergePickScope } from "@miragon/bpmn-modeler-shared";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { bpmnElementIdOf, type BpmnDiagramElement } from "@miragon/bpmn-modeler/viewer";

import { MERGE_PICK_TEXTS } from "../../domain/mergeTexts";

import "./mergePickContextPad.css";

/** What the pick entries ask of the merge pane that adds them. */
export interface MergePickEntryConfig {
    /** Read on every pad opening: the host sends what each element allows with every state. */
    pickableOf(elementId: string): MergePanePickable | undefined;
    pick(elementId: string, scope: MergePickScope): void;
    unpick(elementId: string, scope: MergePickScope): void;
}

interface ContextPadEntry {
    group: string;
    html: string;
    title: string;
    action: { click: (event: Event, element: BpmnDiagramElement) => void };
}

type ContextPadEntries = Record<string, ContextPadEntry>;

interface ContextPad {
    registerProvider(provider: MergePickContextPadProvider): void;
}

interface Canvas {
    getRootElement(): unknown;
}

type Translate = (template: string) => string;

const ICON = (paths: string) =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;

const KEEP_ICON = ICON(`<path d="M20 6 9 17l-5-5"/>`);
const KEEP_INSIDE_ICON = ICON(
    `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m16 9-5.5 6L8 12.5"/>`,
);
const UNDO_ICON = ICON(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`);

/**
 * The merge pane's pick entries beside "Show XML changes": keep the element
 * from this pane's side, keep everything inside a container, and undo the
 * user's pick. The host decides which apply; the pad only offers them.
 */
export class MergePickContextPadProvider {
    static $inject = ["contextPad", "canvas", "translate", "mergePickEntryConfig"];

    constructor(
        contextPad: ContextPad,
        private readonly canvas: Canvas,
        private readonly translate: Translate,
        private readonly entryConfig: MergePickEntryConfig,
    ) {
        contextPad.registerProvider(this);
    }

    getContextPadEntries(element: BpmnDiagramElement): ContextPadEntries {
        if (element === this.canvas.getRootElement()) return {};
        const pickable = this.entryConfig.pickableOf(bpmnElementIdOf(element));
        if (pickable === undefined) return {};
        const entries: ContextPadEntries = {
            "merge-keep": this.entry(MERGE_PICK_TEXTS.keepThis, KEEP_ICON, (id) =>
                this.entryConfig.pick(id, "element"),
            ),
        };
        if (pickable.container) {
            entries["merge-keep-inside"] = this.entry(
                MERGE_PICK_TEXTS.keepInside,
                KEEP_INSIDE_ICON,
                (id) => this.entryConfig.pick(id, "withContents"),
            );
        }
        const { undo } = pickable;
        if (undo !== undefined) {
            entries["merge-undo"] = this.entry(MERGE_PICK_TEXTS.undo, UNDO_ICON, (id) =>
                this.entryConfig.unpick(id, undo),
            );
        }
        return entries;
    }

    private entry(text: string, icon: string, run: (elementId: string) => void): ContextPadEntry {
        const title = this.translate(text);
        return {
            group: "merge-pick",
            html: `<button type="button" class="entry merge-pick-action" aria-label="${escapeHTML(title)}">${icon}</button>`,
            title,
            action: { click: (_event, clicked) => run(bpmnElementIdOf(clicked)) },
        };
    }
}

/** The merge pane's pick entries on diagram-js's context pad, with the shared translator. */
export function createMergePickModule(entryConfig: MergePickEntryConfig) {
    return {
        __depends__: [ContextPadModule, TranslateModule],
        __init__: ["mergePickContextPadProvider"],
        mergePickContextPadProvider: ["type", MergePickContextPadProvider],
        mergePickEntryConfig: ["value", entryConfig],
    };
}
