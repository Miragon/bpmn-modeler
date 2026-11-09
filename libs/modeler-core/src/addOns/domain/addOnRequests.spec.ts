import { describe, expect, expectTypeOf, it } from "vitest";

import { allowing, ReviewedAllow } from "../../kernel/domain/codeApproval";
import { ShownCode } from "./addOnCatalog";
import { ShownSource, ShownTemplate } from "./templateAddOnViews";
import { type AddOnActionKind, type CatalogActionKind, type SourceActionKind } from "./addOnIds";
import {
    type AddOnRequest,
    allowResultOf,
    allowTargetOf,
    catalogActionRefusalOf,
    inspectResultOf,
    marketplaceRemovalTargetOf,
    REPORTED_BY_FLOW,
    pruneResultOf,
    revokeResultOf,
    shownTargetOf,
    sourceSwitchTargetOf,
    TEMPLATE_SWITCH_FAILED,
    templateSwitchTargetOf,
} from "./addOnRequests";
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

describe("AddOnRequest", () => {
    it("asks for every action a row or the catalog offers, and for a refresh", () => {
        expectTypeOf<Exclude<AddOnRequest["kind"], "refresh">>().toEqualTypeOf<
            AddOnActionKind | SourceActionKind | CatalogActionKind
        >();
    });
});

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

const UNKNOWN_SOURCE = {
    kind: "refused",
    reason: "unknownSource",
    message: "This source is no longer listed.",
};
const SOURCE_NOT_OFFERED = {
    kind: "refused",
    reason: "notOffered",
    message: "The list offers no such action for this source now. Check it again.",
};
const ACME_SOURCE = {
    key: "marketplace:github:github.com/acme/shared",
    scope: "allProjects",
} as const;
const SHOP_SOURCE = { key: "configFolder:work/.camunda", scope: "project" } as const;
const shared: ShownSource = {
    kind: "marketplace",
    label: "acme/shared",
    entry: "https://github.com/acme/shared",
    templateSource: ACME_SOURCE,
    actions: ["removeMarketplace", "disableTemplates"],
};
const shop: ShownSource = {
    kind: "configFolder",
    label: ".camunda",
    templateSource: SHOP_SOURCE,
    actions: ["enableTemplates"],
};
const sources = new Map<string, ShownSource>([
    ["marketplace:acme-shared", shared],
    ["marketplace:none", { kind: "marketplace", label: "none", entry: "/work/none", actions: [] }],
    ["config:/work/.camunda", shop],
]);

describe("marketplaceRemovalTargetOf", () => {
    it("removes the entry the latest build showed for the source", () => {
        expect(marketplaceRemovalTargetOf(sources, "marketplace:acme-shared")).toEqual({
            kind: "shown",
            entry: "https://github.com/acme/shared",
        });
    });

    it.each([
        {
            case: "a source the latest build no longer shows",
            sourceId: "marketplace:gone",
            result: UNKNOWN_SOURCE,
        },
        {
            case: "a source that offers no removal",
            sourceId: "marketplace:none",
            result: SOURCE_NOT_OFFERED,
        },
        { case: "a config folder", sourceId: "config:/work/.camunda", result: SOURCE_NOT_OFFERED },
    ])("refuses $case", ({ sourceId, result }) => {
        expect(marketplaceRemovalTargetOf(sources, sourceId)).toEqual({ kind: "refused", result });
    });

    it("refuses a removal of a source that is no marketplace, whatever it offers", () => {
        const odd = new Map<string, ShownSource>([
            ["config:/work/.camunda", { ...shop, actions: ["removeMarketplace"] }],
        ]);

        expect(marketplaceRemovalTargetOf(odd, "config:/work/.camunda")).toEqual({
            kind: "refused",
            result: SOURCE_NOT_OFFERED,
        });
    });
});

