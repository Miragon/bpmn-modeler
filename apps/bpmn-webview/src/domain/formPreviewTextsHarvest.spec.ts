import { describe, expect, it } from "vitest";

import {
    harvestNote,
    harvestRecord,
    harvestRecordPath,
    type HarvestFile,
} from "@miragon/bpmn-modeler-i18n-extras/testing";

import { FORM_PREVIEW_KEYS } from "./formPreviewTexts";

// The overlay keeps a form preview text because this record names it; no browser harvest opens the preview.
const FORM_PREVIEW_HARVEST_FILE: HarvestFile = "harvested-form-preview.json";
const FORM_PREVIEW_HARVEST_SUBJECT = "Templates the linked form preview passes to translate()";

describe("the linked form preview's harvest", () => {
    it("records every key the form preview passes to translate", async ({ task }) => {
        await expect(
            harvestRecord(harvestNote(FORM_PREVIEW_HARVEST_SUBJECT, task), FORM_PREVIEW_KEYS),
        ).toMatchFileSnapshot(harvestRecordPath(FORM_PREVIEW_HARVEST_FILE));
    });
});
