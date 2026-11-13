import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    approvalChangeBetween,
    approvalsAfter,
    approvalsKey,
    type CodeApproval,
    codeApprovalChange,
    type CodeApprovalChange,
    revoking,
} from "./codeApproval";

type CaseRow = [pluginId: string, contentHash: string];

interface ChangeCases {
    readonly merges: readonly {
        readonly name: string;
        readonly stored: readonly CaseRow[];
        readonly allow: readonly CaseRow[];
        readonly revoke: readonly string[];
        readonly result: readonly CaseRow[];
    }[];
    readonly rejected: readonly {
        readonly name: string;
        readonly allow: readonly CaseRow[];
        readonly revoke: readonly string[];
    }[];
}

const CHANGE_CASES = JSON.parse(
    readFileSync(resolve(__dirname, "codeApprovalChange.cases.json"), "utf8"),
) as ChangeCases;

const rowsOf = (rows: readonly CaseRow[]): CodeApproval[] =>
    rows.map(([pluginId, contentHash]) => ({ pluginId, contentHash }));

const resize = { id: "/repo/.camunda/plugins/resize-tasks" };
const palette = { id: "/repo/.camunda/plugins/reduced-palette" };

const other: CodeApproval = { pluginId: "/other", contentHash: "ccc" };

describe("codeApprovalChange", () => {
    it.each(CHANGE_CASES.rejected)("rejects $name", ({ allow, revoke }) => {
        expect(() => codeApprovalChange(rowsOf(allow), revoke)).toThrow(
            "An approval change names an id twice",
        );
    });

    it("keeps the rows and ids it was given, in their order", () => {
        const allow = [{ pluginId: resize.id, contentHash: "aaa" }, other];

        expect(codeApprovalChange(allow, [palette.id])).toEqual({
            allow,
            revoke: [palette.id],
        });
    });
});

describe("revoking", () => {
    it("revokes each id and allows nothing", () => {
        expect(revoking([resize.id, palette.id])).toEqual({
            allow: [],
            revoke: [resize.id, palette.id],
        });
    });
});

describe("approvalsAfter", () => {
    it.each(CHANGE_CASES.merges)("$name", ({ stored, allow, revoke, result }) => {
        expect(approvalsAfter(rowsOf(stored), codeApprovalChange(rowsOf(allow), revoke))).toEqual(
            rowsOf(result),
        );
    });

    it.each(CHANGE_CASES.rejected)(
        "rejects a change not built by codeApprovalChange with $name",
        ({ allow, revoke }) => {
            const change: CodeApprovalChange = { allow: rowsOf(allow), revoke };

            expect(() => approvalsAfter([other], change)).toThrow(
                "An approval change names an id twice",
            );
        },
    );

    it("stores only the id and the hash of an allowed row", () => {
        const row = { pluginId: resize.id, contentHash: "aaa", version: "1.2.0" };

        expect(approvalsAfter([], { allow: [row], revoke: [] })).toEqual([
            { pluginId: resize.id, contentHash: "aaa" },
        ]);
    });
});

describe("approvalChangeBetween", () => {
    const resizeRow: CodeApproval = { pluginId: resize.id, contentHash: "aaa" };
    const paletteRow: CodeApproval = { pluginId: palette.id, contentHash: "bbb" };

    it.each<{
        case: string;
        before: CodeApproval[];
        after: CodeApproval[];
        change: CodeApprovalChange;
    }>([
        {
            case: "nothing for the same rows in another order",
            before: [resizeRow, paletteRow],
            after: [paletteRow, resizeRow],
            change: { allow: [], revoke: [] },
        },
        {
            case: "an allow for an added row",
            before: [resizeRow],
            after: [resizeRow, paletteRow],
            change: { allow: [paletteRow], revoke: [] },
        },
        {
            case: "a revoke for a removed row",
            before: [resizeRow, paletteRow],
            after: [paletteRow],
            change: { allow: [], revoke: [resize.id] },
        },
        {
            case: "an allow for a row whose content changed",
            before: [resizeRow, paletteRow],
            after: [{ ...resizeRow, contentHash: "new" }, paletteRow],
            change: { allow: [{ ...resizeRow, contentHash: "new" }], revoke: [] },
        },
        {
            case: "allows and revokes together, each in its list's order",
            before: [resizeRow, other, paletteRow],
            after: [
                { ...paletteRow, contentHash: "new" },
                { pluginId: "/x", contentHash: "x" },
            ],
            change: {
                allow: [
                    { ...paletteRow, contentHash: "new" },
                    { pluginId: "/x", contentHash: "x" },
                ],
                revoke: [resize.id, other.pluginId],
            },
        },
        {
            case: "the first row of an id stored twice, as every reader takes it",
            before: [{ ...resizeRow, contentHash: "old" }],
            after: [resizeRow, { ...resizeRow, contentHash: "older" }],
            change: { allow: [resizeRow], revoke: [] },
        },
    ])("finds $case", ({ before, after, change }) => {
        expect(approvalChangeBetween(before, after)).toEqual(change);
    });

    it("turns the list before into the list after", () => {
        const before = [resizeRow, other];
        const after = [{ ...other, contentHash: "new" }, paletteRow];

        expect(approvalsKey(approvalsAfter(before, approvalChangeBetween(before, after)))).toBe(
            approvalsKey(after),
        );
    });
});

describe("approvalsKey", () => {
    const resizeRow: CodeApproval = { pluginId: resize.id, contentHash: "aaa" };

    it("is independent of the order of the rows", () => {
        expect(approvalsKey([other, resizeRow])).toBe(approvalsKey([resizeRow, other]));
    });

    it.each<{ case: string; approvals: CodeApproval[] }>([
        { case: "an added row", approvals: [resizeRow, other] },
        { case: "a removed row", approvals: [] },
        { case: "a row of other content", approvals: [{ ...resizeRow, contentHash: "bbb" }] },
        {
            case: "bytes moved between id and hash",
            approvals: [{ pluginId: `${resize.id}","`, contentHash: "aaa" }],
        },
    ])("changes with $case", ({ approvals }) => {
        expect(approvalsKey(approvals)).not.toBe(approvalsKey([resizeRow]));
    });

    it("ignores a field beyond the id and the hash", () => {
        expect(approvalsKey([{ ...resizeRow, version: "1" } as CodeApproval])).toBe(
            approvalsKey([resizeRow]),
        );
    });
});
