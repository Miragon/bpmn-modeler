import { describe, expect, it } from "vitest";

import { harvestRecord, type HarvestFile } from "@miragon/bpmn-modeler-i18n-extras";
import { DIFF_VIEW_KEYS } from "@miragon/bpmn-modeler-types";

import { ELEMENT_XML_CHANGES_TITLE } from "./elementXmlTexts";

// The overlay keeps a diff text because this record names it; no browser harvest opens a diff pane.
const DIFF_HARVEST_FILE: HarvestFile = "harvested-diff.json";
const DIFF_HARVEST_NOTE =
    "Templates the BPMN diff pane's texts pass to translate(), recorded by apps/bpmn-webview/src/domain/diffTextsHarvest.spec.ts. Refresh it with `corepack yarn vitest run --project bpmn-webview -u apps/bpmn-webview/src/domain/diffTextsHarvest.spec.ts`. Feeds the needed-key set alongside the browser harvests.";

describe("the BPMN diff pane's harvest", () => {
    it("records every key the diff pane's texts pass to translate", async () => {
        const keys = [...DIFF_VIEW_KEYS, ELEMENT_XML_CHANGES_TITLE];

        await expect(harvestRecord(DIFF_HARVEST_NOTE, keys)).toMatchFileSnapshot(
            `../../../../libs/bpmn-i18n-extras/tools/${DIFF_HARVEST_FILE}`,
        );
    });
});
