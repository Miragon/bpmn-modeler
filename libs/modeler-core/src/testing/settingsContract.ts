import { beforeEach, describe, expect, it } from "vitest";

import {
    DEFAULT_MODELER_SETTINGS,
    ModelerSettingsSnapshot,
    RawModelerSettings,
} from "../kernel/domain/modelerSettings";
import { SettingsPort } from "../kernel/port/hostPorts";

/** One {@link SettingsPort} adapter under the {@link describeSettingsContract} scenarios. */
export interface SettingsContractFixture {
    readonly settings: SettingsPort;
    /**
     * Stores settings in the host as the user wrote them, in place of those
     * stored before; a key left out is unset. `settings.marketplaces` is the
     * list registered for all projects, `projectMarketplaces` the open
     * project's own.
     */
    store(settings: RawModelerSettings, projectMarketplaces?: readonly unknown[]): Promise<void>;
}

/** A row of `kernel/domain/settingsNormalization.cases.json`. */
export interface SettingsNormalizationCase {
    readonly name: string;
    readonly raw: RawModelerSettings;
    /** Every key left out reads its default. */
    readonly normalized: Partial<ModelerSettingsSnapshot>;
}

/** The rows of the shared cases file; the specs read it, because the kit imports no `node:fs`. */
export function settingsNormalizationCases(casesFileText: string): SettingsNormalizationCase[] {
    return (JSON.parse(casesFileText) as { cases: SettingsNormalizationCase[] }).cases;
}

/**
 * Rows with shapes the typed IntelliJ store cannot hold, so the Kotlin test
 * skips them; VS Code's `settings.json` and the bridge's JSON can carry them.
 */
export const TYPESCRIPT_ONLY_SETTINGS_CASES: readonly SettingsNormalizationCase[] = [
    {
        name: "reads a config folder that is no string as the default",
        raw: { configFolder: 42 },
        normalized: {},
    },
    {
        name: "reads flags that are no booleans as their defaults",
        raw: {
            alignToOrigin: "true",
            showTransactionBoundaries: 0,
            persistCodeLinkMap: "yes",
            scriptingSpin: null,
            lintingEnabled: "false",
            formPreviewAutomatic: "false",
        },
        normalized: {},
    },
    {
        name: "reads texts that are no strings as their defaults",
        raw: { c8ApiVersion: 1, language: ["de"] },
        normalized: {},
    },
    {
        name: "reads a theme and mode that are no strings as their defaults",
        raw: { colorTheme: 1, defaultMode: null },
        normalized: {},
    },
    {
        name: "reads favourites that are no list as the default",
        raw: { favouriteBpmnElements: "bpmn:UserTask" },
        normalized: {},
    },
    {
        name: "drops favourite entries that are no strings",
        raw: { favouriteBpmnElements: ["bpmn:UserTask", 7, null, "bpmn:ServiceTask"] },
        normalized: { favouriteBpmnElements: ["bpmn:UserTask", "bpmn:ServiceTask"] },
    },
    {
        name: "reads marketplaces that are no list as none",
        raw: { marketplaces: "https://github.com/acme/templates" },
        normalized: {},
    },
    {
        name: "keeps a marketplace object entry",
        raw: { marketplaces: [{ provider: "gitlab", repo: "group/project" }] },
        normalized: { marketplaces: [{ provider: "gitlab", repo: "group/project" }] },
    },
];

/** What a host answers through its getters, as one snapshot. */
export function readSettingsSnapshot(settings: SettingsPort): ModelerSettingsSnapshot {
    return {
        alignToOrigin: settings.getAlignToOrigin(),
        showTransactionBoundaries: settings.getShowTransactionBoundaries(),
        configFolder: settings.getConfigFolder(),
        persistCodeLinkMap: settings.getPersistCodeLinkMap(),
        c8ApiVersion: settings.getC8ApiVersion(),
        colorTheme: settings.getColorTheme(),
        defaultMode: settings.getDefaultMode(),
        favouriteBpmnElements: settings.getFavouriteBpmnElements(),
        language: settings.getLanguage(),
        scriptingSpin: settings.getScriptingSpin(),
        lintingEnabled: settings.getLintingEnabled(),
        formPreviewAutomatic: settings.getFormPreviewAutomatic(),
        marketplaces: settings.getMarketplaces(),
    };
}

