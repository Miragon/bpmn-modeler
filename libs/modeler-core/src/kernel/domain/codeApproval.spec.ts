import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import {
    allowing,
    type ApprovableArtifact,
    approvalChangeBetween,
    type ApprovalState,
    type CarriedApproval,
    carriedApprovals,
    approvalOutcome,
    approvalsAfter,
    approvalsKey,
    approvalStateOf,
    approvedArtifacts,
    CODE_STATE_TEXT,
    CODE_STATES,
    type CodeApproval,
    type CodeApprovalChange,
    codeApprovalChange,
    type CodeApprovalOutcome,
    type CodePresence,
    type CodeState,
    type CodeStateReading,
    codeStateOf,
    declineKeyOf,
    declinedKeys,
    type FollowedApprovalChange,
    followedApprovalChange,
    foundCodeState,
    isLeftForView,
    needsContentHash,
    notAskedAgain,
    orphanedCarries,
    type PendingCodeApproval,
    pendingApprovalDescription,
    isApprovedState,
    pendingApprovals,
    placesAllowing,
    presenceIdOf,
    PROCESS_RESTART_TEXT,
    PROCESS_RESTARTS,
    type ReviewAnswer,
    type ReviewedAllow,
    reviewedAllowDecision,
    revoking,
    revokingContent,
    SESSION_ANSWERS,
    type SessionAnswer,
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

const resize: ApprovableArtifact = {
    id: "/repo/.camunda/plugins/resize-tasks",
    name: "Resize Tasks",
    contentHash: "aaa",
};
const palette: ApprovableArtifact = {
    id: "/repo/.camunda/plugins/reduced-palette",
    name: "Reduced Palette",
    contentHash: "bbb",
};

/** Not a webview plugin: carries a field of its own, which every result keeps. */
interface RulePackage extends ApprovableArtifact {
    readonly version: string;
}
const acmeRules: RulePackage = {
    id: "/repo/node_modules/bpmnlint-plugin-acme",
    name: "bpmnlint-plugin-acme",
    contentHash: "bpmnlint-closure-v1:ddd",
    version: "1.2.0",
};

const other: CodeApproval = { pluginId: "/other", contentHash: "ccc" };

describe("approvalStateOf", () => {
    it.each<{
        case: string;
        artifact: ApprovableArtifact;
        approvals: CodeApproval[];
        state: ApprovalState;
    }>([
        { case: "no approval", artifact: resize, approvals: [], state: "new" },
        {
            case: "an approval of this content",
            artifact: resize,
            approvals: [{ pluginId: resize.id, contentHash: "aaa" }],
            state: "approved",
        },
        {
            case: "an approval of other content, after a pull or an update",
            artifact: resize,
            approvals: [{ pluginId: resize.id, contentHash: "old" }],
            state: "changed",
        },
        {
            case: "an approval of the same content in another folder",
            artifact: resize,
            approvals: [{ pluginId: "/elsewhere/resize-tasks", contentHash: "aaa" }],
            state: "approved",
        },
        {
            case: "an old row here and this content allowed in another folder",
            artifact: resize,
            approvals: [
                { pluginId: resize.id, contentHash: "old" },
                { pluginId: "/elsewhere/resize-tasks", contentHash: "aaa" },
            ],
            state: "approved",
        },
        {
            case: "other content allowed in another folder",
            artifact: resize,
            approvals: [{ pluginId: "/elsewhere/resize-tasks", contentHash: "aab" }],
            state: "new",
        },
        {
            case: "a plugin row of the same digest, which never approves a rule package",
            artifact: acmeRules,
            approvals: [{ pluginId: "/elsewhere/.camunda/plugins/acme", contentHash: "ddd" }],
            state: "new",
        },
        {
            case: "a rule package approved beside webview plugins",
            artifact: acmeRules,
            approvals: [
                { pluginId: resize.id, contentHash: "aaa" },
                { pluginId: acmeRules.id, contentHash: "bpmnlint-closure-v1:ddd" },
            ],
            state: "approved",
        },
        {
            case: "a rule package whose closure changed",
            artifact: acmeRules,
            approvals: [{ pluginId: acmeRules.id, contentHash: "bpmnlint-closure-v1:old" }],
            state: "changed",
        },
    ])("is $state with $case", ({ artifact, approvals, state }) => {
        expect(approvalStateOf(artifact, approvals)).toBe(state);
    });
});

describe("approvedArtifacts", () => {
    it.each<{ case: string; approvals: CodeApproval[]; approved: ApprovableArtifact[] }>([
        {
            case: "keeps only the artifacts whose current content the user allowed",
            approvals: [
                { pluginId: resize.id, contentHash: "aaa" },
                { pluginId: palette.id, contentHash: "old" },
            ],
            approved: [resize],
        },
        {
            case: "keeps every artifact the user allowed as it is",
            approvals: [
                { pluginId: resize.id, contentHash: "aaa" },
                { pluginId: palette.id, contentHash: "bbb" },
            ],
            approved: [resize, palette],
        },
        {
            case: "keeps an artifact whose content the user allowed in another folder",
            approvals: [{ pluginId: "/elsewhere/resize-tasks", contentHash: "aaa" }],
            approved: [resize],
        },
        { case: "keeps none without approvals", approvals: [], approved: [] },
    ])("$case", ({ approvals, approved }) => {
        expect(approvedArtifacts([resize, palette], approvals)).toEqual(approved);
    });

    it("returns the artifacts it was given, with their own fields", () => {
        const approved: RulePackage[] = approvedArtifacts(
            [acmeRules],
            [{ pluginId: acmeRules.id, contentHash: acmeRules.contentHash }],
        );

        expect(approved).toEqual([acmeRules]);
    });
});

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

describe("allowing", () => {
    it("allows each artifact by its content and stores no field of its own", () => {
        expect(allowing([resize, acmeRules])).toEqual({
            allow: [
                { pluginId: resize.id, contentHash: "aaa" },
                { pluginId: acmeRules.id, contentHash: "bpmnlint-closure-v1:ddd" },
            ],
            revoke: [],
        });
    });

    it("rejects one artifact named twice", () => {
        expect(() => allowing([resize, { ...resize, contentHash: "new" }])).toThrow(
            "An approval change names an id twice",
        );
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

describe("placesAllowing and revokingContent", () => {
    const here = resize.id;
    const elsewhere = "/elsewhere/.camunda/plugins/resize-tasks";
    const third = "/third/.camunda/plugins/resize-tasks";

    it.each<{
        case: string;
        approvals: CodeApproval[];
        places: string[];
        revoke: string[];
    }>([
        {
            case: "only this place",
            approvals: [{ pluginId: here, contentHash: "aaa" }, other],
            places: [here],
            revoke: [here],
        },
        {
            case: "this place and every other holder, this place first",
            approvals: [
                { pluginId: elsewhere, contentHash: "aaa" },
                other,
                { pluginId: here, contentHash: "aaa" },
                { pluginId: third, contentHash: "aaa" },
            ],
            places: [elsewhere, here, third],
            revoke: [here, elsewhere, third],
        },
        {
            case: "this place without a row, naming it",
            approvals: [{ pluginId: elsewhere, contentHash: "aaa" }],
            places: [elsewhere],
            revoke: [here, elsewhere],
        },
        {
            case: "this place's row of older content goes too",
            approvals: [
                { pluginId: here, contentHash: "old" },
                { pluginId: elsewhere, contentHash: "aaa" },
            ],
            places: [elsewhere],
            revoke: [here, elsewhere],
        },
        {
            case: "rows of other content stay",
            approvals: [other, { pluginId: third, contentHash: "aab" }],
            places: [],
            revoke: [here],
        },
        {
            case: "a place stored twice, named once",
            approvals: [
                { pluginId: elsewhere, contentHash: "aaa" },
                { pluginId: elsewhere, contentHash: "aaa" },
            ],
            places: [elsewhere],
            revoke: [here, elsewhere],
        },
    ])("withdraws $case", ({ approvals, places, revoke }) => {
        expect(placesAllowing("aaa", approvals)).toEqual(places);
        expect(revokingContent(here, "aaa", approvals)).toEqual(revoking(revoke));
    });
});

describe("carriedApprovals", () => {
    const elsewhere = "/elsewhere/.camunda/plugins/resize-tasks";
    const third = "/third/.camunda/plugins/resize-tasks";
    const copy: ApprovableArtifact = { ...resize, id: "/worktree/.camunda/plugins/resize-tasks" };

    it.each<{
        case: string;
        artifacts: ApprovableArtifact[];
        approvals: CodeApproval[];
        carried: CarriedApproval[];
    }>([
        { case: "nothing without a row", artifacts: [resize], approvals: [], carried: [] },
        {
            case: "nothing for content its own row holds",
            artifacts: [resize],
            approvals: [
                { pluginId: elsewhere, contentHash: "aaa" },
                { pluginId: resize.id, contentHash: "aaa" },
            ],
            carried: [],
        },
        {
            case: "code allowed only in another folder, from the first row holding it",
            artifacts: [resize, palette],
            approvals: [
                other,
                { pluginId: elsewhere, contentHash: "aaa" },
                { pluginId: third, contentHash: "aaa" },
            ],
            carried: [{ artifact: resize, allowedAt: elsewhere }],
        },
        {
            case: "an old row here and the content allowed elsewhere",
            artifacts: [resize],
            approvals: [
                { pluginId: resize.id, contentHash: "old" },
                { pluginId: elsewhere, contentHash: "aaa" },
            ],
            carried: [{ artifact: resize, allowedAt: elsewhere }],
        },
        {
            case: "one place found twice, named once",
            artifacts: [resize, { ...resize, name: "Again" }],
            approvals: [{ pluginId: elsewhere, contentHash: "aaa" }],
            carried: [{ artifact: resize, allowedAt: elsewhere }],
        },
        {
            case: "two places of one content, each",
            artifacts: [resize, copy],
            approvals: [{ pluginId: elsewhere, contentHash: "aaa" }],
            carried: [
                { artifact: resize, allowedAt: elsewhere },
                { artifact: copy, allowedAt: elsewhere },
            ],
        },
        {
            case: "nothing for other content elsewhere",
            artifacts: [resize],
            approvals: [{ pluginId: elsewhere, contentHash: "aab" }],
            carried: [],
        },
        {
            case: "a place stored twice, its first row of older content, from another place first",
            artifacts: [resize],
            approvals: [
                { pluginId: resize.id, contentHash: "old" },
                { pluginId: resize.id, contentHash: "aaa" },
                { pluginId: elsewhere, contentHash: "aaa" },
            ],
            carried: [{ artifact: resize, allowedAt: elsewhere }],
        },
        {
            case: "a place stored twice with no other holder, from its own later row",
            artifacts: [resize],
            approvals: [
                { pluginId: resize.id, contentHash: "old" },
                { pluginId: resize.id, contentHash: "aaa" },
            ],
            carried: [{ artifact: resize, allowedAt: resize.id }],
        },
    ])("carries $case", ({ artifacts, approvals, carried }) => {
        expect(carriedApprovals(artifacts, approvals)).toEqual(carried);
    });

    it("keeps the artifacts' own fields, so a writer can allow them as they are", () => {
        const carried: CarriedApproval<RulePackage>[] = carriedApprovals(
            [acmeRules],
            [{ pluginId: "/elsewhere/node_modules/acme", contentHash: acmeRules.contentHash }],
        );

        expect(allowing(carried.map(({ artifact }) => artifact))).toEqual(allowing([acmeRules]));
    });
});

describe("orphanedCarries", () => {
    const copy: ApprovableArtifact = { ...resize, id: "/worktree/.camunda/plugins/resize-tasks" };
    const source = { pluginId: "/elsewhere/.camunda/plugins/resize-tasks", contentHash: "aaa" };
    const row = ({ id, contentHash }: ApprovableArtifact): CodeApproval => ({
        pluginId: id,
        contentHash,
    });

    it.each<{
        case: string;
        carried: ApprovableArtifact[];
        approvals: CodeApproval[];
        orphaned: string[];
    }>([
        {
            case: "none while another place holds the content",
            carried: [resize],
            approvals: [source, row(resize)],
            orphaned: [],
        },
        {
            case: "a carried row left alone after a revoke",
            carried: [resize],
            approvals: [row(resize), other],
            orphaned: [resize.id],
        },
        {
            case: "two carried rows of one content with no source",
            carried: [resize, copy],
            approvals: [row(resize), row(copy)],
            orphaned: [resize.id, copy.id],
        },
        {
            case: "a carried row of other content than the orphan, which stays",
            carried: [resize, palette],
            approvals: [row(resize), row(palette), { pluginId: "/x", contentHash: "bbb" }],
            orphaned: [resize.id],
        },
    ])("finds $case", ({ carried, approvals, orphaned }) => {
        expect(orphanedCarries(carried, approvals)).toEqual(orphaned);
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
            case: "the first row of an id stored twice, as approvalStateOf reads it",
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

describe("followedApprovalChange", () => {
    const resizeRow: CodeApproval = { pluginId: resize.id, contentHash: "aaa" };
    const paletteRow: CodeApproval = { pluginId: palette.id, contentHash: "bbb" };

    it.each<{
        case: string;
        before: CodeApproval[];
        after: CodeApproval[];
        followed: FollowedApprovalChange;
    }>([
        {
            case: "nothing withdrawn for an added row",
            before: [resizeRow],
            after: [resizeRow, paletteRow],
            followed: { change: { allow: [paletteRow], revoke: [] }, withdrawn: [] },
        },
        {
            case: "a removed row withdrawn",
            before: [resizeRow, paletteRow],
            after: [paletteRow],
            followed: { change: { allow: [], revoke: [resize.id] }, withdrawn: [resize.id] },
        },
        {
            case: "a row allowed at another content withdrawn",
            before: [resizeRow, paletteRow],
            after: [{ ...resizeRow, contentHash: "new" }, paletteRow],
            followed: {
                change: { allow: [{ ...resizeRow, contentHash: "new" }], revoke: [] },
                withdrawn: [resize.id],
            },
        },
        {
            case: "nothing withdrawn for a second row of an id the first row still allows",
            before: [resizeRow],
            after: [resizeRow, { ...resizeRow, contentHash: "older" }],
            followed: { change: { allow: [], revoke: [] }, withdrawn: [] },
        },
    ])("finds $case", ({ before, after, followed }) => {
        expect(followedApprovalChange(before, after)).toEqual(followed);
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

describe("declineKeyOf", () => {
    it.each<{ case: string; one: ApprovableArtifact; other: ApprovableArtifact }>([
        {
            case: "another content in the same folder",
            one: resize,
            other: { ...resize, contentHash: "new" },
        },
        {
            case: "the same content in another folder",
            one: resize,
            other: { ...resize, id: "/elsewhere" },
        },
    ])("names one version of one artifact, so it differs for $case", ({ one, other }) => {
        expect(declineKeyOf(one)).not.toBe(declineKeyOf(other));
    });

    it("names the same artifact the same way under another display name", () => {
        expect(declineKeyOf({ ...resize, name: "Renamed" })).toBe(declineKeyOf(resize));
    });
});

describe("pendingApprovals", () => {
    it.each<{
        case: string;
        approvals: CodeApproval[];
        declined: string[];
        pending: PendingCodeApproval<ApprovableArtifact>[];
    }>([
        {
            case: "asks about every artifact nobody allowed",
            approvals: [],
            declined: [],
            pending: [
                { artifact: resize, state: "new" },
                { artifact: palette, state: "new" },
            ],
        },
        {
            case: "skips an artifact whose current content is allowed",
            approvals: [{ pluginId: resize.id, contentHash: "aaa" }],
            declined: [],
            pending: [{ artifact: palette, state: "new" }],
        },
        {
            case: "asks about a changed artifact and skips one declined in this session",
            approvals: [{ pluginId: resize.id, contentHash: "old" }],
            declined: [declineKeyOf(palette)],
            pending: [{ artifact: resize, state: "changed" }],
        },
        {
            case: "asks again once a declined artifact changes",
            approvals: [],
            declined: [declineKeyOf({ ...palette, contentHash: "old" })],
            pending: [
                { artifact: resize, state: "new" },
                { artifact: palette, state: "new" },
            ],
        },
        {
            case: "asks nothing about content allowed in another folder",
            approvals: [
                { pluginId: "/elsewhere/resize-tasks", contentHash: "aaa" },
                { pluginId: "/elsewhere/reduced-palette", contentHash: "bbb" },
            ],
            declined: [],
            pending: [],
        },
        {
            case: "asks nothing when every artifact is allowed or declined",
            approvals: [{ pluginId: resize.id, contentHash: "aaa" }],
            declined: [declineKeyOf(palette)],
            pending: [],
        },
    ])("$case", ({ approvals, declined, pending }) => {
        expect(pendingApprovals([resize, palette], approvals, new Set(declined))).toEqual(pending);
    });

    it("asks about a changed rule package and keeps its own fields", () => {
        const pending: PendingCodeApproval<RulePackage>[] = pendingApprovals(
            [acmeRules],
            [{ pluginId: acmeRules.id, contentHash: "bpmnlint-closure-v1:old" }],
            new Set(),
        );

        expect(pending).toEqual([{ artifact: acmeRules, state: "changed" }]);
    });
});

describe("approvalOutcome", () => {
    const pending: PendingCodeApproval<ApprovableArtifact>[] = [
        { artifact: resize, state: "new" },
        { artifact: palette, state: "changed" },
    ];
    const checked = (...ids: string[]): ReviewAnswer => ({ kind: "checked", ids });
    const resizeCopy: ApprovableArtifact = {
        ...resize,
        id: "/worktree/.camunda/plugins/resize-tasks",
    };

    it.each<{
        case: string;
        answer: ReviewAnswer;
        outcome: CodeApprovalOutcome<ApprovableArtifact>;
    }>([
        {
            case: "allows the checked artifacts and declines the rest for this session",
            answer: checked(palette.id),
            outcome: {
                allowed: [palette],
                answers: new Map([[declineKeyOf(resize), "declined"]]),
            },
        },
        {
            case: "allows every artifact when all are checked",
            answer: checked(resize.id, palette.id),
            outcome: { allowed: [resize, palette], answers: new Map() },
        },
        {
            case: "declines every artifact when the list is dismissed",
            answer: checked(),
            outcome: {
                allowed: [],
                answers: new Map([
                    [declineKeyOf(resize), "declined"],
                    [declineKeyOf(palette), "declined"],
                ]),
            },
        },
        {
            case: "allows nothing for a checked id that was not asked about",
            answer: checked("/elsewhere/resize-tasks"),
            outcome: {
                allowed: [],
                answers: new Map([
                    [declineKeyOf(resize), "declined"],
                    [declineKeyOf(palette), "declined"],
                ]),
            },
        },
        {
            case: "allows only the asked-about artifacts among the checked ids",
            answer: checked("/elsewhere/resize-tasks", resize.id),
            outcome: {
                allowed: [resize],
                answers: new Map([[declineKeyOf(palette), "declined"]]),
            },
        },
        {
            case: "leaves every artifact to the view, allowing and declining none",
            answer: { kind: "leftForView" },
            outcome: {
                allowed: [],
                answers: new Map([
                    [declineKeyOf(resize), "leftForView"],
                    [declineKeyOf(palette), "leftForView"],
                ]),
            },
        },
    ])("$case", ({ answer, outcome }) => {
        expect(approvalOutcome(pending, answer)).toEqual(outcome);
    });

    it.each<{
        case: string;
        answer: ReviewAnswer;
        outcome: CodeApprovalOutcome<ApprovableArtifact>;
    }>([
        {
            case: "a checked artifact allows every pending copy of its content and declines none of them",
            answer: checked(resize.id),
            outcome: { allowed: [resize, resizeCopy], answers: new Map() },
        },
        {
            case: "checking the other copy allows both",
            answer: checked(resizeCopy.id),
            outcome: { allowed: [resize, resizeCopy], answers: new Map() },
        },
        {
            case: "unchecked copies of unchecked content are each declined",
            answer: checked(),
            outcome: {
                allowed: [],
                answers: new Map([
                    [declineKeyOf(resize), "declined"],
                    [declineKeyOf(resizeCopy), "declined"],
                ]),
            },
        },
    ])("$case", ({ answer, outcome }) => {
        expect(
            approvalOutcome(
                [
                    { artifact: resize, state: "new" },
                    { artifact: resizeCopy, state: "new" },
                ],
                answer,
            ),
        ).toEqual(outcome);
    });

    it("declines unchecked other content beside a checked copy", () => {
        expect(
            approvalOutcome(
                [
                    { artifact: resize, state: "new" },
                    { artifact: resizeCopy, state: "new" },
                    { artifact: palette, state: "changed" },
                ],
                checked(resizeCopy.id),
            ),
        ).toEqual({
            allowed: [resize, resizeCopy],
            answers: new Map([[declineKeyOf(palette), "declined"]]),
        });
    });

    it("allows a checked rule package as it was asked about", () => {
        const outcome: CodeApprovalOutcome<RulePackage> = approvalOutcome(
            [{ artifact: acmeRules, state: "new" }],
            { kind: "checked", ids: [acmeRules.id] },
        );

        expect(outcome).toEqual({ allowed: [acmeRules], answers: new Map() });
    });
});

describe("session answers", () => {
    const answers = new Map<string, SessionAnswer>([
        [declineKeyOf(resize), "declined"],
        [declineKeyOf(palette), "leftForView"],
    ]);

    it("asks no notice again about content declined or left to the view", () => {
        expect(notAskedAgain(answers)).toEqual(
            new Set([declineKeyOf(resize), declineKeyOf(palette)]),
        );
    });

    it("tells the gate only of declined content", () => {
        expect(declinedKeys(answers)).toEqual(new Set([declineKeyOf(resize)]));
    });

    it.each<{ case: string; id: string; leftForView: boolean }>([
        { case: "an id whose content was left to the view", id: palette.id, leftForView: true },
        { case: "an id whose content was declined", id: resize.id, leftForView: false },
        { case: "an id nobody answered for", id: acmeRules.id, leftForView: false },
        {
            case: "an id that only starts like one left",
            id: `${palette.id}-evil`,
            leftForView: false,
        },
        { case: "an id that only ends like one left", id: `x${palette.id}`, leftForView: false },
    ])("tells $case apart without its content: $leftForView", ({ id, leftForView }) => {
        expect(isLeftForView(id, answers)).toBe(leftForView);
    });

    it.each([
        { case: "an id with a # in it", id: "/work/rules#2", leftForView: true },
        { case: "an id another one extends past a #", id: "/work/rules", leftForView: false },
    ])("tells $case apart: $leftForView", ({ id, leftForView }) => {
        const leftWithHash = new Map<string, SessionAnswer>([
            [
                declineKeyOf({ id: "/work/rules#2", name: "rules", contentHash: "r2" }),
                "leftForView",
            ],
        ]);

        expect(isLeftForView(id, leftWithHash)).toBe(leftForView);
    });

    it("names each answer a session can hold", () => {
        expectTypeOf<SessionAnswer>().toEqualTypeOf<(typeof SESSION_ANSWERS)[number]>();
        expect(SESSION_ANSWERS).toEqual(["declined", "leftForView"]);
    });
});

describe("pendingApprovalDescription", () => {
    it.each([
        {
            state: "new" as const,
            folders: ["/repo"],
            description: "new · .camunda/plugins/resize-tasks",
        },
        {
            state: "changed" as const,
            folders: ["/repo"],
            description: "changed since you allowed it · .camunda/plugins/resize-tasks",
        },
        {
            state: "new" as const,
            folders: ["/elsewhere"],
            description: "new · /repo/.camunda/plugins/resize-tasks",
        },
    ])("names a $state artifact and its folder for $folders", ({ state, folders, description }) => {
        expect(pendingApprovalDescription({ artifact: resize, state }, folders)).toBe(description);
    });
});

describe("code states", () => {
    it.each(CODE_STATES)("names the %s state", (state) => {
        expect(CODE_STATE_TEXT[state]).toMatch(/^[a-z]+( [a-z]+)*$/);
    });

    it("tells every state apart by its text", () => {
        expect(new Set(Object.values(CODE_STATE_TEXT)).size).toBe(CODE_STATES.length);
    });

    it("spells the approval states as code states", () => {
        expectTypeOf<ApprovalState>().toExtend<CodeState>();
        expectTypeOf<ApprovalState>().toEqualTypeOf<"approved" | "new" | "changed">();
    });
});

describe("process restarts", () => {
    it.each(PROCESS_RESTARTS)("names how to %s", (restart) => {
        expect(PROCESS_RESTART_TEXT[restart]).toMatch(/^[a-z]+ the \w+$/);
    });
});

describe("needsContentHash", () => {
    it.each<{ case: string; approvals: CodeApproval[]; declined: string[]; needed: boolean }>([
        { case: "no row and no decline", approvals: [], declined: [], needed: false },
        {
            case: "a row of the id",
            approvals: [{ pluginId: resize.id, contentHash: "old" }],
            declined: [],
            needed: true,
        },
        {
            case: "a decline of any content of the id",
            approvals: [],
            declined: [declineKeyOf({ ...resize, contentHash: "old" })],
            needed: true,
        },
        {
            case: "a row of this kind at another place, which may hold its content",
            approvals: [other],
            declined: [],
            needed: true,
        },
        {
            case: "only declines whose id starts or ends like this one",
            approvals: [],
            declined: [`${resize.id}-evil#aaa`, `x${resize.id}#aaa`],
            needed: false,
        },
        {
            case: "only a decline of an id that extends this one past a #",
            approvals: [],
            declined: [`${resize.id}#2#aaa`],
            needed: false,
        },
        {
            case: "only a key without a content hash",
            approvals: [],
            declined: [`${resize.id}x`],
            needed: false,
        },
    ])("is $needed with $case", ({ approvals, declined, needed }) => {
        expect(needsContentHash(resize.id, approvals, new Set(declined))).toBe(needed);
    });
});

describe("isApprovedState", () => {
    it.each(CODE_STATES.map((state) => ({ state, approved: state === "approved" })))(
        "is $approved for $state",
        ({ state, approved }) => {
            expect(isApprovedState(state)).toBe(approved);
        },
    );
});

describe("presenceIdOf", () => {
    it.each<CodePresence>([
        { kind: "found", artifact: resize },
        { kind: "unhashed", id: resize.id },
        { kind: "unreadable", id: resize.id, reason: "no manifest" },
        { kind: "gone", id: resize.id },
    ])("names the place of code read as $kind", (presence) => {
        expect(presenceIdOf(presence)).toBe(resize.id);
    });
});

describe("codeStateOf", () => {
    const found: CodePresence = { kind: "found", artifact: resize };
    const sameRow = { pluginId: resize.id, contentHash: "aaa" };
    const otherRow = { pluginId: resize.id, contentHash: "old" };
    const declinedNow = declineKeyOf(resize);
    const state = (code: CodeState): CodeStateReading => ({ kind: "state", state: code });

    it.each<{
        case: string;
        presence: CodePresence;
        approvals: CodeApproval[];
        declined?: string[];
        reading: CodeStateReading;
    }>([
        {
            case: "a folder gone with a row",
            presence: { kind: "gone", id: resize.id },
            approvals: [sameRow],
            reading: state("gone"),
        },
        {
            case: "a folder gone without a row",
            presence: { kind: "gone", id: resize.id },
            approvals: [],
            reading: state("gone"),
        },
        {
            case: "content its row holds",
            presence: found,
            approvals: [sameRow],
            reading: state("approved"),
        },
        {
            case: "content its row holds, declined earlier",
            presence: found,
            approvals: [sameRow],
            declined: [declinedNow],
            reading: state("approved"),
        },
        {
            case: "content without a row, declined",
            presence: found,
            approvals: [],
            declined: [declinedNow],
            reading: state("declined"),
        },
        {
            case: "content another row holds, declined",
            presence: found,
            approvals: [otherRow],
            declined: [declinedNow],
            reading: state("declined"),
        },
        { case: "content without a row", presence: found, approvals: [], reading: state("new") },
        {
            case: "content without a row, older content declined",
            presence: found,
            approvals: [],
            declined: [declineKeyOf({ ...resize, contentHash: "old" })],
            reading: state("new"),
        },
        {
            case: "content another row holds",
            presence: found,
            approvals: [otherRow],
            reading: state("changed"),
        },
        {
            case: "content allowed in another folder, declined here",
            presence: found,
            approvals: [{ pluginId: "/elsewhere/resize-tasks", contentHash: "aaa" }],
            declined: [declinedNow],
            reading: state("approved"),
        },
        {
            case: "unhashed content without any row or a decline",
            presence: { kind: "unhashed", id: resize.id },
            approvals: [],
            reading: state("new"),
        },
        {
            case: "unhashed content with only another place's row, which may hold its content",
            presence: { kind: "unhashed", id: resize.id },
            approvals: [other],
            reading: { kind: "hashNeeded" },
        },
        {
            case: "unhashed content with a row",
            presence: { kind: "unhashed", id: resize.id },
            approvals: [otherRow],
            reading: { kind: "hashNeeded" },
        },
        {
            case: "unhashed content with a decline",
            presence: { kind: "unhashed", id: resize.id },
            approvals: [],
            declined: [declineKeyOf({ ...resize, contentHash: "old" })],
            reading: { kind: "hashNeeded" },
        },
        {
            case: "unreadable content with a row among others",
            presence: { kind: "unreadable", id: resize.id, reason: "manifest missing" },
            approvals: [other, sameRow],
            reading: state("changed"),
        },
        {
            case: "unreadable content without a row",
            presence: { kind: "unreadable", id: resize.id, reason: "manifest missing" },
            approvals: [other],
            reading: state("new"),
        },
        {
            case: "unreadable content with no row here but this id's content elsewhere",
            presence: { kind: "unreadable", id: resize.id, reason: "manifest missing" },
            approvals: [{ pluginId: "/elsewhere/resize-tasks", contentHash: "aaa" }],
            reading: state("new"),
        },
    ])("reads $case", ({ presence, approvals, declined = [], reading }) => {
        expect(codeStateOf(presence, approvals, new Set(declined))).toEqual(reading);
    });

    it("reads found content as foundCodeState does", () => {
        const approvals = [otherRow];
        const declined = new Set([declinedNow]);

        expect(codeStateOf(found, approvals, declined)).toEqual(
            state(foundCodeState(resize, approvals, declined)),
        );
    });
});

describe("reviewedAllowDecision", () => {
    it.each<{ case: string; current: CodePresence; decision: ReviewedAllow }>([
        {
            case: "allows the reviewed content when it is still there",
            current: { kind: "found", artifact: { ...resize, name: "Renamed" } },
            decision: { kind: "allow", change: allowing([resize]) },
        },
        {
            case: "refuses content that changed since the review",
            current: { kind: "found", artifact: { ...resize, contentHash: "new" } },
            decision: { kind: "refused", reason: "changedSinceReview" },
        },
        {
            case: "refuses content found at another place",
            current: { kind: "found", artifact: { ...resize, id: palette.id } },
            decision: { kind: "refused", reason: "changedSinceReview" },
        },
        {
            case: "refuses content it cannot compare",
            current: { kind: "unhashed", id: resize.id },
            decision: { kind: "refused", reason: "changedSinceReview" },
        },
        {
            case: "refuses a folder that is gone",
            current: { kind: "gone", id: resize.id },
            decision: { kind: "refused", reason: "gone" },
        },
        {
            case: "refuses content it cannot read",
            current: { kind: "unreadable", id: resize.id, reason: "manifest missing" },
            decision: { kind: "refused", reason: "unreadable" },
        },
    ])("$case", ({ current, decision }) => {
        expect(reviewedAllowDecision(resize, current)).toEqual(decision);
    });
});
