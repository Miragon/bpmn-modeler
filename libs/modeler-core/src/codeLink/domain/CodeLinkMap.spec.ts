import { describe, expect, it } from "vitest";

import {
    buildMapJson,
    CODE_LINK_SCHEMA_VERSION,
    CodeLinkMapEntry,
    parseMapJson,
    toAbsolute,
    toAbsoluteEntries,
    toRelative,
} from "./CodeLinkMap";

describe("CodeLinkMap — path conversion", () => {
    it("relativises and re-absolutises a workspace path round-trip", () => {
        const abs = "/work/proj/src/main/java/com/example/Charge.java";
        const root = "/work/proj";
        expect(toRelative(abs, root)).toBe("src/main/java/com/example/Charge.java");
        expect(toAbsolute(toRelative(abs, root), root)).toBe(abs);
    });

    it("keeps the UNC root when re-absolutising a path on a share", () => {
        const abs = "//server/share/proj/src/main/java/com/example/Charge.java";
        const root = "//server/share/proj";
        expect(toAbsolute(toRelative(abs, root), root)).toBe(abs);
    });
});

describe("CodeLinkMap — JSON artifact", () => {
    const entries: CodeLinkMapEntry[] = [
        {
            activityId: "Activity_Charge",
            kind: "javaClass",
            reference: "com.example.Charge",
            resolved: true,
            paths: ["/work/proj/src/main/java/com/example/Charge.java"],
        },
        {
            activityId: "Activity_Mail",
            kind: "jobType",
            reference: "send-mail",
            resolved: false,
            paths: [],
        },
    ];

    it("builds a workspace-relative artifact including unresolved entries", () => {
        const json = buildMapJson({
            bpmnFile: "src/main/resources/order.bpmn",
            generatedAt: "2026-06-03T10:15:30.000Z",
            workspaceRoot: "/work/proj",
            entries,
        });

        expect(json).toEqual({
            schemaVersion: CODE_LINK_SCHEMA_VERSION,
            bpmnFile: "src/main/resources/order.bpmn",
            generatedAt: "2026-06-03T10:15:30.000Z",
            entries: [
                {
                    activityId: "Activity_Charge",
                    kind: "javaClass",
                    reference: "com.example.Charge",
                    resolved: true,
                    paths: ["src/main/java/com/example/Charge.java"],
                },
                {
                    activityId: "Activity_Mail",
                    kind: "jobType",
                    reference: "send-mail",
                    resolved: false,
                    paths: [],
                },
            ],
        });
    });

    it("round-trips through parse + toAbsoluteEntries", () => {
        const json = buildMapJson({
            bpmnFile: "order.bpmn",
            generatedAt: "t",
            workspaceRoot: "/work/proj",
            entries,
        });
        const parsed = parseMapJson(JSON.stringify(json));
        expect(parsed).toBeDefined();
        const rehydrated = toAbsoluteEntries(parsed!, "/work/proj");
        expect(rehydrated).toEqual(entries);
    });

    it("returns undefined for malformed or wrong-schema input rather than throwing", () => {
        expect(parseMapJson("not json")).toBeUndefined();
        expect(parseMapJson(JSON.stringify({ schemaVersion: 999, entries: [] }))).toBeUndefined();
        expect(
            parseMapJson(JSON.stringify({ schemaVersion: CODE_LINK_SCHEMA_VERSION })),
        ).toBeUndefined();
    });

    it("returns undefined when any entry is malformed (whole file dropped, never throws)", () => {
        const wrap = (entries: unknown[]) =>
            JSON.stringify({ schemaVersion: CODE_LINK_SCHEMA_VERSION, entries });

        // A null element — the case that would NPE in toAbsoluteEntries.
        expect(parseMapJson(wrap([null]))).toBeUndefined();
        // A missing field (no `paths`).
        expect(
            parseMapJson(
                wrap([{ activityId: "A", kind: "jobType", reference: "pay", resolved: true }]),
            ),
        ).toBeUndefined();
        // `resolved` of the wrong type.
        expect(
            parseMapJson(
                wrap([
                    {
                        activityId: "A",
                        kind: "jobType",
                        reference: "pay",
                        resolved: "yes",
                        paths: [],
                    },
                ]),
            ),
        ).toBeUndefined();
        // `paths` not a string array.
        expect(
            parseMapJson(
                wrap([
                    {
                        activityId: "A",
                        kind: "jobType",
                        reference: "pay",
                        resolved: true,
                        paths: [42],
                    },
                ]),
            ),
        ).toBeUndefined();
        // One bad entry alongside a valid one still drops the whole file.
        expect(
            parseMapJson(
                wrap([
                    {
                        activityId: "A",
                        kind: "jobType",
                        reference: "pay",
                        resolved: true,
                        paths: ["src/W.java"],
                    },
                    null,
                ]),
            ),
        ).toBeUndefined();
    });
});
