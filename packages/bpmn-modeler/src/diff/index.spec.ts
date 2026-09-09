import { describe, expect, it } from "vitest";

import { ALL_EXECUTION_PROPERTY_FIXTURES } from "../../../../libs/bpmn-diff/src/__fixtures__/execution-properties";
import { computeDiff } from "./index";

describe("public diff wrapper execution properties", () => {
    it.each(ALL_EXECUTION_PROPERTY_FIXTURES)("compares $name", async (fixture) => {
        await expect(computeDiff(fixture.before, fixture.after)).resolves.toEqual(fixture.expected);
    });
});
