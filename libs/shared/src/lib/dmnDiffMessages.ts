import type { DiffCounts, DiffOrigin, DiffSide, TableScroll } from "@miragon/bpmn-modeler-types";

import { Command, Query } from "./messages";

/** One decision table's changes as one DMN diff pane shows them. */
export interface DmnTableDiffView {
    readonly columns: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
        readonly changed: readonly string[];
    };
    readonly rules: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
        readonly changed: readonly string[];
        readonly moved: readonly string[];
    };
    readonly cells: readonly string[];
    readonly annotations: readonly string[];
    readonly properties: readonly string[];
    readonly counts: DiffCounts;
    readonly attributesStep?: string;
    readonly navigationOrder: readonly string[];
}

/**
 * What one DMN diff pane highlights: the result of `dmnSideView` in
 * `@miragon/dmn-modeler-diff`, which the core's `DmnDiffService` spec pins this
 * copy to. DRD ids, the DRD's counts and stepper order, each changed decision
 * table by decision id, and the decisions whose literal expression changed.
 */
export interface DmnDiffView {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly string[];
    readonly layoutChanged: readonly string[];
    readonly counts: DiffCounts;
    readonly navigationOrder: readonly string[];
    readonly tables: Readonly<Record<string, DmnTableDiffView>>;
    readonly expressions: readonly string[];
}

/**
 * Sent from the host to each pane of a DMN diff once both panes are ready.
 * Each side gets only the ids its own version contains.
 */
export class ApplyDmnDiffHighlightsQuery extends Query<"ApplyDmnDiffHighlightsQuery"> {
    public readonly side: DiffSide;

    public readonly view: DmnDiffView;

    /** Compare-files panes show their file name and a swap button; SCM panes neither. */
    public readonly origin: DiffOrigin;

    public readonly paneFilename: string;

    constructor(side: DiffSide, view: DmnDiffView, origin: DiffOrigin, paneFilename: string) {
        super("ApplyDmnDiffHighlightsQuery");
        this.side = side;
        this.view = view;
        this.origin = origin;
        this.paneFilename = paneFilename;
    }
}

/**
 * Sent from a DMN diff pane when the user opens a decision's table or
 * expression (its element id) or goes back to the DRD (`null`). The host
 * forwards it to the partner pane via {@link SyncDmnDiffViewQuery}.
 */
export class DmnDiffViewChangedCommand extends Command<"DmnDiffViewChangedCommand"> {
    public readonly elementId: string | null;

    constructor(elementId: string | null) {
        super("DmnDiffViewChangedCommand");
        this.elementId = elementId;
    }
}

/**
 * Sent from the host to a DMN diff pane to open the view the partner pane
 * opened. The pane must not re-emit {@link DmnDiffViewChangedCommand} for it.
 */
export class SyncDmnDiffViewQuery extends Query<"SyncDmnDiffViewQuery"> {
    public readonly elementId: string | null;

    constructor(elementId: string | null) {
        super("SyncDmnDiffViewQuery");
        this.elementId = elementId;
    }
}

/** Sent from a DMN diff pane after the user scrolled its decision table. */
export class DmnDiffScrollChangedCommand extends Command<"DmnDiffScrollChangedCommand"> {
    public readonly scroll: TableScroll;

    constructor(scroll: TableScroll) {
        super("DmnDiffScrollChangedCommand");
        this.scroll = scroll;
    }
}

/**
 * Sent from the host to a DMN diff pane to scroll its table like the partner
 * pane's. The pane must not re-emit {@link DmnDiffScrollChangedCommand} for it.
 */
export class SyncDmnDiffScrollQuery extends Query<"SyncDmnDiffScrollQuery"> {
    public readonly scroll: TableScroll;

    constructor(scroll: TableScroll) {
        super("SyncDmnDiffScrollQuery");
        this.scroll = scroll;
    }
}
