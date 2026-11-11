import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ELEMENT_ID_STYLES, ElementIdStyle } from "@miragon/bpmn-modeler-types";

import { settingsNormalizationCases, TYPESCRIPT_ONLY_SETTINGS_CASES } from "../../testing";
import {
    changedSettingKeys,
    DEFAULT_MODELER_SETTINGS,
    isMarketplaceProvider,
    ModelerSettingsSnapshot,
    normalizeSettings,
    SettingKey,
    settingKeyOf,
} from "./modelerSettings";

const SHARED_CASES = settingsNormalizationCases(
    readFileSync(resolve(__dirname, "settingsNormalization.cases.json"), "utf8"),
);

const ALL_CASES = [...SHARED_CASES, ...TYPESCRIPT_ONLY_SETTINGS_CASES];

describe("DEFAULT_MODELER_SETTINGS", () => {
    it("enables automatic form preview by default", () => {
        expect(DEFAULT_MODELER_SETTINGS).toHaveProperty("formPreviewAutomatic", true);
        expect(normalizeSettings({})).toHaveProperty("formPreviewAutomatic", true);
    });

    it("spells generated IDs with the type prefix and leaves IDs alone by default", () => {
        expect(normalizeSettings({})).toMatchObject({
            elementIdStyle: "typePrefix",
            elementIdsFollowName: false,
        });
    });

    it("keeps its lists unchangeable", () => {
        const favourites = DEFAULT_MODELER_SETTINGS.favouriteBpmnElements as string[];
        const marketplaces = DEFAULT_MODELER_SETTINGS.marketplaces as string[];

        expect(() => favourites.push("bpmn:Task")).toThrow(TypeError);
        expect(() => marketplaces.push("https://github.com/acme/templates")).toThrow(TypeError);
    });
});

describe("isMarketplaceProvider", () => {
    it.each([
        { raw: "github", expected: true },
        { raw: "gitlab", expected: true },
        { raw: "GitHub", expected: false },
        { raw: "bitbucket", expected: false },
        { raw: undefined, expected: false },
    ])("reads $raw as a provider: $expected", ({ raw, expected }) => {
        expect(isMarketplaceProvider(raw)).toBe(expected);
    });
});

describe("normalizeSettings", () => {
    it.each([
        { rawValue: true, expected: true },
        { rawValue: false, expected: false },
        { rawValue: "false", expected: true },
        { rawValue: 0, expected: true },
        { rawValue: null, expected: true },
        { rawValue: undefined, expected: true },
    ])(
        "normalizes automatic form preview from $rawValue to $expected",
        ({ rawValue, expected }) => {
            const raw: Record<string, unknown> = { formPreviewAutomatic: rawValue };

            expect(normalizeSettings(raw)).toHaveProperty("formPreviewAutomatic", expected);
        },
    );

    it.each<{ rawValue: unknown; expected: ElementIdStyle }>([
        ...ELEMENT_ID_STYLES.map((style) => ({ rawValue: style, expected: style })),
        { rawValue: "TypeSuffix", expected: "typePrefix" },
        { rawValue: "kebabCase", expected: "typePrefix" },
        { rawValue: "", expected: "typePrefix" },
        { rawValue: 1, expected: "typePrefix" },
        { rawValue: null, expected: "typePrefix" },
        { rawValue: undefined, expected: "typePrefix" },
    ])("reads the ID style $rawValue as $expected", ({ rawValue, expected }) => {
        expect(normalizeSettings({ elementIdStyle: rawValue }).elementIdStyle).toBe(expected);
    });

    it.each([
        { rawValue: true, expected: true },
        { rawValue: false, expected: false },
        { rawValue: "true", expected: false },
        { rawValue: 1, expected: false },
        { rawValue: undefined, expected: false },
    ])("reads IDs following names from $rawValue as $expected", ({ rawValue, expected }) => {
        expect(normalizeSettings({ elementIdsFollowName: rawValue }).elementIdsFollowName).toBe(
            expected,
        );
    });

    it.each(ALL_CASES)("$name", ({ raw, normalized }) => {
        expect(normalizeSettings(raw)).toEqual({ ...DEFAULT_MODELER_SETTINGS, ...normalized });
    });

    it.each(ALL_CASES)("reads the same values a second time: $name", ({ raw }) => {
        const once = normalizeSettings(raw);

        expect(normalizeSettings(once)).toEqual(once);
    });

    it("names only snapshot keys in the shared rows", () => {
        const namedKeys = SHARED_CASES.flatMap(({ raw, normalized }) => [
            ...Object.keys(raw),
            ...Object.keys(normalized),
        ]);

        expect(namedKeys.filter((key) => !(key in DEFAULT_MODELER_SETTINGS))).toEqual([]);
    });

    it("hands out lists of its own for the defaults", () => {
        const first = normalizeSettings({});

        first.favouriteBpmnElements.push("bpmn:Task");
        first.marketplaces.push("https://github.com/acme/templates");

        expect(normalizeSettings({})).toEqual(DEFAULT_MODELER_SETTINGS);
    });

    it("reads lintingEnabled from the snapshot", () => {
        expect(normalizeSettings({ lintingEnabled: false }).lintingEnabled).toBe(false);
    });

    it("drops a key the snapshot does not hold", () => {
        const raw: Record<string, unknown> = { propertiesPanelVisible: false };

        expect(normalizeSettings(raw)).toEqual(DEFAULT_MODELER_SETTINGS);
    });
});

