import type { ModdleElement } from "@miragon/bpmn-modeler-diff";

import { IndexedDocument } from "../build/domain/indexedDocument";
import type { LayoutModel } from "../build/domain/layout/layoutModel";
import { layoutModelOfDocument } from "../build/domain/layout/layoutModelReader";
import { PlaneSlots } from "../build/domain/planeSlots";

/** The document's layout in the merge's `slots`, by default its own, whose slots match the merge's by `equals` only. */
export function layoutModelOf(definitions: ModdleElement, slots?: PlaneSlots): LayoutModel {
    const document = IndexedDocument.of(definitions);
    return layoutModelOfDocument(document, slots ?? PlaneSlots.ofDocument(document));
}
