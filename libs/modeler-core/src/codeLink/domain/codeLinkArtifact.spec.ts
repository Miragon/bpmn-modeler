import { describe, expect, it } from "vitest";

import { CODE_LINK_SCHEMA_VERSION, parseMapJson, toAbsolute, toRelative } from "./codeLinkArtifact";

describe("codeLinkArtifact — path conversion", () => {
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

    it("climbs out of the root for a file in another workspace folder", () => {
        const abs = "/work/lib/src/Charge.java";
        const root = "/work/proj";
        expect(toRelative(abs, root)).toBe("../lib/src/Charge.java");
        expect(toAbsolute(toRelative(abs, root), root)).toBe(abs);
    });
});

describe("codeLinkArtifact — parseMapJson", () => {
    it("accepts a current-schema artifact", () => {
        const artifact = {
            schemaVersion: CODE_LINK_SCHEMA_VERSION,
            bpmnFile: "order.bpmn",
            generatedAt: "t",
            entries: [
                {
                    activityId: "A",
                    kind: "jobType",
                    reference: "pay",
                    resolved: true,
                    paths: ["src/W.java"],
                },
            ],
        };

        expect(parseMapJson(JSON.stringify(artifact))).toEqual(artifact);
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

        // A null element — the case that would NPE in CodeLinkMap.fromArtifact.
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

    it("returns undefined for a JSON null rather than throwing", () => {
        expect(parseMapJson("null")).toBeUndefined();
    });

    it.each<{ field: "activityId" | "kind" | "reference"; value: unknown }>([
        { field: "activityId", value: 1 },
        { field: "kind", value: null },
        { field: "reference", value: ["pay"] },
    ])("returns undefined when an entry's $field is not a string", ({ field, value }) => {
        const valid = {
            activityId: "A",
            kind: "jobType",
            reference: "pay",
            resolved: true,
            paths: [],
        };

        expect(
            parseMapJson(
                JSON.stringify({
                    schemaVersion: CODE_LINK_SCHEMA_VERSION,
                    entries: [{ ...valid, [field]: value }],
                }),
            ),
        ).toBeUndefined();
    });
});
