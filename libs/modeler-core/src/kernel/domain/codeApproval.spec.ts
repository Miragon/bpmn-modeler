import { describe, expect, it } from "vitest";

import {
    type ApprovableArtifact,
    type ApprovalState,
    approvalOutcome,
    approvalsAllowing,
    approvalsRevoking,
    approvalStateOf,
    approvedArtifacts,
    type CodeApprovalOutcome,
    declineKeyOf,
    type PendingCodeApproval,
    pendingApprovals,
    type PluginApproval,
} from "./codeApproval";

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

const other: PluginApproval = { pluginId: "/other", contentHash: "ccc" };

describe("approvalStateOf", () => {
    it.each<{
        case: string;
        artifact: ApprovableArtifact;
        approvals: PluginApproval[];
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
    it.each<{ case: string; approvals: PluginApproval[]; approved: ApprovableArtifact[] }>([
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
            case: "keeps none for an approval of the same content in another folder",
            approvals: [{ pluginId: "/elsewhere/resize-tasks", contentHash: "aaa" }],
            approved: [],
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

describe("approvalsAllowing", () => {
    it.each<{
        case: string;
        approvals: PluginApproval[];
        allowed: ApprovableArtifact[];
        result: PluginApproval[];
    }>([
        {
            case: "replaces the approval of a changed artifact and keeps the others",
            approvals: [{ pluginId: resize.id, contentHash: "old" }, other],
            allowed: [resize],
            result: [other, { pluginId: resize.id, contentHash: "aaa" }],
        },
        {
            case: "adds an approval for a new artifact",
            approvals: [other],
            allowed: [palette],
            result: [other, { pluginId: palette.id, contentHash: "bbb" }],
        },
        {
            case: "adds an approval for each artifact allowed",
            approvals: [],
            allowed: [resize, palette],
            result: [
                { pluginId: resize.id, contentHash: "aaa" },
                { pluginId: palette.id, contentHash: "bbb" },
            ],
        },
        {
            case: "keeps every approval when nothing is allowed",
            approvals: [{ pluginId: resize.id, contentHash: "old" }, other],
            allowed: [],
            result: [{ pluginId: resize.id, contentHash: "old" }, other],
        },
        {
            case: "adds a rule package to the webview plugins' rows and stores no field of its own",
            approvals: [{ pluginId: resize.id, contentHash: "aaa" }],
            allowed: [acmeRules],
            result: [
                { pluginId: resize.id, contentHash: "aaa" },
                { pluginId: acmeRules.id, contentHash: "bpmnlint-closure-v1:ddd" },
            ],
        },
    ])("$case", ({ approvals, allowed, result }) => {
        expect(approvalsAllowing(approvals, allowed)).toEqual(result);
    });
});

describe("approvalsRevoking", () => {
    const resizeRow: PluginApproval = { pluginId: resize.id, contentHash: "aaa" };
    const acmeRow: PluginApproval = {
        pluginId: acmeRules.id,
        contentHash: "bpmnlint-closure-v1:ddd",
    };

    it.each<{
        case: string;
        approvals: PluginApproval[];
        revokedIds: string[];
        result: PluginApproval[];
    }>([
        {
            case: "removes the approval of a revoked artifact and keeps the others in order",
            approvals: [resizeRow, acmeRow, other],
            revokedIds: [acmeRules.id],
            result: [resizeRow, other],
        },
        {
            case: "removes an approval whatever content it was given for",
            approvals: [{ pluginId: resize.id, contentHash: "old" }, other],
            revokedIds: [resize.id],
            result: [other],
        },
        {
            case: "removes the approval of each revoked artifact",
            approvals: [resizeRow, acmeRow, other],
            revokedIds: [resize.id, acmeRules.id],
            result: [other],
        },
        {
            case: "keeps every approval for an id nobody approved",
            approvals: [resizeRow, other],
            revokedIds: ["/elsewhere/resize-tasks"],
            result: [resizeRow, other],
        },
        {
            case: "keeps every approval when nothing is revoked",
            approvals: [resizeRow, other],
            revokedIds: [],
            result: [resizeRow, other],
        },
    ])("$case", ({ approvals, revokedIds, result }) => {
        expect(approvalsRevoking(approvals, revokedIds)).toEqual(result);
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
        approvals: PluginApproval[];
        declined: string[];
        pending: PendingCodeApproval<ApprovableArtifact>[];
    }>([
        {
            case: "asks about every artifact nobody allowed",
            approvals: [],
            declined: [],
            pending: [
                { plugin: resize, state: "new" },
                { plugin: palette, state: "new" },
            ],
        },
        {
            case: "skips an artifact whose current content is allowed",
            approvals: [{ pluginId: resize.id, contentHash: "aaa" }],
            declined: [],
            pending: [{ plugin: palette, state: "new" }],
        },
        {
            case: "asks about a changed artifact and skips one declined in this session",
            approvals: [{ pluginId: resize.id, contentHash: "old" }],
            declined: [declineKeyOf(palette)],
            pending: [{ plugin: resize, state: "changed" }],
        },
        {
            case: "asks again once a declined artifact changes",
            approvals: [],
            declined: [declineKeyOf({ ...palette, contentHash: "old" })],
            pending: [
                { plugin: resize, state: "new" },
                { plugin: palette, state: "new" },
            ],
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

        expect(pending).toEqual([{ plugin: acmeRules, state: "changed" }]);
    });
});

describe("approvalOutcome", () => {
    const pending: PendingCodeApproval<ApprovableArtifact>[] = [
        { plugin: resize, state: "new" },
        { plugin: palette, state: "changed" },
    ];

    it.each<{
        case: string;
        checkedIds: string[];
        outcome: CodeApprovalOutcome<ApprovableArtifact>;
    }>([
        {
            case: "allows the checked artifacts and declines the rest for this session",
            checkedIds: [palette.id],
            outcome: { allowed: [palette], declineKeys: [declineKeyOf(resize)] },
        },
        {
            case: "allows every artifact when all are checked",
            checkedIds: [resize.id, palette.id],
            outcome: { allowed: [resize, palette], declineKeys: [] },
        },
        {
            case: "declines every artifact when the list is dismissed",
            checkedIds: [],
            outcome: { allowed: [], declineKeys: [declineKeyOf(resize), declineKeyOf(palette)] },
        },
        {
            case: "allows nothing for a checked id that was not asked about",
            checkedIds: ["/elsewhere/resize-tasks"],
            outcome: { allowed: [], declineKeys: [declineKeyOf(resize), declineKeyOf(palette)] },
        },
        {
            case: "allows only the asked-about artifacts among the checked ids",
            checkedIds: ["/elsewhere/resize-tasks", resize.id],
            outcome: { allowed: [resize], declineKeys: [declineKeyOf(palette)] },
        },
    ])("$case", ({ checkedIds, outcome }) => {
        expect(approvalOutcome(pending, checkedIds)).toEqual(outcome);
    });

    it("allows a checked rule package as it was asked about", () => {
        const outcome: CodeApprovalOutcome<RulePackage> = approvalOutcome(
            [{ plugin: acmeRules, state: "new" }],
            [acmeRules.id],
        );

        expect(outcome).toEqual({ allowed: [acmeRules], declineKeys: [] });
    });
});
