import { SurfaceMode } from "@miragon/bpmn-modeler-types";

import { MarketplaceSettingsEntry } from "./hostPorts";

export interface ModelerSettingsSnapshot {
    alignToOrigin: boolean;
    showTransactionBoundaries: boolean;
    configFolder: string;
    persistCodeLinkMap: boolean;
    c8ApiVersion: string;
    colorTheme: "automatic" | "light";
    defaultMode: SurfaceMode;
    favouriteBpmnElements: string[];
    language: string;
    scriptingSpin: boolean;
    marketplaces: MarketplaceSettingsEntry[];
}

export type RawModelerSettings = Partial<Record<keyof ModelerSettingsSnapshot, unknown>>;

export const DEFAULT_MODELER_SETTINGS: Readonly<ModelerSettingsSnapshot> = Object.freeze({
    alignToOrigin: false,
    showTransactionBoundaries: true,
    configFolder: ".camunda",
    persistCodeLinkMap: false,
    c8ApiVersion: "v2",
    colorTheme: "automatic",
    defaultMode: "implement",
    favouriteBpmnElements: [
        "bpmn:ServiceTask",
        "bpmn:UserTask",
        "bpmn:CallActivity",
        "bpmn:ExclusiveGateway",
    ],
    language: "en",
    scriptingSpin: true,
    marketplaces: [],
});

export const DEFAULT_LINTING_ENABLED = true;

export function parseSetting<K extends keyof ModelerSettingsSnapshot>(
    key: K,
    raw: unknown,
): ModelerSettingsSnapshot[K] {
    return (raw ?? DEFAULT_MODELER_SETTINGS[key]) as ModelerSettingsSnapshot[K];
}

export function parseLintingEnabled(raw: unknown): boolean {
    return (raw ?? DEFAULT_LINTING_ENABLED) as boolean;
}

export function normalizeSettings(raw: RawModelerSettings): ModelerSettingsSnapshot {
    return { ...DEFAULT_MODELER_SETTINGS, ...raw } as ModelerSettingsSnapshot;
}

export function changedSettingKeys(
    _previous: ModelerSettingsSnapshot,
    _next: ModelerSettingsSnapshot,
): (keyof ModelerSettingsSnapshot)[] {
    return [];
}
