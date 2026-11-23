import { SCRIPT_FILE, SPEC_FILE } from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

import * as vitestTargetFiles from "../../../.github/scripts/vitest-target-files.mjs";

describe("the files the Vitest target check scans", () => {
    it("are the script files of the fitness functions", () => {
        expect(vitestTargetFiles.SCRIPT_FILE).toEqual(SCRIPT_FILE);
    });

    it("tell a spec as the fitness functions do", () => {
        expect(vitestTargetFiles.SPEC_FILE).toEqual(SPEC_FILE);
    });
});
