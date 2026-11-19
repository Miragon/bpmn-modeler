import { describe, expect, it } from "vitest";

import {
    DIFF_LEGEND_TEXTS,
    DIFF_PLANE_MISSING_TEXT,
    DIFF_SIDE_TEXTS,
} from "@miragon/bpmn-modeler-types";

import { DMN_DIFF_TEXTS } from "./diffTexts";

// The overlay keeps a diff text because this record names it; no browser harvest opens a diff pane.
const DMN_DIFF_HARVEST = "../../../../libs/bpmn-i18n-extras/tools/harvested-dmn-diff.json";
const DMN_DIFF_HARVEST_NOTE =
    "Templates the DMN diff pane's texts pass to translate(), recorded by apps/dmn-webview/src/domain/diffTextsHarvest.spec.ts. Refresh it with `corepack yarn vitest run --project dmn-webview -u apps/dmn-webview/src/domain/diffTextsHarvest.spec.ts`. Feeds the needed-key set alongside the browser harvests.";

describe("the DMN diff pane's harvest", () => {
    it("records every key the diff pane's texts pass to translate", async () => {
        const keys = [
            ...new Set([
                ...Object.values(DIFF_LEGEND_TEXTS),
                ...Object.values(DIFF_SIDE_TEXTS),
                DIFF_PLANE_MISSING_TEXT,
                ...Object.values(DMN_DIFF_TEXTS),
            ]),
        ].sort();
        const harvest = { note: DMN_DIFF_HARVEST_NOTE, count: keys.length, keys };

        await expect(`${JSON.stringify(harvest, null, 4)}\n`).toMatchFileSnapshot(DMN_DIFF_HARVEST);
    });
});
