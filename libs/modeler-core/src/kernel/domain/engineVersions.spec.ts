import { describe, expect, it } from "vitest";

import { Engine } from "@miragon/bpmn-modeler-types";

import { C7_VERSIONS, C8_VERSIONS, engineVersionPrompt } from "./engineVersions";

describe("engineVersionPrompt", () => {
    it.each<{ platform: Engine; placeholder: string; versions: readonly string[] }>([
        { platform: "c7", placeholder: "Select Camunda 7 engine version", versions: C7_VERSIONS },
        { platform: "c8", placeholder: "Select Camunda 8 engine version", versions: C8_VERSIONS },
    ])("offers every $platform version, newest first", ({ platform, placeholder, versions }) => {
        expect(engineVersionPrompt(platform)).toEqual({
            id: "engineVersion",
            placeholder,
            items: versions.map((version) => ({ label: version, value: version })),
        });
    });
});
