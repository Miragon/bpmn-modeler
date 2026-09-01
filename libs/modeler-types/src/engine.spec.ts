import { describe, expect, it } from "vitest";

import { detectEngine } from "./engine";

describe("detectEngine", () => {
    it("detects c7 from the Camunda Platform execution-platform name", () => {
        expect(detectEngine('modeler:executionPlatform="Camunda Platform"')).toBe("c7");
    });

    it("detects c8 from the Camunda Cloud execution-platform name", () => {
        expect(detectEngine('modeler:executionPlatform="Camunda Cloud"')).toBe("c8");
    });

    it("falls back to the version major digit when no platform name is present", () => {
        expect(detectEngine('modeler:executionPlatformVersion="7.23.0"')).toBe("c7");
        expect(detectEngine('modeler:executionPlatformVersion="8.6.0"')).toBe("c8");
    });

    it("prefers the platform name over a contradicting version", () => {
        const xml =
            'modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="8.6.0"';
        expect(detectEngine(xml)).toBe("c7");
    });

    it("returns undefined for an unrecognised platform name and no usable version", () => {
        expect(detectEngine('modeler:executionPlatform="Some Other Platform"')).toBeUndefined();
    });

    it("returns undefined when there is no platform metadata", () => {
        expect(detectEngine("<bpmn:definitions />")).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
        expect(detectEngine("")).toBeUndefined();
    });
});
