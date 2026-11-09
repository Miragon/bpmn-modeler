import { describe, expect, it } from "vitest";

import { allowing, ReviewedAllow } from "../../kernel/domain/codeApproval";
import { ShownCode } from "./codeAddOnCatalog";
import {
    allowResultOf,
    allowTargetOf,
    inspectResultOf,
    pruneResultOf,
    revokeResultOf,
    shownTargetOf,
} from "./codeAddOnRequests";
import { ShownRevisions } from "./shownRevisions";

const RESIZE = "/work/.camunda/plugins/resize";
const ACME = "/work/node_modules/bpmnlint-plugin-acme";
const content = { id: RESIZE, name: "Resize", contentHash: "h1" };
const plugin: ShownCode = {
    kind: "plugin",
    id: RESIZE,
    name: "Resize",
    content,
    actions: ["allow"],
    allowedFollowUp: "Open editors reload with it.",
    revokedFollowUp: "Open editors reload without it.",
    leftForViewByRevoke: [],
};
const approvedPlugin: ShownCode = { ...plugin, actions: ["revoke"] };
const unhashed: ShownCode = {
    kind: "rulePackage",
    id: ACME,
    name: "bpmnlint-plugin-acme",
    actions: ["inspect"],
    allowedFollowUp: "Open editors lint again with it.",
    revokedFollowUp: "Code it already ran stays loaded until you reload the window.",
    leftForViewByRevoke: [],
};
const rulePackage: ShownCode = {
    ...unhashed,
    content: { id: ACME, name: "bpmnlint-plugin-acme", contentHash: "r1" },
    actions: ["allow"],
};

const revisions = ShownRevisions.empty()
    .recorded(1, new Map([[`plugin:${RESIZE}`, plugin]]))
    .recorded(2, new Map([[`rulePackage:${ACME}`, unhashed]]))
    .recorded(3, new Map([[`plugin:${RESIZE}`, approvedPlugin]]));

const NOT_OFFERED = {
    kind: "refused",
    reason: "notOffered",
    message: "The list offers no such action for this add-on now. Check it again.",
};

describe("allowTargetOf", () => {
    it("allows the content the named revision showed, though a later one shows other content", () => {
        expect(allowTargetOf(revisions, 1, `plugin:${RESIZE}`)).toEqual({
            kind: "reviewed",
            code: plugin,
            content,
        });
    });

    it.each([
        {
            case: "a revision it does not keep",
            revision: 9,
            addOnId: `plugin:${RESIZE}`,
            reason: "staleView",
            message: "The list changed since you looked at it. Check it again, then allow.",
        },
        {
            case: "an add-on that revision did not show",
            revision: 2,
            addOnId: `plugin:${RESIZE}`,
            reason: "unknownAddOn",
            message: "This add-on is no longer listed.",
        },
        {
            case: "an add-on shown without its content",
            revision: 2,
            addOnId: `rulePackage:${ACME}`,
            reason: NOT_OFFERED.reason,
            message: NOT_OFFERED.message,
        },
        {
            case: "an add-on that revision offered no allow for, its content shown",
            revision: 3,
            addOnId: `plugin:${RESIZE}`,
            reason: NOT_OFFERED.reason,
            message: NOT_OFFERED.message,
        },
        {
            case: "an allow offered for a row shown without content, as stale",
            revision: 4,
            addOnId: `rulePackage:${ACME}`,
            reason: "staleView",
            message: "The list changed since you looked at it. Check it again, then allow.",
        },
    ])("refuses $case", ({ revision, addOnId, reason, message }) => {
        const withContentless = revisions.recorded(
            4,
            new Map([[`rulePackage:${ACME}`, { ...unhashed, actions: ["allow"] }]]),
        );

        expect(allowTargetOf(withContentless, revision, addOnId)).toEqual({
            kind: "refused",
            result: { kind: "refused", reason, message },
        });
    });
});