describe("sourceSwitchTargetOf", () => {
    it.each([
        {
            case: "disables a marketplace's templates where its switches live",
            sourceId: "marketplace:acme-shared",
            action: "disableTemplates" as const,
            change: { scope: "allProjects", disable: [{ source: ACME_SOURCE.key }], enable: [] },
            message:
                "Disabled the templates of acme/shared. New elements no longer offer them; elements that use them keep them.",
        },
        {
            case: "enables a config folder's templates",
            sourceId: "config:/work/.camunda",
            action: "enableTemplates" as const,
            change: { scope: "project", disable: [], enable: [{ source: SHOP_SOURCE.key }] },
            message: "Enabled the templates of .camunda.",
        },
    ])("$case", ({ sourceId, action, change, message }) => {
        expect(sourceSwitchTargetOf(sources, sourceId, action)).toEqual({
            kind: "switch",
            change,
            result: { kind: "done", message },
        });
    });

    it.each([
        {
            case: "a source the latest build no longer shows",
            sourceId: "config:/gone/.camunda",
            action: "disableTemplates" as const,
            result: UNKNOWN_SOURCE,
        },
        {
            case: "a switch the source does not offer now",
            sourceId: "config:/work/.camunda",
            action: "disableTemplates" as const,
            result: SOURCE_NOT_OFFERED,
        },
        {
            case: "a source with no switches",
            sourceId: "marketplace:none",
            action: "enableTemplates" as const,
            result: SOURCE_NOT_OFFERED,
        },
    ])("refuses $case", ({ sourceId, action, result }) => {
        expect(sourceSwitchTargetOf(sources, sourceId, action)).toEqual({
            kind: "refused",
            result,
        });
    });

    it("refuses a switch of a source that names no place for its switches, whatever it offers", () => {
        const odd = new Map<string, ShownSource>([
            [
                "marketplace:none",
                {
                    kind: "marketplace",
                    label: "none",
                    entry: "/work/none",
                    actions: ["enableTemplates"],
                },
            ],
        ]);

        expect(sourceSwitchTargetOf(odd, "marketplace:none", "enableTemplates")).toEqual({
            kind: "refused",
            result: SOURCE_NOT_OFFERED,
        });
    });
});

describe("templateSwitchTargetOf", () => {
    const mail: ShownTemplate = {
        name: "Send Mail",
        switch: { source: SHOP_SOURCE.key, templateId: "mail" },
        scope: "project",
        actions: ["disable"],
    };
    const rest: ShownTemplate = {
        name: "REST",
        switch: { source: ACME_SOURCE.key, templateId: "rest" },
        scope: "allProjects",
        actions: ["enable"],
    };
    const templates = new Map([
        ["template:mail", mail],
        ["template:rest", rest],
    ]);

    it.each([
        {
            case: "disables a template in its source's scope",
            addOnId: "template:mail",
            action: "disable" as const,
            change: { scope: "project", disable: [mail.switch], enable: [] },
            message:
                "Disabled Send Mail. New elements no longer offer it; elements that use it keep it.",
        },
        {
            case: "enables a template in its source's scope",
            addOnId: "template:rest",
            action: "enable" as const,
            change: { scope: "allProjects", disable: [], enable: [rest.switch] },
            message: "Enabled REST.",
        },
    ])("$case", ({ addOnId, action, change, message }) => {
        expect(templateSwitchTargetOf(templates, addOnId, action)).toEqual({
            kind: "switch",
            change,
            result: { kind: "done", message },
        });
    });

    it.each([
        {
            case: "a template the latest build no longer shows",
            addOnId: "template:gone",
            action: "disable" as const,
            result: {
                kind: "refused",
                reason: "unknownAddOn",
                message: "This add-on is no longer listed.",
            },
        },
        {
            case: "a switch the template does not offer now",
            addOnId: "template:mail",
            action: "enable" as const,
            result: NOT_OFFERED,
        },
    ])("refuses $case", ({ addOnId, action, result }) => {
        expect(templateSwitchTargetOf(templates, addOnId, action)).toEqual({
            kind: "refused",
            result,
        });
    });

    it("says a switch could not be saved and leaves why to the log", () => {
        expect(TEMPLATE_SWITCH_FAILED).toEqual({
            kind: "failed",
            message: "Could not save this choice. The log says why.",
        });
    });
});

describe("catalogActionRefusalOf", () => {
    it("refuses nothing the latest build offered", () => {
        expect(
            catalogActionRefusalOf(["addMarketplace", "pruneCache"], "addMarketplace"),
        ).toBeUndefined();
    });

    it("refuses what it did not offer", () => {
        expect(catalogActionRefusalOf(["pruneCache"], "updateMarketplaces")).toEqual({
            kind: "refused",
            reason: "notOffered",
            message: "The list offers no such action now. Check it again.",
        });
    });

    it("leaves the result of a marketplace flow to the flow", () => {
        expect(REPORTED_BY_FLOW).toEqual({ kind: "reportedByFlow" });
    });
});
