import { SettingsPort } from "../kernel/domain/hostPorts";
import { ModelerSettingsSnapshot, RawModelerSettings } from "../kernel/domain/modelerSettings";

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
        marketplaces: settings.getMarketplaces(),
    };
}
