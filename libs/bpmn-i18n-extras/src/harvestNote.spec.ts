import { describe, expect, it } from "vitest";

import { harvestNote } from "./harvestNote";

describe("harvestNote", () => {
    it("names the recording spec from the repository root and the command that rerecords it", ({
        task,
    }) => {
        expect(harvestNote("Templates a view passes to translate()", task)).toBe(
            "Templates a view passes to translate(), recorded by libs/bpmn-i18n-extras/src/harvestNote.spec.ts. Refresh it with `corepack yarn vitest run --project bpmn-i18n-extras libs/bpmn-i18n-extras/src/harvestNote.spec.ts -u`. Feeds the needed-key set alongside the browser harvests.",
        );
    });

    it("refuses a recording spec whose Vitest project has no name to rerecord it with", ({
        task,
    }) => {
        const unnamedProject = { file: { filepath: task.file.filepath, projectName: undefined } };

        expect(() => harvestNote("Templates a view passes to translate()", unnamedProject)).toThrow(
            "no Vitest project name",
        );
    });
});
