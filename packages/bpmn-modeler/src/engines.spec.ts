import { describe, expect, it } from "vitest";

import { deriveEngines } from "./engines";

describe("deriveEngines", () => {
    it("maps a Camunda Cloud diagram with a version to a camunda engine", () => {
        expect(deriveEngines("Camunda Cloud", "8.7.0")).toEqual({ camunda: "8.7.0" });
    });

    it("returns {} for a Camunda Platform (C7) diagram", () => {
        expect(deriveEngines("Camunda Platform", "7.20.0")).toEqual({});
    });

    it("returns {} when the version is missing", () => {
        expect(deriveEngines("Camunda Cloud", undefined)).toEqual({});
        expect(deriveEngines("Camunda Cloud", "")).toEqual({});
    });

    it("returns {} when the platform is missing", () => {
        expect(deriveEngines(undefined, "8.7.0")).toEqual({});
    });
});
