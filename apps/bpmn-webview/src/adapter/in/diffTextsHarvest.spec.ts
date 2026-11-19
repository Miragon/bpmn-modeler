import { describe, expect, it } from "vitest";

import { DIFF_LEGEND_TEXTS, DIFF_PLANE_MISSING_TEXT } from "@miragon/bpmn-modeler-types";

import { ELEMENT_XML_CHANGES_TITLE } from "./elementXmlEntry";

// The overlay keeps a diff text because this record names it; no browser harvest opens a diff pane.
const DIFF_HARVEST = "../../../../../libs/bpmn-i18n-extras/tools/harvested-diff.json";
const DIFF_HARVEST_NOTE =
    "Templates the BPMN diff pane's texts pass to translate(), recorded by apps/bpmn-webview/src/adapter/in/diffTextsHarvest.spec.ts. Refresh it with `corepack yarn vitest run --project bpmn-webview -u apps/bpmn-webview/src/adapter/in/diffTextsHarvest.spec.ts`. Feeds the needed-key set alongside the browser harvests.";

describe("the BPMN diff pane's harvest", () => {
    it("records every key the diff pane's texts pass to translate", async () => {
        const keys = [
            ...new Set([
                ...Object.values(DIFF_LEGEND_TEXTS),
                DIFF_PLANE_MISSING_TEXT,
                ELEMENT_XML_CHANGES_TITLE,
            ]),
        ].sort();
        const harvest = { note: DIFF_HARVEST_NOTE, count: keys.length, keys };

        await expect(`${JSON.stringify(harvest, null, 4)}\n`).toMatchFileSnapshot(DIFF_HARVEST);
    });
});
