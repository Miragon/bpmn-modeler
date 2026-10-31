import { describe, expect, it } from "vitest";

import { deriveEngines, type Engines } from "./engines";

const MODELER_NAMESPACE = "http://camunda.org/schema/modeler/1.0";

interface EnginesCase {
    given: string;
    attributes: Record<string, string>;
    expected: Engines;
}

describe("deriveEngines", () => {
    it.each<EnginesCase>([
        {
            given: "a Camunda 8 diagram under the modeler prefix",
            attributes: {
                "xmlns:modeler": MODELER_NAMESPACE,
                "modeler:executionPlatform": "Camunda Cloud",
                "modeler:executionPlatformVersion": "8.7.0",
            },
            expected: { camunda: "8.7.0" },
        },
        {
            given: "a Camunda 8 diagram under another prefix bound to the modeler namespace",
            attributes: {
                "xmlns:cm": MODELER_NAMESPACE,
                "cm:executionPlatform": "Camunda Cloud",
                "cm:executionPlatformVersion": "8.7.0",
            },
            expected: { camunda: "8.7.0" },
        },
        {
            given: "a Camunda 8 diagram under the modeler prefix without a binding",
            attributes: {
                "modeler:executionPlatform": "Camunda Cloud",
                "modeler:executionPlatformVersion": "8.7.0",
            },
            expected: { camunda: "8.7.0" },
        },
        {
            given: "the modeler prefix bound to another namespace",
            attributes: {
                "xmlns:modeler": "urn:other",
                "xmlns:cm": MODELER_NAMESPACE,
                "modeler:executionPlatform": "Camunda Cloud",
                "modeler:executionPlatformVersion": "8.7.0",
            },
            expected: {},
        },
        {
            given: "a Camunda 7 diagram",
            attributes: {
                "xmlns:modeler": MODELER_NAMESPACE,
                "modeler:executionPlatform": "Camunda Platform",
                "modeler:executionPlatformVersion": "7.20.0",
            },
            expected: {},
        },
        {
            given: "a Camunda 8 diagram without a version",
            attributes: {
                "xmlns:modeler": MODELER_NAMESPACE,
                "modeler:executionPlatform": "Camunda Cloud",
            },
            expected: {},
        },
        {
            given: "a Camunda 8 diagram with an empty version",
            attributes: {
                "xmlns:modeler": MODELER_NAMESPACE,
                "modeler:executionPlatform": "Camunda Cloud",
                "modeler:executionPlatformVersion": "",
            },
            expected: {},
        },
        {
            given: "a diagram with a version but no platform",
            attributes: {
                "xmlns:modeler": MODELER_NAMESPACE,
                "modeler:executionPlatformVersion": "8.7.0",
            },
            expected: {},
        },
    ])("derives the engine profile of $given", ({ attributes, expected }) => {
        expect(deriveEngines(attributes)).toEqual(expected);
    });
});