describe("shownTargetOf", () => {
    const latest = ShownRevisions.empty().recorded(
        1,
        new Map([
            [`rulePackage:${ACME}`, unhashed],
            [`plugin:${RESIZE}`, approvedPlugin],
        ]),
    );

    it.each([
        { kind: "inspect" as const, addOnId: `rulePackage:${ACME}`, code: unhashed },
        { kind: "revoke" as const, addOnId: `plugin:${RESIZE}`, code: approvedPlugin },
    ])("finds an add-on the latest revision offered $kind for", ({ kind, addOnId, code }) => {
        expect(shownTargetOf(latest, addOnId, kind)).toEqual({ kind: "shown", code });
    });

    it.each([
        { kind: "revoke" as const, addOnId: `rulePackage:${ACME}` },
        { kind: "inspect" as const, addOnId: `plugin:${RESIZE}` },
    ])(
        "refuses $kind on an add-on the latest revision offered no $kind for",
        ({ kind, addOnId }) => {
            expect(shownTargetOf(latest, addOnId, kind)).toEqual({
                kind: "refused",
                result: NOT_OFFERED,
            });
        },
    );

    it("refuses an add-on the latest revision no longer shows", () => {
        expect(shownTargetOf(revisions, `rulePackage:${ACME}`, "inspect")).toEqual({
            kind: "refused",
            result: {
                kind: "refused",
                reason: "unknownAddOn",
                message: "This add-on is no longer listed.",
            },
        });
    });
});

describe("allowResultOf", () => {
    it.each<{ case: string; code: ShownCode; decision: ReviewedAllow; result: unknown }>([
        {
            case: "an allowed plugin",
            code: plugin,
            decision: { kind: "allow", change: allowing([content]) },
            result: { kind: "done", message: "Allowed Resize. Open editors reload with it." },
        },
        {
            case: "an allowed rule package",
            code: rulePackage,
            decision: { kind: "allow", change: allowing([content]) },
            result: {
                kind: "done",
                message: "Allowed bpmnlint-plugin-acme. Open editors lint again with it.",
            },
        },
        {
            case: "content changed since the review",
            code: plugin,
            decision: { kind: "refused", reason: "changedSinceReview" },
            result: {
                kind: "refused",
                reason: "changedSinceReview",
                message: "Resize changed after you reviewed it. Review it again, then allow.",
            },
        },
        {
            case: "content gone",
            code: plugin,
            decision: { kind: "refused", reason: "gone" },
            result: { kind: "refused", reason: "gone", message: "Resize is gone." },
        },
        {
            case: "content no longer readable",
            code: plugin,
            decision: { kind: "refused", reason: "unreadable" },
            result: {
                kind: "refused",
                reason: "unreadable",
                message: "Resize can no longer be read.",
            },
        },
    ])("reports $case", ({ code, decision, result }) => {
        expect(allowResultOf(code, decision)).toEqual(result);
    });
});

describe("revokeResultOf", () => {
    it.each([
        { code: plugin, message: "Revoked Resize. Open editors reload without it." },
        {
            code: rulePackage,
            message:
                "Revoked bpmnlint-plugin-acme. Code it already ran stays loaded until you reload the window.",
        },
    ])("says what its owner says follows the revoke: $message", ({ code, message }) => {
        expect(revokeResultOf(code)).toEqual({ kind: "done", message });
    });
});

describe("inspectResultOf", () => {
    it("asks the user to review what was read before allowing it", () => {
        expect(inspectResultOf(unhashed)).toEqual({
            kind: "done",
            message: "Read bpmnlint-plugin-acme. Review what it covers, then allow this content.",
        });
    });
});

describe("pruneResultOf", () => {
    it.each([
        { removed: 0, message: "No unused plugin copies to remove." },
        { removed: 1, message: "Removed 1 unused plugin copy." },
        { removed: 3, message: "Removed 3 unused plugin copies." },
    ])("reports $removed removed", ({ removed, message }) => {
        expect(pruneResultOf(removed)).toEqual({ kind: "done", message });
    });
});
