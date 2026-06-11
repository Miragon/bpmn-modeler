import { describe, expect, it } from "vitest";

import {
    buildMapJson,
    CODE_LINK_SCHEMA_VERSION,
    CodeLinkMapEntry,
    contentDeclaresBean,
    contentImplementsLiteral,
    fileMatchesEntry,
    matchesBeanClassName,
    matchesClassPath,
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
});

describe("CodeLinkMap — matchesClassPath", () => {
    it("matches a FQCN against its class file under any source root", () => {
        expect(
            matchesClassPath("com.example.Charge", "/a/src/main/java/com/example/Charge.java"),
        ).toBe(true);
        expect(matchesClassPath("com.example.Charge", "/a/com/example/Charge.kt")).toBe(true);
    });

    it("requires a segment boundary so a no-package class does not match a suffix collision", () => {
        // `Foo` must not match `MyFoo.java`.
        expect(matchesClassPath("Foo", "/src/MyFoo.java")).toBe(false);
        expect(matchesClassPath("Foo", "/src/Foo.java")).toBe(true);
    });

    it("does not match a different file extension", () => {
        expect(matchesClassPath("com.example.Charge", "/src/com/example/Charge.txt")).toBe(false);
    });
});

describe("CodeLinkMap — matchesBeanClassName", () => {
    it("matches the conventional capitalised class file for a bean id", () => {
        expect(matchesBeanClassName("myBean", "/src/MyBean.java")).toBe(true);
        expect(matchesBeanClassName("myBean", "/src/MyBean.kt")).toBe(true);
    });

    it("does not match an unrelated file name", () => {
        expect(matchesBeanClassName("myBean", "/src/OtherBean.java")).toBe(false);
    });
});

describe("CodeLinkMap — content matchers", () => {
    it("finds a quoted literal but ignores one inside an XML comment", () => {
        expect(contentImplementsLiteral('@JobWorker(type = "pay")', "pay")).toBe(true);
        expect(contentImplementsLiteral('<!-- "pay" -->', "pay")).toBe(false);
    });

    it("matches a Spring/CDI bean annotation carrying the exact bean id", () => {
        expect(contentDeclaresBean('@Service("myBean")', "myBean")).toBe(true);
        expect(contentDeclaresBean('@Component(value = "myBean")', "myBean")).toBe(true);
        expect(contentDeclaresBean('@Service("other")', "myBean")).toBe(false);
    });
});

describe("CodeLinkMap — fileMatchesEntry", () => {
    it("decides javaClass by path alone (content ignored)", () => {
        expect(
            fileMatchesEntry("javaClass", "com.example.Charge", "/x/com/example/Charge.java"),
        ).toBe(true);
    });

    it("decides a bean by class-file name OR annotation content", () => {
        expect(fileMatchesEntry("delegateExpression", "${myBean}", "/src/MyBean.java")).toBe(true);
        expect(
            fileMatchesEntry("expression", "${myBean}", "/src/Renamed.java", '@Service("myBean")'),
        ).toBe(true);
        expect(
            fileMatchesEntry("delegateExpression", "${myBean}", "/src/Renamed.java", "class X {}"),
        ).toBe(false);
    });

    it("decides a literal kind only when content is supplied", () => {
        expect(fileMatchesEntry("jobType", "pay", "/src/W.java", 'type = "pay"')).toBe(true);
        expect(fileMatchesEntry("jobType", "pay", "/src/W.java")).toBe(false);
        expect(fileMatchesEntry("externalTopic", "topic", "/src/W.java", '"topic"')).toBe(true);
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
