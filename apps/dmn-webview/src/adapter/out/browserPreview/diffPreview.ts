import { ApplyDmnDiffHighlightsQuery, DmnFileQuery } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import { SHIPPING_AFTER_XML, SHIPPING_BEFORE_XML } from "../../../__fixtures__/shippingDiff";

/** One side of the shipping change, as a compare-files diff opens it. */
export function diffPaneDocument(side: DiffSide): DmnFileQuery {
    return new DmnFileQuery(side === "before" ? SHIPPING_BEFORE_XML : SHIPPING_AFTER_XML);
}

/** The real diff of the shipping change, as one side shows it. */
export async function diffPaneHighlights(side: DiffSide): Promise<ApplyDmnDiffHighlightsQuery> {
    const { computeDmnDiff, dmnSideView } = await import("@miragon/dmn-modeler-diff");
    const result = await computeDmnDiff(SHIPPING_BEFORE_XML, SHIPPING_AFTER_XML);
    return new ApplyDmnDiffHighlightsQuery(
        side,
        dmnSideView(result, side),
        "compare-files",
        side === "before" ? "shipping-v1.dmn" : "shipping-v2.dmn",
    );
}
