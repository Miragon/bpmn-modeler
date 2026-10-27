import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { settingsNormalizationCases } from "../../testing";
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

describe("normalizeSettings", () => {
    it.each(SHARED_CASES)("$name", ({ raw, normalized }) => {
        expect(normalizeSettings(raw)).toEqual({ ...DEFAULT_MODELER_SETTINGS, ...normalized });
    });

    it.each(SHARED_CASES)("reads the same values a second time: $name", ({ raw }) => {
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

    // Shapes the typed IntelliJ store cannot hold, so they stay out of the shared rows.
    it.each<{
        case: string;
        raw: Record<string, unknown>;
        normalized: Partial<ModelerSettingsSnapshot>;
    }>([
        {
            case: "reads a config folder that is no string as the default",
            raw: { configFolder: 42 },
            normalized: {},
        },
        {
            case: "reads flags that are no booleans as their defaults",
            raw: {
                alignToOrigin: "true",
                showTransactionBoundaries: 0,
                persistCodeLinkMap: "yes",
                scriptingSpin: null,
            },
            normalized: {},
        },
        {
            case: "reads texts that are no strings as their defaults",
            raw: { c8ApiVersion: 1, language: ["de"] },
            normalized: {},
        },
        {
            case: "reads a theme and mode that are no strings as their defaults",
            raw: { colorTheme: 1, defaultMode: null },
            normalized: {},
        },
        {
            case: "reads favourites that are no list as the default",
            raw: { favouriteBpmnElements: "bpmn:UserTask" },
            normalized: {},
        },
        {
            case: "drops favourite entries that are no strings",
            raw: { favouriteBpmnElements: ["bpmn:UserTask", 7, null, "bpmn:ServiceTask"] },
            normalized: { favouriteBpmnElements: ["bpmn:UserTask", "bpmn:ServiceTask"] },
        },
        {
            case: "reads marketplaces that are no list as none",
            raw: { marketplaces: "https://github.com/acme/templates" },
            normalized: {},
        },
        {
            case: "keeps a marketplace object entry",
            raw: { marketplaces: [{ provider: "gitlab", repo: "group/project" }] },
            normalized: { marketplaces: [{ provider: "gitlab", repo: "group/project" }] },
        },
        {
            case: "drops a key the snapshot does not hold",
            raw: { lintingEnabled: false },
            normalized: {},
        },
    ])("$case", ({ raw, normalized }) => {
        expect(normalizeSettings(raw)).toEqual({ ...DEFAULT_MODELER_SETTINGS, ...normalized });
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
        const before: ModelerSettingsSnapshot = { ...DEFAULT_MODELER_SETTINGS, ...previous };

        expect(changedSettingKeys(before, { ...before, ...next })).toEqual(changed);
    });
});
