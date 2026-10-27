import { SurfaceMode } from "@miragon/bpmn-modeler-types";

import { MarketplaceSettingsEntry, SettingsPort } from "../kernel/domain/hostPorts";
import {
    DEFAULT_LINTING_ENABLED,
    DEFAULT_MODELER_SETTINGS,
    ModelerSettingsSnapshot,
} from "../kernel/domain/modelerSettings";

export interface SettingsValues extends ModelerSettingsSnapshot {
    lintingEnabled: boolean;
}

/**
 * `values` is mutable so a test can change a setting between two reads. They
 * are not normalised, so a spec can hand the core a value no host would.
 */
export class InMemorySettings implements SettingsPort {
    readonly values: SettingsValues;

    constructor(overrides: Partial<SettingsValues> = {}) {
        this.values = {
            ...DEFAULT_MODELER_SETTINGS,
            lintingEnabled: DEFAULT_LINTING_ENABLED,
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
