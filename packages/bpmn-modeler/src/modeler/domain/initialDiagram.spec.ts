import { detectEngine, getLatestVersion } from "@miragon/bpmn-modeler-types";
import { describe, expect, it } from "vitest";

import { initialDiagram } from "./initialDiagram";

describe("initialDiagram", () => {
    it("stamps a c7 execution platform detectable as c7", () => {
        const xml = initialDiagram("c7", getLatestVersion("c7"));
        expect(detectEngine(xml)).toBe("c7");
        expect(xml).toContain('modeler:executionPlatform="Camunda Platform"');
    });

    it("stamps a c8 execution platform detectable as c8", () => {
        const xml = initialDiagram("c8", getLatestVersion("c8"));
        expect(detectEngine(xml)).toBe("c8");
        expect(xml).toContain('modeler:executionPlatform="Camunda Cloud"');
    });

    it("marks the process executable", () => {
        expect(initialDiagram("c7", "7.23.0")).toContain('isExecutable="true"');
    });

    it("writes the version verbatim", () => {
        expect(initialDiagram("c8", "8.5.0")).toContain('modeler:executionPlatformVersion="8.5.0"');
    });

    it("leaves host scaffold policy out", () => {
        const xml = initialDiagram("c8", "8.9.0");
        expect(xml).not.toContain("exporter");
        expect(xml).not.toContain("xmlns:camunda");
        expect(xml).not.toContain("xmlns:zeebe");
    });
});
