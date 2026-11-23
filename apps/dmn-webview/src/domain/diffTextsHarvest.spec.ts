import { describe, expect, it } from "vitest";

import {
    harvestNote,
    harvestRecord,
    harvestRecordPath,
    type HarvestFile,
} from "@miragon/bpmn-modeler-i18n-extras/testing";
import { DIFF_VIEW_KEYS } from "@miragon/bpmn-modeler-types/domain";

import { DMN_DIFF_TEXTS } from "./diffTexts";

// The overlay keeps a diff text because this record names it; no browser harvest opens a diff pane.
const DMN_DIFF_HARVEST_FILE: HarvestFile = "harvested-dmn-diff.json";
const DMN_DIFF_HARVEST_SUBJECT = "Templates the DMN diff pane's texts pass to translate()";

describe("the DMN diff pane's harvest", () => {
    it("records every key the diff pane's texts pass to translate", async ({ task }) => {
        const keys = [...DIFF_VIEW_KEYS, ...Object.values(DMN_DIFF_TEXTS)];

        await expect(
            harvestRecord(harvestNote(DMN_DIFF_HARVEST_SUBJECT, task), keys),
        ).toMatchFileSnapshot(harvestRecordPath(DMN_DIFF_HARVEST_FILE));
    });
});
