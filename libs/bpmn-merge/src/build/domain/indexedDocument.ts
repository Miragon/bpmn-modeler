import type { ModdleElement } from "@miragon/bpmn-modeler-diff";

import { DiagramIndex } from "./diagramIndex";

/** A document with its diagrams indexed once, so a reader that needs both takes them from one document. */
export class IndexedDocument {
    private constructor(
        readonly definitions: ModdleElement,
        readonly index: DiagramIndex,
    ) {}

    static of(definitions: ModdleElement): IndexedDocument {
        return new IndexedDocument(definitions, DiagramIndex.of(definitions));
    }
}
