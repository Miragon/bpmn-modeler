import { describe, expect, it } from "vitest";

import {
    harvestRecord,
    harvestRecordPath,
    type HarvestFile,
} from "@miragon/bpmn-modeler-i18n-extras/testing";

import { FORM_PREVIEW_KEYS } from "./formPreviewTexts";

// The overlay keeps a form preview text because this record names it; no browser harvest opens the preview.
const FORM_PREVIEW_HARVEST_FILE: HarvestFile = "harvested-form-preview.json";
const FORM_PREVIEW_HARVEST_NOTE =
    "Templates the linked form preview passes to translate(), recorded by apps/bpmn-webview/src/domain/formPreviewTextsHarvest.spec.ts. Refresh it with `corepack yarn vitest run --project bpmn-webview -u apps/bpmn-webview/src/domain/formPreviewTextsHarvest.spec.ts`. Feeds the needed-key set alongside the browser harvests.";

describe("the linked form preview's harvest", () => {
    it("records every key the form preview passes to translate", async () => {
        await expect(
            harvestRecord(FORM_PREVIEW_HARVEST_NOTE, FORM_PREVIEW_KEYS),
        ).toMatchFileSnapshot(harvestRecordPath(FORM_PREVIEW_HARVEST_FILE));
    });
});
