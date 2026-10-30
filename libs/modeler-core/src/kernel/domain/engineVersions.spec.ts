import { describe, expect, it } from "vitest";

import { Engine } from "@miragon/bpmn-modeler-types";

import { C7_VERSIONS, C8_VERSIONS, engineVersionPrompt } from "./engineVersions";

describe("engineVersionPrompt", () => {
    it.each<{ platform: Engine; id: string; placeholder: string; versions: readonly string[] }>([
        {
            platform: "c7",
            id: "c7EngineVersion",
            placeholder: "Select Camunda 7 engine version",
            versions: C7_VERSIONS,
        },
        {
            platform: "c8",
            id: "c8EngineVersion",
            placeholder: "Select Camunda 8 engine version",
            versions: C8_VERSIONS,
        },
    ])(
        "offers every $platform version, newest first, as a prompt of its own",
        ({ platform, id, placeholder, versions }) => {
            expect(engineVersionPrompt(platform)).toEqual({
                id,
                placeholder,
                items: versions.map((version) => ({ label: version, value: version })),
            });
        },
    );
});
