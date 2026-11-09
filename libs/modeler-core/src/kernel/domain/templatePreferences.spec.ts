import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { ProjectScope } from "./projectScopes";
import {
    configFolderTemplateSourceOf,
    isTemplateOffered,
    isTemplateSourceEnabled,
    NO_TEMPLATE_PREFERENCES,
    sourceSwitchOf,
    storedTemplatePreferencesOf,
    templatePreferenceChange,
    type TemplatePreferences,
    type TemplatePreferencesByScope,
    templatePreferencesAfter,
    templatePreferencesKey,
    type TemplateSourceRef,
    templateSourceScopeOf,
    type TemplateSwitch,
    templateSwitchOf,
} from "./templatePreferences";

type CaseSwitch = [source: string, templateId?: string];

interface ChangeCases {
    readonly merges: readonly {
        readonly name: string;
        readonly stored: readonly CaseSwitch[];
        readonly disable: readonly CaseSwitch[];
        readonly enable: readonly CaseSwitch[];
        readonly result: readonly CaseSwitch[];
    }[];
    readonly rejected: readonly {
        readonly name: string;
        readonly disable: readonly CaseSwitch[];
        readonly enable: readonly CaseSwitch[];
    }[];
}

const CHANGE_CASES = JSON.parse(
    readFileSync(resolve(__dirname, "templatePreferenceChange.cases.json"), "utf8"),
) as ChangeCases;

const switchesOf = (rows: readonly CaseSwitch[]): TemplateSwitch[] =>
    rows.map(([source, templateId]) =>
        templateId === undefined ? { source } : { source, templateId },
    );

const SHOP: TemplateSourceRef = { key: "configFolder:shop/.camunda", scope: "project" };
const ACME: TemplateSourceRef = {
    key: "marketplace:github:github.com/acme/templates",
    scope: "allProjects",
};

function preferences(
    project: readonly TemplateSwitch[],
    allProjects: readonly TemplateSwitch[] = [],
): TemplatePreferencesByScope {
    return { project: { disabled: project }, allProjects: { disabled: allProjects } };
}

describe("templatePreferenceChange", () => {
    it.each(CHANGE_CASES.rejected)("rejects $name", ({ disable, enable }) => {
        expect(() =>
            templatePreferenceChange("project", switchesOf(disable), switchesOf(enable)),
        ).toThrow("A template preference change names a switch twice");
    });

    it("keeps the scope and the switches it was given, in their order", () => {
        const disable = [{ source: SHOP.key, templateId: "sms" }, { source: ACME.key }];

        expect(templatePreferenceChange("allProjects", disable, [{ source: SHOP.key }])).toEqual({
            scope: "allProjects",
            disable,
            enable: [{ source: SHOP.key }],
        });
    });

    it("tells a source switch from a template switch of the same source", () => {
        expect(() =>
            templatePreferenceChange(
                "project",
                [{ source: SHOP.key }],
                [{ source: SHOP.key, templateId: "mail" }],
            ),
        ).not.toThrow();
    });

    it("stores no field a switch does not have", () => {
        const odd = { source: SHOP.key, templateId: undefined, label: "x" } as TemplateSwitch;

        expect(templatePreferenceChange("project", [odd], []).disable).toStrictEqual([
            { source: SHOP.key },
        ]);
    });
});

describe("templatePreferencesAfter", () => {
    it.each(CHANGE_CASES.merges)("$name", ({ stored, disable, enable, result }) => {
        expect(
            templatePreferencesAfter(
                { disabled: switchesOf(stored) },
                templatePreferenceChange("project", switchesOf(disable), switchesOf(enable)),
            ),
        ).toEqual({ disabled: switchesOf(result) });
    });

    it.each(CHANGE_CASES.rejected)(
        "rejects a change built by hand with $name",
        ({ disable, enable }) => {
            expect(() =>
                templatePreferencesAfter(
                    { disabled: [] },
                    { scope: "project", disable: switchesOf(disable), enable: switchesOf(enable) },
                ),
            ).toThrow("names a switch twice");
        },
    );
});

