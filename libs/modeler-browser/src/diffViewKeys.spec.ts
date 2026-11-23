import { describe, expect, it } from "vitest";

import {
    DIFF_CATEGORIES,
    DIFF_VIEW_KEYS,
    type DiffLegendTranslator,
} from "@miragon/bpmn-modeler-types";

import { DiffLegendView } from "./diffLegendView";
import { DiffSideLabelView } from "./diffSideLabelView";

class RecordingTranslator implements DiffLegendTranslator {
    readonly keys = new Set<string>();

    translate(key: string): string {
        this.keys.add(key);
        return key;
    }

    onChange(): () => void {
        return () => undefined;
    }
}

describe("DIFF_VIEW_KEYS", () => {
    it("names exactly the keys the shared diff views translate", () => {
        const translator = new RecordingTranslator();
        const parent = document.createElement("div");
        const legend = new DiffLegendView(
            parent,
            { onPrevious: () => undefined, onNext: () => undefined, onSwap: () => undefined },
            translator,
        );
        for (const status of DIFF_CATEGORIES) {
            legend.update({ status, showSwap: true, canStep: true });
        }
        for (const side of ["before", "after"] as const) {
            new DiffSideLabelView(parent, side, translator).showPlaneMissing(true);
        }

        expect([...translator.keys].sort()).toEqual([...DIFF_VIEW_KEYS].sort());
    });
});
