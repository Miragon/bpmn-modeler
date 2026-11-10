import { describe, expect, it } from "vitest";

import {
    marketplaceRemovalTargetOf,
    sourceSwitchTargetOf,
    TEMPLATE_SWITCH_FAILED,
    templateSwitchTargetOf,
} from "./templateAddOnRequests";
import { ShownSource, ShownTemplate } from "./templateAddOnViews";

const NOT_OFFERED = {
    kind: "refused",
    reason: "notOffered",
    message: "The list offers no such action for this add-on now. Check it again.",
};
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
