import { describe, expect, it } from "vitest";

import {
    harvestRecord,
    harvestRecordPath,
    type HarvestFile,
} from "@miragon/bpmn-modeler-i18n-extras/testing";
import { DIFF_VIEW_KEYS } from "@miragon/bpmn-modeler-types";

import { DMN_DIFF_TEXTS } from "./diffTexts";

// The overlay keeps a diff text because this record names it; no browser harvest opens a diff pane.
const DMN_DIFF_HARVEST_FILE: HarvestFile = "harvested-dmn-diff.json";
const DMN_DIFF_HARVEST_NOTE =
    "Templates the DMN diff pane's texts pass to translate(), recorded by apps/dmn-webview/src/domain/diffTextsHarvest.spec.ts. Refresh it with `corepack yarn vitest run --project dmn-webview -u apps/dmn-webview/src/domain/diffTextsHarvest.spec.ts`. Feeds the needed-key set alongside the browser harvests.";

describe("the DMN diff pane's harvest", () => {
    it("records every key the diff pane's texts pass to translate", async () => {
        const keys = [...DIFF_VIEW_KEYS, ...Object.values(DMN_DIFF_TEXTS)];

        await expect(harvestRecord(DMN_DIFF_HARVEST_NOTE, keys)).toMatchFileSnapshot(
            harvestRecordPath(DMN_DIFF_HARVEST_FILE),
        );
    });
});
