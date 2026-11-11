import { describe, expect, it } from "vitest";

import { Allowance, allowanceOf, allowingAllowances } from "../../kernel/domain/allowance";
import { ListedPresence } from "../../kernel/domain/listedCode";
import { ShownCode } from "./codeAddOnCatalog";
import {
    AllowDecision,
    allowDecisionOf,
    allowResultOf,
    allowTargetOf,
    pruneResultOf,
    revokeResultOf,
    shownTargetOf,
} from "./codeAddOnRequests";
import { ShownRevisions } from "./shownRevisions";

const RESIZE = "/work/.camunda/plugins/resize";
const ACME = "/work/node_modules/bpmnlint-plugin-acme";
const IN_REPOSITORY = allowanceOf(
    "plugin",
    RESIZE,
    { kind: "repository", commonDir: "/work/.git", worktreeRoot: "/work" },
    "",
);
const IN_FOLDER = allowanceOf("plugin", RESIZE, { kind: "noRepository" }, "");
const plugin: ShownCode = {
    kind: "plugin",
    id: RESIZE,
    name: "Resize",
    allowance: IN_FOLDER,
    actions: ["allow"],
    allowedFollowUp: "Open editors reload with it.",
    revokedFollowUp: "Open editors reload without it.",
};
const allowedPlugin: ShownCode = { ...plugin, actions: ["revoke"] };
const rulePackage: ShownCode = {
    kind: "rulePackage",
    id: ACME,
    name: "bpmnlint-plugin-acme@1.0.0",
    allowance: allowanceOf("rulePackage", ACME, { kind: "noRepository" }, ""),
    actions: ["allow"],
    allowedFollowUp: "Open editors lint again with it.",
    revokedFollowUp: "Code it already ran stays loaded until you reload the window.",
};

const revisions = ShownRevisions.empty()
    .recorded(1, new Map([[`plugin:${RESIZE}`, plugin]]))
    .recorded(2, new Map([[`rulePackage:${ACME}`, rulePackage]]))
    .recorded(3, new Map([[`plugin:${RESIZE}`, allowedPlugin]]));

const NOT_OFFERED = {
    kind: "refused",
    reason: "notOffered",
    message: "The list offers no such action for this add-on now. Check it again.",
};
const STALE_VIEW = {
    kind: "refused",
    reason: "staleView",
    message: "The list changed since you looked at it. Check it again, then allow.",
};

describe("allowTargetOf", () => {
    it("allows what the named revision showed, though a later one offers no allow", () => {
        expect(allowTargetOf(revisions, 1, `plugin:${RESIZE}`)).toEqual({
            kind: "shown",
            code: plugin,
        });
    });

    it.each([
        {
            case: "a revision it does not keep",
            revision: 9,
            addOnId: `plugin:${RESIZE}`,
            result: STALE_VIEW,
        },
        {
            case: "an add-on that revision did not show",
            revision: 2,
            addOnId: `plugin:${RESIZE}`,
            result: {
                kind: "refused",
                reason: "unknownAddOn",
                message: "This add-on is no longer listed.",
            },
        },
        {
            case: "an add-on that revision offered no allow for",
            revision: 3,
            addOnId: `plugin:${RESIZE}`,
            result: NOT_OFFERED,
        },
    ])("refuses $case", ({ revision, addOnId, result }) => {
        expect(allowTargetOf(revisions, revision, addOnId)).toEqual({ kind: "refused", result });
    });
});

describe("shownTargetOf", () => {
    const latest = ShownRevisions.empty().recorded(
        1,
        new Map([
            [`rulePackage:${ACME}`, rulePackage],
            [`plugin:${RESIZE}`, allowedPlugin],
        ]),
    );

    it("finds an add-on the latest revision offered revoke for", () => {
        expect(shownTargetOf(latest, `plugin:${RESIZE}`, "revoke")).toEqual({
            kind: "shown",
            code: allowedPlugin,
        });
    });

    it("refuses revoke on an add-on the latest revision offered no revoke for", () => {
        expect(shownTargetOf(latest, `rulePackage:${ACME}`, "revoke")).toEqual({
            kind: "refused",
            result: NOT_OFFERED,
        });
    });

    it("refuses an add-on the latest revision no longer shows", () => {
        expect(shownTargetOf(revisions, `rulePackage:${ACME}`, "revoke")).toEqual({
            kind: "refused",
            result: {
                kind: "refused",
                reason: "unknownAddOn",
                message: "This add-on is no longer listed.",
            },
        });
    });
});