const ONE = "https://github.com/acme/one";
const TWO = "https://github.com/acme/two";
const SELF_HOSTED = {
    provider: "gitlab",
    repo: "group/project",
    baseUrl: "https://gitlab.acme.com",
} as const;

/**
 * The rules of {@link SettingsPort} the core relies on, run against one
 * adapter: every setting reads its default while nothing is stored, a stored
 * value reads as `normalizeSettings` reads it (the rows of
 * `settingsNormalization.cases.json`, which the Kotlin store runs too, and
 * {@link TYPESCRIPT_ONLY_SETTINGS_CASES}), every read answers from what is
 * stored now, and the marketplaces read as one list: the all-projects entries,
 * then the project's own, each entry once and as written, so the core fetches
 * each marketplace once and reports one it cannot parse instead of pruning
 * its cache.
 *
 * Left out: which scope wins for a setting other than the marketplaces, as the
 * core reads only the result (VS Code lets a workspace value shadow the
 * user's, IntelliJ keeps every setting for all projects); a project
 * marketplace value that is no list, which only VS Code's Workspace
 * `settings.json` can hold, so its own spec reads it; and whether a caller may
 * change a list it was handed, as no core caller does. Change events reach the
 * core through `EditorHandle.onDidChangeSetting` and the lint choice is
 * written through `LintingPreferencePort`, so they belong to those ports.
 */
export function describeSettingsContract(
    adapter: string,
    createFixture: () => Promise<SettingsContractFixture>,
    sharedCasesFileText: string,
): void {
    const normalizationCases = [
        ...settingsNormalizationCases(sharedCasesFileText),
        ...TYPESCRIPT_ONLY_SETTINGS_CASES,
    ];

    describe(`${adapter} keeps the SettingsPort contract`, () => {
        let fixture: SettingsContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        it("reads every default while nothing is stored", () => {
            expect(readSettingsSnapshot(fixture.settings)).toEqual(DEFAULT_MODELER_SETTINGS);
        });

        it.each(normalizationCases)("$name", async ({ raw, normalized }) => {
            await fixture.store(raw);

            expect(readSettingsSnapshot(fixture.settings)).toEqual({
                ...DEFAULT_MODELER_SETTINGS,
                ...normalized,
            });
        });

        it("answers from the settings stored now, and reads a setting no longer stored as its default", async () => {
            await fixture.store({ language: "de", configFolder: "config", marketplaces: [ONE] });
            expect(readSettingsSnapshot(fixture.settings)).toEqual({
                ...DEFAULT_MODELER_SETTINGS,
                language: "de",
                configFolder: "config",
                marketplaces: [ONE],
            });

            await fixture.store({ language: "fr" });

            expect(readSettingsSnapshot(fixture.settings)).toEqual({
                ...DEFAULT_MODELER_SETTINGS,
                language: "fr",
            });
        });

        it.each<{
            behaviour: string;
            allProjects: readonly unknown[];
            project: readonly unknown[];
            listed: readonly unknown[];
        }>([
            {
                behaviour: "lists no marketplace when neither list holds one",
                allProjects: [],
                project: [],
                listed: [],
            },
            {
                behaviour: "lists the all-projects marketplaces before the project's own",
                allProjects: [TWO],
                project: [ONE],
                listed: [TWO, ONE],
            },
            {
                behaviour:
                    "lists a marketplace both lists hold once, where the all-projects list has it, matching an object entry by its fields",
                allProjects: [ONE, SELF_HOSTED],
                project: [TWO, { ...SELF_HOSTED }, ONE],
                listed: [ONE, SELF_HOSTED, TWO],
            },
            {
                behaviour: "lists a marketplace once that one list holds twice",
                allProjects: [ONE, ONE],
                project: [TWO, TWO],
                listed: [ONE, TWO],
            },
            {
                behaviour: "keeps every marketplace as written, also one the core cannot parse",
                allProjects: ["not a marketplace", SELF_HOSTED],
                project: [{ repo: "acme/templates" }],
                listed: ["not a marketplace", SELF_HOSTED, { repo: "acme/templates" }],
            },
        ])("$behaviour", async ({ allProjects, project, listed }) => {
            await fixture.store({ marketplaces: allProjects }, project);

            expect(fixture.settings.getMarketplaces()).toEqual(listed);
        });
    });
}
