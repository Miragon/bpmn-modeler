import type { ModdleElement } from "@miragon/bpmn-modeler-diff";

import { IndexedDocument } from "../indexedDocument";
import type { LayoutModel } from "../layoutModel";
import { layoutModelOfDocument } from "../layoutModelReader";
import { PlaneSlots } from "../planeSlots";

/** The document's layout in the merge's `slots`, by default its own, whose slots match the merge's by `equals` only. */
export function layoutModelOf(definitions: ModdleElement, slots?: PlaneSlots): LayoutModel {
    const document = IndexedDocument.of(definitions);
    return layoutModelOfDocument(document, slots ?? PlaneSlots.ofDocument(document));
}