describe("settingKeyOf", () => {
    it.each<{ key: keyof ModelerSettingsSnapshot; settingKey: SettingKey }>([
        { key: "language", settingKey: "language" },
        { key: "scriptingSpin", settingKey: "scripting.spin" },
        { key: "lintingEnabled", settingKey: "linting.enabled" },
        { key: "formPreviewAutomatic", settingKey: "formPreview.automatic" },
        { key: "elementIdStyle", settingKey: "elementIds.style" },
        { key: "elementIdsFollowName", settingKey: "elementIds.followName" },
    ])("names $key by the key VS Code stores it under", ({ key, settingKey }) => {
        expect(settingKeyOf(key)).toBe(settingKey);
    });
});

describe("changedSettingKeys", () => {
    it("reports automatic form preview changes with the central setting key", () => {
        const before = normalizeSettings({});
        const after = { ...before, formPreviewAutomatic: false };

        expect(changedSettingKeys(before, after)).toEqual(["formPreview.automatic"]);
        expect(changedSettingKeys(after, after)).toEqual([]);
    });

    const marketplaceEntry = { provider: "github", repo: "acme/templates" } as const;

    it.each<{
        case: string;
        previous?: Partial<ModelerSettingsSnapshot>;
        next: Partial<ModelerSettingsSnapshot>;
        changed: SettingKey[];
    }>([
        { case: "nothing for the same values", next: {}, changed: [] },
        { case: "a changed value", next: { language: "de" }, changed: ["language"] },
        {
            case: "every changed value in snapshot order",
            next: { language: "de", alignToOrigin: true },
            changed: ["alignToOrigin", "language"],
        },
        {
            case: "nothing for the same favourites in a new list",
            next: { favouriteBpmnElements: [...DEFAULT_MODELER_SETTINGS.favouriteBpmnElements] },
            changed: [],
        },
        {
            case: "reordered favourites",
            next: {
                favouriteBpmnElements: [
                    ...DEFAULT_MODELER_SETTINGS.favouriteBpmnElements,
                ].reverse(),
            },
            changed: ["favouriteBpmnElements"],
        },
        {
            case: "nothing for the same marketplace entry in a new object",
            previous: { marketplaces: [marketplaceEntry] },
            next: { marketplaces: [{ ...marketplaceEntry }] },
            changed: [],
        },
        {
            case: "a marketplace entry pinned to another ref",
            previous: { marketplaces: [marketplaceEntry] },
            next: { marketplaces: [{ ...marketplaceEntry, ref: "v2" }] },
            changed: ["marketplaces"],
        },
    ])("reports $case", ({ previous = {}, next, changed }) => {
        const before = normalizeSettings(previous);

        expect(changedSettingKeys(before, { ...before, ...next })).toEqual(changed);
    });

    it.each<{ next: Partial<ModelerSettingsSnapshot>; changed: SettingKey }>([
        { next: { alignToOrigin: true }, changed: "alignToOrigin" },
        { next: { showTransactionBoundaries: false }, changed: "showTransactionBoundaries" },
        { next: { configFolder: ".config" }, changed: "configFolder" },
        { next: { persistCodeLinkMap: true }, changed: "persistCodeLinkMap" },
        { next: { c8ApiVersion: "v1" }, changed: "c8ApiVersion" },
        { next: { colorTheme: "light" }, changed: "colorTheme" },
        { next: { defaultMode: "design" }, changed: "defaultMode" },
        { next: { favouriteBpmnElements: ["bpmn:Task"] }, changed: "favouriteBpmnElements" },
        { next: { language: "de" }, changed: "language" },
        { next: { scriptingSpin: false }, changed: "scripting.spin" },
        { next: { lintingEnabled: false }, changed: "linting.enabled" },
        { next: { formPreviewAutomatic: false }, changed: "formPreview.automatic" },
        { next: { elementIdStyle: "snakeCase" }, changed: "elementIds.style" },
        { next: { elementIdsFollowName: true }, changed: "elementIds.followName" },
        { next: { marketplaces: ["https://github.com/acme/templates"] }, changed: "marketplaces" },
    ])(
        "names a changed value by the key VS Code stores it under: $changed",
        ({ next, changed }) => {
            const before = normalizeSettings({});

            expect(changedSettingKeys(before, { ...before, ...next })).toEqual([changed]);
        },
    );
});