describe("templatePreferencesKey", () => {
    it.each<{ case: string; a: TemplateSwitch[]; b: TemplateSwitch[]; equal: boolean }>([
        {
            case: "the same switches in another order",
            a: [{ source: SHOP.key }, { source: ACME.key, templateId: "rest" }],
            b: [{ source: ACME.key, templateId: "rest" }, { source: SHOP.key }],
            equal: true,
        },
        {
            case: "a source switch and a template switch",
            a: [{ source: SHOP.key }],
            b: [{ source: SHOP.key, templateId: "" }],
            equal: false,
        },
        {
            case: "ids that only a naive join would mix up",
            a: [{ source: "a", templateId: "b,c" }],
            b: [{ source: "a,b", templateId: "c" }],
            equal: false,
        },
        { case: "no switches and one", a: [], b: [{ source: SHOP.key }], equal: false },
    ])("is equal: $equal for $case", ({ a, b, equal }) => {
        expect(
            templatePreferencesKey({ disabled: a }) === templatePreferencesKey({ disabled: b }),
        ).toBe(equal);
    });
});

describe("storedTemplatePreferencesOf", () => {
    it.each<{ case: string; raw: unknown; disabled: TemplateSwitch[] }>([
        { case: "nothing stored", raw: undefined, disabled: [] },
        { case: "not an object", raw: "configFolder:shop", disabled: [] },
        { case: "no list", raw: { disabled: "x" }, disabled: [] },
        {
            case: "well-formed switches",
            raw: { disabled: [{ source: SHOP.key }, { source: ACME.key, templateId: "rest" }] },
            disabled: [{ source: SHOP.key }, { source: ACME.key, templateId: "rest" }],
        },
        {
            case: "malformed switches among well-formed ones",
            raw: {
                disabled: [
                    null,
                    { templateId: "rest" },
                    { source: 4 },
                    { source: SHOP.key, templateId: 7 },
                    { source: SHOP.key, templateId: "mail", extra: true },
                ],
            },
            disabled: [{ source: SHOP.key, templateId: "mail" }],
        },
    ])("reads $case", ({ raw, disabled }) => {
        expect(storedTemplatePreferencesOf(raw)).toEqual({ disabled });
    });
});

describe("isTemplateSourceEnabled", () => {
    it.each<{
        case: string;
        prefs: TemplatePreferencesByScope;
        source: TemplateSourceRef;
        enabled: boolean;
    }>([
        { case: "no switches", prefs: NO_TEMPLATE_PREFERENCES, source: SHOP, enabled: true },
        {
            case: "its own switch off",
            prefs: preferences([{ source: SHOP.key }]),
            source: SHOP,
            enabled: false,
        },
        {
            case: "only a template of it off",
            prefs: preferences([{ source: SHOP.key, templateId: "mail" }]),
            source: SHOP,
            enabled: true,
        },
        {
            case: "another source off",
            prefs: preferences([{ source: "configFolder:other/.camunda" }]),
            source: SHOP,
            enabled: true,
        },
        {
            case: "its switch off in the other scope only",
            prefs: preferences([], [{ source: SHOP.key }]),
            source: SHOP,
            enabled: true,
        },
        {
            case: "an all-projects marketplace off in all projects",
            prefs: preferences([], [{ source: ACME.key }]),
            source: ACME,
            enabled: false,
        },
    ])("is $enabled with $case", ({ prefs, source, enabled }) => {
        expect(isTemplateSourceEnabled(source, prefs)).toBe(enabled);
    });
});

describe("isTemplateOffered", () => {
    it.each<{
        case: string;
        templateId: string;
        source: TemplateSourceRef;
        prefs: TemplatePreferencesByScope;
        offered: boolean;
    }>([
        {
            case: "no switches",
            templateId: "mail",
            source: SHOP,
            prefs: NO_TEMPLATE_PREFERENCES,
            offered: true,
        },
        {
            case: "its source off",
            templateId: "mail",
            source: SHOP,
            prefs: preferences([{ source: SHOP.key }]),
            offered: false,
        },
        {
            case: "its own switch off",
            templateId: "mail",
            source: SHOP,
            prefs: preferences([{ source: SHOP.key, templateId: "mail" }]),
            offered: false,
        },
        {
            case: "another template of its source off",
            templateId: "mail",
            source: SHOP,
            prefs: preferences([{ source: SHOP.key, templateId: "sms" }]),
            offered: true,
        },
        {
            case: "the same id off in another source",
            templateId: "mail",
            source: SHOP,
            prefs: preferences([{ source: "configFolder:other/.camunda", templateId: "mail" }]),
            offered: true,
        },
        {
            case: "its switch off in the other scope only",
            templateId: "rest",
            source: ACME,
            prefs: preferences([{ source: ACME.key, templateId: "rest" }]),
            offered: true,
        },
        {
            case: "a leftover all-projects row of a source now kept per project",
            templateId: "rest",
            source: { key: ACME.key, scope: "project" },
            prefs: preferences([], [{ source: ACME.key }]),
            offered: true,
        },
        {
            case: "an id that differs only in case",
            templateId: "Mail",
            source: SHOP,
            prefs: preferences([{ source: SHOP.key, templateId: "mail" }]),
            offered: true,
        },
    ])("is $offered with $case", ({ templateId, source, prefs, offered }) => {
        expect(isTemplateOffered(templateId, source, prefs)).toBe(offered);
    });
});

