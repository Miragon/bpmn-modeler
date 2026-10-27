import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { settingsNormalizationCases, TYPESCRIPT_ONLY_SETTINGS_CASES } from "../../testing";
import {
    changedSettingKeys,
    DEFAULT_LINTING_ENABLED,
    DEFAULT_MODELER_SETTINGS,
    ModelerSettingsSnapshot,
    normalizeSettings,
    parseLintingEnabled,
} from "./modelerSettings";

const SHARED_CASES = settingsNormalizationCases(
    readFileSync(resolve(__dirname, "settingsNormalization.cases.json"), "utf8"),
);

const ALL_CASES = [...SHARED_CASES, ...TYPESCRIPT_ONLY_SETTINGS_CASES];

describe("DEFAULT_MODELER_SETTINGS", () => {
    it("keeps its lists unchangeable", () => {
        const favourites = DEFAULT_MODELER_SETTINGS.favouriteBpmnElements as string[];
        const marketplaces = DEFAULT_MODELER_SETTINGS.marketplaces as string[];

        expect(() => favourites.push("bpmn:Task")).toThrow(TypeError);
        expect(() => marketplaces.push("https://github.com/acme/templates")).toThrow(TypeError);
    });
});

describe("normalizeSettings", () => {
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

    it("drops a key the snapshot does not hold", () => {
        const raw: Record<string, unknown> = { lintingEnabled: false };

        expect(normalizeSettings(raw)).toEqual(DEFAULT_MODELER_SETTINGS);
    });
});

describe("parseLintingEnabled", () => {
    it.each([
        { case: "an enabled flag", raw: true, enabled: true },
        { case: "a disabled flag", raw: false, enabled: false },
        { case: "no flag as the default", raw: undefined, enabled: DEFAULT_LINTING_ENABLED },
        { case: "a text as the default", raw: "false", enabled: DEFAULT_LINTING_ENABLED },
    ])("reads $case", ({ raw, enabled }) => {
        expect(parseLintingEnabled(raw)).toBe(enabled);
    });
});

describe("changedSettingKeys", () => {
    const marketplaceEntry = { provider: "github", repo: "acme/templates" } as const;

    it.each<{
        case: string;
        previous?: Partial<ModelerSettingsSnapshot>;
        next: Partial<ModelerSettingsSnapshot>;
        changed: (keyof ModelerSettingsSnapshot)[];
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
});
