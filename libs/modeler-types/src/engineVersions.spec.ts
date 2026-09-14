import { describe, expect, it } from "vitest";

import { C7_VERSIONS, C8_VERSIONS, getLatestVersion, getVersions } from "./engineVersions";

describe("getVersions", () => {
    it("returns the Camunda 7 list for c7", () => {
        expect(getVersions("c7")).toBe(C7_VERSIONS);
    });

    it("returns the Camunda 8 list for c8", () => {
        expect(getVersions("c8")).toBe(C8_VERSIONS);
    });
});

describe("getLatestVersion", () => {
    it("returns the first (newest) c7 entry", () => {
        expect(getLatestVersion("c7")).toBe(C7_VERSIONS[0]);
    });

    it("returns the first (newest) c8 entry", () => {
        expect(getLatestVersion("c8")).toBe(C8_VERSIONS[0]);
    });
});