describe("templateSourceScopeOf", () => {
    it.each<{ registeredIn: ProjectScope[]; scope: ProjectScope }>([
        { registeredIn: ["project"], scope: "project" },
        { registeredIn: ["allProjects"], scope: "allProjects" },
        { registeredIn: ["allProjects", "project"], scope: "allProjects" },
        { registeredIn: ["project", "allProjects"], scope: "allProjects" },
        { registeredIn: [], scope: "project" },
    ])(
        "keeps the switches of a source registered in $registeredIn in $scope",
        ({ registeredIn, scope }) => {
            expect(templateSourceScopeOf(registeredIn)).toBe(scope);
        },
    );
});

describe("configFolderTemplateSourceOf", () => {
    it.each<{ case: string; dir: string; folders: string[]; key: string }>([
        {
            case: "a single root",
            dir: "/work/shop/.camunda",
            folders: ["/work/shop"],
            key: "configFolder:shop/.camunda",
        },
        {
            case: "the same repository moved on disk",
            dir: "/elsewhere/shop/.camunda",
            folders: ["/elsewhere/shop"],
            key: "configFolder:shop/.camunda",
        },
        {
            case: "a second root added beside it",
            dir: "/work/shop/.camunda",
            folders: ["/work/shop", "/work/billing"],
            key: "configFolder:shop/.camunda",
        },
        {
            case: "the config folder of the second root",
            dir: "/work/billing/.camunda",
            folders: ["/work/shop", "/work/billing"],
            key: "configFolder:billing/.camunda",
        },
        {
            case: "a nested config folder",
            dir: "/work/shop/orders/.camunda",
            folders: ["/work/shop"],
            key: "configFolder:shop/orders/.camunda",
        },
        {
            case: "a root nested in another, read from the innermost",
            dir: "/work/shop/orders/.camunda",
            folders: ["/work/shop", "/work/shop/orders"],
            key: "configFolder:orders/.camunda",
        },
        {
            case: "a root spelled with a trailing slash",
            dir: "/work/shop/.camunda",
            folders: ["/work/shop/"],
            key: "configFolder:shop/.camunda",
        },
        {
            case: "a folder outside every root",
            dir: "/opt/shared/.camunda",
            folders: ["/work/shop"],
            key: "configFolder:/opt/shared/.camunda",
        },
        {
            case: "no root open",
            dir: "/opt/shared/.camunda",
            folders: [],
            key: "configFolder:/opt/shared/.camunda",
        },
        {
            case: "a config folder that is the root",
            dir: "/work/shop",
            folders: ["/work/shop"],
            key: "configFolder:shop",
        },
    ])("keys $case", ({ dir, folders, key }) => {
        expect(configFolderTemplateSourceOf(dir, folders)).toEqual({ key, scope: "project" });
    });
});

describe("switches of a source", () => {
    it("turns the whole source off with a switch that names no template", () => {
        expect(sourceSwitchOf(ACME)).toEqual({ source: ACME.key });
    });

    it("turns one template id off within its source", () => {
        expect(templateSwitchOf(ACME, "rest#2")).toEqual({
            source: ACME.key,
            templateId: "rest#2",
        });
    });

    it("reads a stored list as a whole", () => {
        const stored: TemplatePreferences = { disabled: [sourceSwitchOf(SHOP)] };

        expect(isTemplateSourceEnabled(SHOP, { ...NO_TEMPLATE_PREFERENCES, project: stored })).toBe(
            false,
        );
    });
});
