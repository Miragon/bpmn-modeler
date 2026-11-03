import { describe, expect, it } from "vitest";

import {
    emptySnapshot,
    parseSnapshot,
    serializeSnapshot,
    usableEntry,
    withEntry,
} from "./snapshot";

const COMMIT = "abc";
const FINDING = { key: "k", path: "src/a.ts", line: 1, message: "m" };

describe("a snapshot", () => {
    it.each([
        { case: "the same version", version: 2, usable: true },
        { case: "an older version", version: 1, usable: false },
        { case: "a newer version", version: 3, usable: false },
    ])("is usable for a function of $case", ({ version, usable }) => {
        const snapshot = withEntry(emptySnapshot(COMMIT), "coupling", { version: 2, findings: [] });

        expect(usableEntry(snapshot, { id: "coupling", version }) !== undefined).toBe(usable);
    });

    it.each([
        { case: "is missing", snapshot: undefined },
        { case: "lacks the function", snapshot: emptySnapshot(COMMIT) },
        { case: "only inherits the name", snapshot: emptySnapshot(COMMIT), id: "constructor" },
    ])("has no usable entry when it $case", ({ snapshot, id = "coupling" }) => {
        expect(usableEntry(snapshot, { id, version: 1 })).toBeUndefined();
    });

    it("replaces a function's entry and keeps the others", () => {
        const snapshot = withEntry(
            withEntry(emptySnapshot(COMMIT), "b", { version: 1, findings: [FINDING] }),
            "a",
            { version: 1, unmeasurable: "no history" },
        );

        expect(withEntry(snapshot, "b", { version: 2, findings: [] }).entries).toEqual({
            a: { version: 1, unmeasurable: "no history" },
            b: { version: 2, findings: [] },
        });
    });

    it("serializes to the same text whatever order its entries were added in", () => {
        const ab = withEntry(
            withEntry(emptySnapshot(COMMIT), "a", { version: 1, findings: [] }),
            "b",
            {
                version: 1,
                findings: [FINDING],
            },
        );
        const ba = withEntry(
            withEntry(emptySnapshot(COMMIT), "b", { version: 1, findings: [FINDING] }),
            "a",
            {
                version: 1,
                findings: [],
            },
        );

        expect(serializeSnapshot(ba)).toBe(serializeSnapshot(ab));
        expect(Object.keys(JSON.parse(serializeSnapshot(ba)).entries)).toEqual(["a", "b"]);
        expect(serializeSnapshot(ab).endsWith("}\n")).toBe(true);
    });

    it("keeps a finding's group when it reads back what it wrote", () => {
        const grouped = { ...FINDING, group: "hidden" };
        const snapshot = withEntry(emptySnapshot(COMMIT), "a", { version: 1, findings: [grouped] });

        expect(parseSnapshot(COMMIT, serializeSnapshot(snapshot)).entries.a).toEqual({
            version: 1,
            findings: [grouped],
        });
    });

    it("reads back what it wrote", () => {
        const snapshot = withEntry(
            withEntry(emptySnapshot(COMMIT), "a", { version: 1, findings: [FINDING] }),
            "b",
            { version: 3, unmeasurable: "the history ends" },
        );

        expect(parseSnapshot(COMMIT, serializeSnapshot(snapshot))).toEqual(snapshot);
    });

    it.each([
        { case: "no JSON", text: "{", problem: "is no JSON" },
        { case: "another schema", text: '{"schemaVersion":2}', problem: "schema version 2" },
        {
            case: "another commit",
            text: '{"schemaVersion":1,"commit":"def","entries":{}}',
            problem: "names commit def",
        },
        {
            case: "no entries",
            text: `{"schemaVersion":1,"commit":"${COMMIT}"}`,
            problem: "has no entries",
        },
        {
            case: "an entry without version",
            text: `{"schemaVersion":1,"commit":"${COMMIT}","entries":{"a":{"findings":[]}}}`,
            problem: "entry a has no positive integer version",
        },
        {
            case: "an entry without findings",
            text: `{"schemaVersion":1,"commit":"${COMMIT}","entries":{"a":{"version":1}}}`,
            problem: "entry a returned no list of findings",
        },
        { case: "null", text: "null", problem: "schema version undefined" },
    ])("is corrupt when it holds $case", ({ text, problem }) => {
        expect(() => parseSnapshot(COMMIT, text)).toThrow(`snapshot ${COMMIT}`);
        expect(() => parseSnapshot(COMMIT, text)).toThrow(problem);
    });
});
