import { describe, expect, it } from "vitest";

import { ENGINE_EXECUTION_PLATFORM, ENGINES, Engine } from "@miragon/bpmn-modeler-types";

import {
    formEngineChange,
    formEngineStatusView,
    formPlatformPrompt,
    formVersionPrompt,
    readFormEngineMetadata,
    sameFormEngineMetadata,
} from "./formEngine";

const CLOUD = {
    executionPlatform: ENGINE_EXECUTION_PLATFORM.c8,
    executionPlatformVersion: "8.8.0",
};

describe("Form engine metadata", () => {
    it.each([
        [CLOUD, CLOUD],
        [{}, {}],
        [
            { executionPlatform: "Other", executionPlatformVersion: "99" },
            { executionPlatform: "Other", executionPlatformVersion: "99" },
        ],
        [
            { executionPlatform: null, executionPlatformVersion: 7 },
            { executionPlatform: null, executionPlatformVersion: 7 },
        ],
    ] as const)(
        "reads declared metadata without defaulting or normalizing %j",
        (metadata, expected) => {
            expect(readFormEngineMetadata(JSON.stringify({ components: [], ...metadata }))).toEqual(
                expected,
            );
        },
    );

    it.each(["{", "null", "[]", '"form"', "7"])("declines an invalid Form root: %s", (source) => {
        expect(readFormEngineMetadata(source)).toBeUndefined();
    });
});

describe("Form engine choices", () => {
    it("offers every canonical engine exactly once independently of presentation order", () => {
        const choices = formPlatformPrompt().items.map(({ value }) => value);
        expect([...choices].sort()).toEqual([...ENGINES].sort());
    });

    it("offers native platform labels separately from the JSON names", () => {
        expect(formPlatformPrompt()).toEqual({
            id: "formExecutionPlatform",
            placeholder: "Select execution platform",
            items: [
                { label: "Camunda Cloud", value: "c8" },
                { label: "Camunda 7", value: "c7" },
            ],
        });
    });

    it.each([
        ["c8", "Camunda Cloud", ["8.8.0", "8.9.0", "8.10.0"]],
        ["c7", "Camunda 7", ["7"]],
    ] as const)(
        "constrains %s versions independently of the BPMN registry",
        (engine, label, versions) => {
            expect(formVersionPrompt(engine)).toEqual({
                id: `${engine}FormEngineVersion`,
                placeholder: `Select ${label} engine version`,
                items: versions.map((version) => ({ label: version, value: version })),
            });
        },
    );

    it.each([
        ["c8", "8.8.0"],
        ["c8", "8.9.0"],
        ["c8", "8.10.0"],
        ["c7", "7"],
    ] as const)("commits a complete supported %s/%s pair", (engine, version) => {
        expect(formEngineChange({}, engine, version)).toEqual({
            kind: "changed",
            metadata: {
                executionPlatform: ENGINE_EXECUTION_PLATFORM[engine],
                executionPlatformVersion: version,
            },
        });
    });

    it.each([
        [undefined, undefined],
        ["c7", undefined],
        [undefined, "7"],
        ["c8", "7"],
        ["c7", "8.9.0"],
        ["c7", "7.24.0"],
        ["c8", "8.7.0"],
        ["c8", "8.11.0"],
        ["c8", ""],
    ] satisfies readonly (readonly [Engine | undefined, string | undefined])[])(
        "does not change metadata for an incomplete or incompatible selection %s/%s",
        (engine, version) => {
            expect(formEngineChange(CLOUD, engine, version)).toEqual({ kind: "unchanged" });
        },
    );

    it("does not change the existing pair", () => {
        expect(formEngineChange(CLOUD, "c8", "8.8.0")).toEqual({ kind: "unchanged" });
    });

    it("replaces unsupported metadata only after a complete explicit selection", () => {
        expect(
            formEngineChange(
                { executionPlatform: "Other", executionPlatformVersion: "99" },
                "c7",
                "7",
            ),
        ).toEqual({
            kind: "changed",
            metadata: {
                executionPlatform: ENGINE_EXECUTION_PLATFORM.c7,
                executionPlatformVersion: "7",
            },
        });
    });
});

describe("Form engine status", () => {
    it("shows invalid source as a warning without offering to repair it", () => {
        expect(formEngineStatusView(undefined)).toEqual({
            text: "Invalid Form JSON",
            icon: "warning",
            tone: "warning",
        });
    });

    it("renders malformed structured metadata instead of coercing it to an object label", () => {
        expect(
            formEngineStatusView({
                executionPlatform: { custom: "engine" },
                executionPlatformVersion: [7],
            }),
        ).toEqual(expect.objectContaining({ text: '{"custom":"engine"} ([7])', tone: "warning" }));
    });

    it.each([
        [CLOUD, "Camunda Cloud (8.8.0)"],
        [
            { executionPlatform: ENGINE_EXECUTION_PLATFORM.c7, executionPlatformVersion: "7" },
            "Camunda 7 (7)",
        ],
    ] as const)("shows the declared supported pair %j", (metadata, text) => {
        expect(formEngineStatusView(metadata)).toEqual({
            text,
            icon: "engine",
            tooltip: "Click to change engine version",
            tone: "neutral",
            action: "changeEngineVersion",
        });
    });

    it.each([
        [{}, "Not configured (Not configured)"],
        [{ executionPlatform: "Camunda Cloud" }, "Camunda Cloud (Not configured)"],
        [{ executionPlatformVersion: "8.8.0" }, "Not configured (8.8.0)"],
        [{ executionPlatform: "Other", executionPlatformVersion: "99" }, "Other (99)"],
        [
            { executionPlatform: "Camunda Cloud", executionPlatformVersion: "8.7.0" },
            "Camunda Cloud (8.7.0)",
        ],
        [
            { executionPlatform: "Camunda Platform", executionPlatformVersion: "7.24.0" },
            "Camunda 7 (7.24.0)",
        ],
        [{ executionPlatform: null, executionPlatformVersion: 7 }, "null (7)"],
    ] as const)("visibly preserves missing or unsupported metadata %j", (metadata, text) => {
        expect(formEngineStatusView(metadata)).toEqual(
            expect.objectContaining({
                text,
                tone: "warning",
                action: "changeEngineVersion",
            }),
        );
    });
});

describe("Form metadata staleness", () => {
    it("compares the two declarations independently of property ordering", () => {
        expect(
            sameFormEngineMetadata(
                { executionPlatformVersion: "7", executionPlatform: "Camunda Platform" },
                { executionPlatform: "Camunda Platform", executionPlatformVersion: "7" },
            ),
        ).toBe(true);
    });

    it("does not conflate missing and explicit null metadata", () => {
        expect(sameFormEngineMetadata({}, { executionPlatform: null })).toBe(false);
    });
});
