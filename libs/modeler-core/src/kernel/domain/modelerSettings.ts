import {
    COLOR_THEMES,
    ColorThemeSetting,
    DEFAULT_ELEMENT_ID_STYLE,
    DEFAULT_ELEMENT_IDS_FOLLOW_NAME,
    DEFAULT_FORM_PREVIEW_AUTOMATIC,
    ELEMENT_ID_STYLES,
    ElementIdStyle,
    SURFACE_MODES,
    SurfaceMode,
} from "@miragon/bpmn-modeler-types";

/** The services a marketplace repository can live on, public or self-hosted. */
export const MARKETPLACE_PROVIDERS = ["github", "gitlab"] as const;

export type MarketplaceProvider = (typeof MARKETPLACE_PROVIDERS)[number];

export function isMarketplaceProvider(raw: unknown): raw is MarketplaceProvider {
    return MARKETPLACE_PROVIDERS.some((provider) => provider === raw);
}

/**
 * A bare string is a pasted GitHub/GitLab URL (or local folder path). The object
 * form exists to name a self-hosted host via `baseUrl` (GitHub Enterprise
 * `/api/v3`, or self-hosted GitLab), which a dotted-host URL string cannot
 * express unambiguously. `repo` is the full `group/subgroup/project` path for
 * GitLab, since nested subgroups make a two-field owner/repo split lossy.
 * Validated defensively at parse time since a user hand-edits `settings.json`.
 */
export type MarketplaceSettingsEntry =
    | string
    | {
          readonly provider: MarketplaceProvider;
          readonly repo: string;
          readonly baseUrl?: string;
          readonly ref?: string;
      };

/**
 * The `miragon.bpmnModeler.*` values the core reads through `SettingsPort`, as
 * every host must read them. VS Code reads them one by one; IntelliJ pushes
 * them to the bridge as one snapshot. `settingsNormalization.cases.json` holds
 * the rows each host runs.
 */
export interface ModelerSettingsSnapshot {
    alignToOrigin: boolean;
    showTransactionBoundaries: boolean;
    configFolder: string;
    persistCodeLinkMap: boolean;
    c8ApiVersion: string;
    colorTheme: ColorThemeSetting;
    defaultMode: SurfaceMode;
    favouriteBpmnElements: string[];
    language: string;
    scriptingSpin: boolean;
    lintingEnabled: boolean;
    formPreviewAutomatic: boolean;
    elementIdStyle: ElementIdStyle;
    elementIdsFollowName: boolean;
    marketplaces: MarketplaceSettingsEntry[];
}

const SETTING_KEY_OF_SNAPSHOT_KEY = {
    alignToOrigin: "alignToOrigin",
    showTransactionBoundaries: "showTransactionBoundaries",
    configFolder: "configFolder",
    persistCodeLinkMap: "persistCodeLinkMap",
    c8ApiVersion: "c8ApiVersion",
    colorTheme: "colorTheme",
    defaultMode: "defaultMode",
    favouriteBpmnElements: "favouriteBpmnElements",
    language: "language",
    scriptingSpin: "scripting.spin",
    lintingEnabled: "linting.enabled",
    formPreviewAutomatic: "formPreview.automatic",
    elementIdStyle: "elementIds.style",
    elementIdsFollowName: "elementIds.followName",
    marketplaces: "marketplaces",
} as const satisfies Record<keyof ModelerSettingsSnapshot, string>;

/** A modeler setting as VS Code names it below `miragon.bpmnModeler`, on every host. */
export type SettingKey = (typeof SETTING_KEY_OF_SNAPSHOT_KEY)[keyof ModelerSettingsSnapshot];

export function settingKeyOf(key: keyof ModelerSettingsSnapshot): SettingKey {
    return SETTING_KEY_OF_SNAPSHOT_KEY[key];
}

/** Settings as a host hands them over: any key may be missing or hold any value. */
export type RawModelerSettings = Partial<Record<keyof ModelerSettingsSnapshot, unknown>>;

/** The append-menu palette pins no more. */
export const MAX_FAVOURITE_BPMN_ELEMENTS = 6;

type ReadonlyList<Value> = Value extends (infer Entry)[] ? readonly Entry[] : Value;

type FrozenModelerSettings = {
    readonly [Key in keyof ModelerSettingsSnapshot]: ReadonlyList<ModelerSettingsSnapshot[Key]>;
};

/**
 * The defaults `apps/vscode-plugin/package.json` declares; its contract spec pins
 * them. Their lists are frozen too: `normalizeSettings({})` hands out a copy.
 */
export const DEFAULT_MODELER_SETTINGS: FrozenModelerSettings = Object.freeze({
    alignToOrigin: false,
    showTransactionBoundaries: true,
    configFolder: ".camunda",
    persistCodeLinkMap: false,
    c8ApiVersion: "v2",
    colorTheme: "automatic",
    defaultMode: "implement",
    favouriteBpmnElements: Object.freeze([
        "bpmn:ServiceTask",
        "bpmn:UserTask",
        "bpmn:CallActivity",
        "bpmn:ExclusiveGateway",
    ]),
    language: "en",
    scriptingSpin: true,
    lintingEnabled: true,
    formPreviewAutomatic: DEFAULT_FORM_PREVIEW_AUTOMATIC,
    elementIdStyle: DEFAULT_ELEMENT_ID_STYLE,
    elementIdsFollowName: DEFAULT_ELEMENT_IDS_FOLLOW_NAME,
    marketplaces: Object.freeze([]),
});