describe("allowDecisionOf", () => {
    const foundWith = (allowance: Allowance): ListedPresence => ({
        kind: "found",
        name: "Resize",
        artifact: { id: RESIZE, name: "Resize", allowance },
    });

    it.each<{ case: string; current: ListedPresence; decision: AllowDecision }>([
        {
            case: "allows the shown allowance while the place still resolves to it",
            current: foundWith(IN_FOLDER),
            decision: {
                kind: "allow",
                change: allowingAllowances([{ id: RESIZE, allowance: IN_FOLDER }]),
            },
        },
        {
            case: "refuses as stale once the place resolves to another allowance",
            current: foundWith(IN_REPOSITORY),
            decision: { kind: "refused", reason: "staleView" },
        },
        {
            case: "refuses a gone place",
            current: { kind: "gone", id: RESIZE, name: "resize" },
            decision: { kind: "refused", reason: "gone" },
        },
        {
            case: "refuses a place it can no longer read",
            current: {
                kind: "unreadable",
                id: RESIZE,
                name: "resize",
                reason: "broken",
                allowance: IN_FOLDER,
            },
            decision: { kind: "refused", reason: "unreadable" },
        },
    ])("$case", ({ current, decision }) => {
        expect(allowDecisionOf(plugin, current)).toEqual(decision);
    });
});

describe("allowResultOf", () => {
    const allow: AllowDecision = {
        kind: "allow",
        change: allowingAllowances([{ id: RESIZE, allowance: IN_FOLDER }]),
    };

    it.each<{ case: string; code: ShownCode; decision: AllowDecision; result: unknown }>([
        {
            case: "a plugin allowed in its folder",
            code: plugin,
            decision: allow,
            result: { kind: "done", message: "Allowed Resize. Open editors reload with it." },
        },
        {
            case: "a plugin allowed in its repository",
            code: { ...plugin, allowance: IN_REPOSITORY },
            decision: allow,
            result: {
                kind: "done",
                message:
                    "Allowed Resize in every worktree of its repository. Open editors reload with it.",
            },
        },
        {
            case: "an allowed rule package",
            code: rulePackage,
            decision: allow,
            result: {
                kind: "done",
                message: "Allowed bpmnlint-plugin-acme@1.0.0. Open editors lint again with it.",
            },
        },
        {
            case: "a gone add-on",
            code: plugin,
            decision: { kind: "refused", reason: "gone" },
            result: { kind: "refused", reason: "gone", message: "Resize is gone." },
        },
        {
            case: "an add-on no longer readable",
            code: plugin,
            decision: { kind: "refused", reason: "unreadable" },
            result: {
                kind: "refused",
                reason: "unreadable",
                message: "Resize can no longer be read.",
            },
        },
        {
            case: "a place that resolves to another allowance now",
            code: plugin,
            decision: { kind: "refused", reason: "staleView" },
            result: STALE_VIEW,
        },
    ])("reports $case", ({ code, decision, result }) => {
        expect(allowResultOf(code, decision)).toEqual(result);
    });
});

describe("revokeResultOf", () => {
    it.each([
        { code: allowedPlugin, message: "Revoked Resize. Open editors reload without it." },
        {
            code: { ...allowedPlugin, allowance: IN_REPOSITORY },
            message:
                "Revoked Resize in every worktree of its repository. Open editors reload without it.",
        },
        {
            code: rulePackage,
            message:
                "Revoked bpmnlint-plugin-acme@1.0.0. Code it already ran stays loaded until you reload the window.",
        },
    ])("says where and what its owner says follows the revoke: $message", ({ code, message }) => {
        expect(revokeResultOf(code)).toEqual({ kind: "done", message });
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
