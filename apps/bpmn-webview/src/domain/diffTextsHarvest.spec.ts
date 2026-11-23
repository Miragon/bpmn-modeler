import { describe, expect, it } from "vitest";

import {
    harvestNote,
    harvestRecord,
    harvestRecordPath,
    type HarvestFile,
} from "@miragon/bpmn-modeler-i18n-extras/testing";
import { DIFF_VIEW_KEYS } from "@miragon/bpmn-modeler-types/domain";

import { ELEMENT_XML_CHANGES_TITLE } from "./elementXmlTexts";

// The overlay keeps a diff text because this record names it; no browser harvest opens a diff pane.
const DIFF_HARVEST_FILE: HarvestFile = "harvested-diff.json";
const DIFF_HARVEST_SUBJECT = "Templates the BPMN diff pane's texts pass to translate()";

describe("the BPMN diff pane's harvest", () => {
    it("records every key the diff pane's texts pass to translate", async ({ task }) => {
        const keys = [...DIFF_VIEW_KEYS, ELEMENT_XML_CHANGES_TITLE];

        await expect(
            harvestRecord(harvestNote(DIFF_HARVEST_SUBJECT, task), keys),
        ).toMatchFileSnapshot(harvestRecordPath(DIFF_HARVEST_FILE));
    });
});
