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
        marketplaces: settings.getMarketplaces(),
    };
}