const SETTING_PARSERS: {
    readonly [K in keyof ModelerSettingsSnapshot]: (raw: unknown) => ModelerSettingsSnapshot[K];
} = {
    alignToOrigin: (raw) => booleanOr(raw, DEFAULT_MODELER_SETTINGS.alignToOrigin),
    showTransactionBoundaries: (raw) =>
        booleanOr(raw, DEFAULT_MODELER_SETTINGS.showTransactionBoundaries),
    // A blank folder would make discovery scan the whole tree.
    configFolder: (raw) =>
        typeof raw === "string" && raw.trim() !== "" ? raw : DEFAULT_MODELER_SETTINGS.configFolder,
    persistCodeLinkMap: (raw) => booleanOr(raw, DEFAULT_MODELER_SETTINGS.persistCodeLinkMap),
    c8ApiVersion: (raw) => stringOr(raw, DEFAULT_MODELER_SETTINGS.c8ApiVersion),
    colorTheme: (raw) => oneOf(raw, COLOR_THEMES, DEFAULT_MODELER_SETTINGS.colorTheme),
    defaultMode: (raw) => oneOf(raw, SURFACE_MODES, DEFAULT_MODELER_SETTINGS.defaultMode),
    favouriteBpmnElements: (raw) =>
        Array.isArray(raw)
            ? raw.filter(isString).slice(0, MAX_FAVOURITE_BPMN_ELEMENTS)
            : [...DEFAULT_MODELER_SETTINGS.favouriteBpmnElements],
    language: (raw) => stringOr(raw, DEFAULT_MODELER_SETTINGS.language),
    scriptingSpin: (raw) => booleanOr(raw, DEFAULT_MODELER_SETTINGS.scriptingSpin),
    lintingEnabled: (raw) => booleanOr(raw, DEFAULT_MODELER_SETTINGS.lintingEnabled),
    formPreviewAutomatic: (raw) => booleanOr(raw, DEFAULT_MODELER_SETTINGS.formPreviewAutomatic),
    elementIdStyle: (raw) => oneOf(raw, ELEMENT_ID_STYLES, DEFAULT_MODELER_SETTINGS.elementIdStyle),
    elementIdsFollowName: (raw) => booleanOr(raw, DEFAULT_MODELER_SETTINGS.elementIdsFollowName),
    // Each entry is validated where it becomes a registration.
    marketplaces: (raw) => (Array.isArray(raw) ? raw : []),
};

const SNAPSHOT_KEYS = Object.keys(SETTING_PARSERS) as (keyof ModelerSettingsSnapshot)[];

/** One setting as a host must read it, whatever it was handed. */
export function parseSetting<K extends keyof ModelerSettingsSnapshot>(
    key: K,
    raw: unknown,
): ModelerSettingsSnapshot[K] {
    return SETTING_PARSERS[key](raw);
}

/** Every setting as a host must read it; keys the snapshot does not hold are dropped. */
export function normalizeSettings(raw: RawModelerSettings): ModelerSettingsSnapshot {
    return {
        alignToOrigin: parseSetting("alignToOrigin", raw.alignToOrigin),
        showTransactionBoundaries: parseSetting(
            "showTransactionBoundaries",
            raw.showTransactionBoundaries,
        ),
        configFolder: parseSetting("configFolder", raw.configFolder),
        persistCodeLinkMap: parseSetting("persistCodeLinkMap", raw.persistCodeLinkMap),
        c8ApiVersion: parseSetting("c8ApiVersion", raw.c8ApiVersion),
        colorTheme: parseSetting("colorTheme", raw.colorTheme),
        defaultMode: parseSetting("defaultMode", raw.defaultMode),
        favouriteBpmnElements: parseSetting("favouriteBpmnElements", raw.favouriteBpmnElements),
        language: parseSetting("language", raw.language),
        scriptingSpin: parseSetting("scriptingSpin", raw.scriptingSpin),
        lintingEnabled: parseSetting("lintingEnabled", raw.lintingEnabled),
        formPreviewAutomatic: parseSetting("formPreviewAutomatic", raw.formPreviewAutomatic),
        elementIdStyle: parseSetting("elementIdStyle", raw.elementIdStyle),
        elementIdsFollowName: parseSetting("elementIdsFollowName", raw.elementIdsFollowName),
        marketplaces: parseSetting("marketplaces", raw.marketplaces),
    };
}

/** The settings whose values differ, in snapshot order; lists and entries compare by content. */
export function changedSettingKeys(
    previous: ModelerSettingsSnapshot,
    next: ModelerSettingsSnapshot,
): SettingKey[] {
    return SNAPSHOT_KEYS.filter(
        (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
    ).map(settingKeyOf);
}

function booleanOr(raw: unknown, fallback: boolean): boolean {
    return typeof raw === "boolean" ? raw : fallback;
}

function stringOr(raw: unknown, fallback: string): string {
    return isString(raw) ? raw : fallback;
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.find((value) => value === raw) ?? fallback;
}

function isString(raw: unknown): raw is string {
    return typeof raw === "string";
}
