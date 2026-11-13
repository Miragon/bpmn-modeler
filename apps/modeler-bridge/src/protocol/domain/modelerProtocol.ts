import { ProtocolEntry } from "./protocolEntry";
import {
    EditorRefParams,
    EmptyParams,
    MigrateAllParams,
    SettingsDidChangeParams,
    SettingsSetLintingEnabledParams,
} from "./types";

export const MODELER_METHODS = {
    settingsDidChange: "settings/didChange",
    modelerChangeEngineVersion: "modeler/changeEngineVersion",
    modelerChangeLanguage: "modeler/changeLanguage",
    lintingToggle: "linting/toggle",
    migrationMigrateAll: "migration/migrateAll",
    layoutFormat: "layout/format",
    layoutCleanup: "layout/cleanup",
    settingsSetLintingEnabled: "settings/setLintingEnabled",
} as const;

export const MODELER_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: MODELER_METHODS.settingsDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { settings: {} } satisfies SettingsDidChangeParams,
    },
] as const satisfies readonly ProtocolEntry[];

/** The modeler's IDE actions, sent when the user runs one. */
export const MODELER_COMMAND_NOTIFICATIONS = [
    {
        method: MODELER_METHODS.modelerChangeEngineVersion,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { editorId: "e1" } satisfies EditorRefParams,
    },
    {
        method: MODELER_METHODS.modelerChangeLanguage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.lintingToggle,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.migrationMigrateAll,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { workspaceRoot: "/repo" } satisfies MigrateAllParams,
    },
    {
        method: MODELER_METHODS.layoutFormat,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: MODELER_METHODS.layoutCleanup,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const MODELER_CORE_TO_HOST_REQUESTS = [
    {
        method: MODELER_METHODS.settingsSetLintingEnabled,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: { enabled: false } satisfies SettingsSetLintingEnabledParams,
    },
] as const satisfies readonly ProtocolEntry[];
