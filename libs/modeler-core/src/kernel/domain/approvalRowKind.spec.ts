import { describe, expect, it } from "vitest";

import {
    allowanceMarkerOf,
    ApprovalRowReading,
    approvalRowReadingOf,
    approvalRowsOf,
    isApprovalRowOf,
    RULE_PACKAGE_CONTENT_HASH_PREFIX,
} from "./approvalRowKind";

const PLUGIN_HASH = "0123456789abcdef".repeat(4);

describe("allowanceMarkerOf", () => {
    it.each([
        { kind: "plugin" as const, marker: "allowance-v1:plugin" },
        { kind: "rulePackage" as const, marker: "allowance-v1:rulePackage" },
    ])("marks a $kind allowance row with the rule it was given under", ({ kind, marker }) => {
        expect(allowanceMarkerOf(kind)).toBe(marker);
    });
});

describe("approvalRowReadingOf", () => {
    it.each<{ case: string; contentHash: string; reading: ApprovalRowReading | undefined }>([
        {
            case: "a plugin allowance",
            contentHash: "allowance-v1:plugin",
            reading: { kind: "plugin", format: "allowance" },
        },
        {
            case: "a rule package allowance",
            contentHash: "allowance-v1:rulePackage",
            reading: { kind: "rulePackage", format: "allowance" },
        },
        {
            case: "a plugin's content hash",
            contentHash: PLUGIN_HASH,
            reading: { kind: "plugin", format: "content" },
        },
        {
            case: "a rule package's closure hash",
            contentHash: `bpmnlint-closure-v1:${"a".repeat(64)}`,
            reading: { kind: "rulePackage", format: "content" },
        },
        {
            case: "an allowance of an unknown kind",
            contentHash: "allowance-v1:theme",
            reading: undefined,
        },
        {
            case: "an allowance of a later rule",
            contentHash: "allowance-v2:plugin",
            reading: undefined,
        },
        { case: "an upper-case hash", contentHash: "A".repeat(64), reading: undefined },
        { case: "a shorter hash", contentHash: "a".repeat(63), reading: undefined },
        {
            case: "a hash that only mentions the closure marker",
            contentHash: "abc:bpmnlint-closure-v1:abc",
            reading: undefined,
        },
    ])("reads $case", ({ contentHash, reading }) => {
        expect(approvalRowReadingOf({ contentHash })).toEqual(reading);
    });

    it("keeps the closure marker version 1 that rule package rows were stored under", () => {
        expect(RULE_PACKAGE_CONTENT_HASH_PREFIX).toBe("bpmnlint-closure-v1:");
    });
});

describe("isApprovalRowOf", () => {
    it.each([
        {
            case: "a plugin row as a plugin's",
            kind: "plugin" as const,
            contentHash: PLUGIN_HASH,
            owned: true,
        },
        {
            case: "a plugin row as a rule package's",
            kind: "rulePackage" as const,
            contentHash: PLUGIN_HASH,
            owned: false,
        },
        {
            case: "a rule package allowance as a rule package's",
            kind: "rulePackage" as const,
            contentHash: "allowance-v1:rulePackage",
            owned: true,
        },
        {
            case: "an unknown row as a plugin's",
            kind: "plugin" as const,
            contentHash: "x",
            owned: false,
        },
    ])("tells $case: $owned", ({ kind, contentHash, owned }) => {
        expect(isApprovalRowOf(kind, { contentHash })).toBe(owned);
    });
});

describe("approvalRowsOf", () => {
    it("keeps the rows of one kind in their stored order", () => {
        const rows = [
            { pluginId: "/a", contentHash: PLUGIN_HASH },
            { pluginId: "/b", contentHash: "bpmnlint-closure-v1:x" },
            { pluginId: "/c", contentHash: "allowance-v1:plugin" },
        ];

        expect(approvalRowsOf("plugin", rows)).toEqual([rows[0], rows[2]]);
    });
});
