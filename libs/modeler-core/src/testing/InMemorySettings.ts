import { SurfaceMode } from "@miragon/bpmn-modeler-types";

import { MarketplaceSettingsEntry, SettingsPort } from "../shared/domain/hostPorts";

export interface SettingsValues {
    alignToOrigin: boolean;
    showTransactionBoundaries: boolean;
    configFolder: string;
    c8ApiVersion: string;
    lintingEnabled: boolean;
    colorTheme: "automatic" | "light";
    defaultMode: SurfaceMode;
    favouriteBpmnElements: string[];
    language: string;
    persistCodeLinkMap: boolean;
    scriptingSpin: boolean;
    marketplaces: MarketplaceSettingsEntry[];
}

/** `values` is mutable so a test can change a setting between two reads. */
export class InMemorySettings implements SettingsPort {
    readonly values: SettingsValues;

    constructor(overrides: Partial<SettingsValues> = {}) {
        this.values = {
            alignToOrigin: false,
            showTransactionBoundaries: true,
            configFolder: ".camunda",
            c8ApiVersion: "v2",
            lintingEnabled: true,
            colorTheme: "automatic",
            defaultMode: "implement",
            favouriteBpmnElements: [],
            language: "en",
            persistCodeLinkMap: false,
            scriptingSpin: true,
            marketplaces: [],
            ...overrides,
        };
    }

    getAlignToOrigin(): boolean {
        return this.values.alignToOrigin;
    }

    getShowTransactionBoundaries(): boolean {
        return this.values.showTransactionBoundaries;
    }

    getConfigFolder(): string {
        return this.values.configFolder;
    }

    getC8ApiVersion(): string {
        return this.values.c8ApiVersion;
    }

    getLintingEnabled(): boolean {
        return this.values.lintingEnabled;
    }

    getColorTheme(): "automatic" | "light" {
        return this.values.colorTheme;
    }

    getDefaultMode(): SurfaceMode {
        return this.values.defaultMode;
    }

    getFavouriteBpmnElements(): string[] {
        return this.values.favouriteBpmnElements;
    }

    getLanguage(): string {
        return this.values.language;
    }

    getPersistCodeLinkMap(): boolean {
        return this.values.persistCodeLinkMap;
    }

    getScriptingSpin(): boolean {
        return this.values.scriptingSpin;
    }

    getMarketplaces(): MarketplaceSettingsEntry[] {
        return this.values.marketplaces;
    }
}
