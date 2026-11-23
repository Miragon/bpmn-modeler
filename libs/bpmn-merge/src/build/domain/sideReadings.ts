import type { ModdleElement, ModdleParseResult } from "@miragon/bpmn-modeler-diff";

import type { DiagramIndex } from "./diagramIndex";
import { IndexedDocument } from "./indexedDocument";
import type { LayoutModel } from "./layout/layoutModel";
import { layoutModelOfDocument } from "./layout/layoutModelReader";
import { type VersionTree, versionTreeOf } from "./mergedTree";
import type { MergeSide } from "../../kernel/domain/mergeResult";
import { PlaneSlots } from "./planeSlots";

/**
 * What a build reads of its two sides, each read once after the hand merges splice in and before
 * the frame changes current: each side's diagrams, the plane slots of both, each side's layout,
 * and last each side's tree, as taking a tree apart empties the semantic tree the others read.
 */
export class SideReadings {
    readonly indexes: Readonly<Record<MergeSide, DiagramIndex>>;

    private constructor(
        private readonly documents: Readonly<Record<MergeSide, IndexedDocument>>,
        readonly slots: PlaneSlots,
        readonly layouts: Readonly<Record<MergeSide, LayoutModel>>,
        readonly trees: Readonly<Record<MergeSide, VersionTree>>,
    ) {
        this.indexes = { current: documents.current.index, incoming: documents.incoming.index };
    }

    static of(parsed: Readonly<Record<MergeSide, ModdleParseResult>>): SideReadings {
        const documents = {
            current: IndexedDocument.of(parsed.current.rootElement),
            incoming: IndexedDocument.of(parsed.incoming.rootElement),
        };
        const slots = PlaneSlots.ofSides(documents);
        const layouts = {
            current: layoutModelOfDocument(documents.current, slots),
            incoming: layoutModelOfDocument(documents.incoming, slots),
        };
        const trees = {
            current: versionTreeOf(documents.current.definitions),
            incoming: versionTreeOf(documents.incoming.definitions),
        };
        return new SideReadings(documents, slots, layouts, trees);
    }

    /** The repair keeps the first of two equally good moves, so this order lets current win a tie. */
    get layoutsCurrentFirst(): readonly LayoutModel[] {
        return [this.layouts.current, this.layouts.incoming];
    }

    /** The definitions the build turns into the result: current's. */
    get currentDefinitions(): ModdleElement {
        return this.documents.current.definitions;
    }
}
