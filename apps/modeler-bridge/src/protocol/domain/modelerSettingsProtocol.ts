import { ProtocolEntry } from "./protocolEntry";
import { SettingsSetLanguageParams } from "./types";

export const MODELER_SETTINGS_METHODS = {
    settingsSetLanguage: "settings/setLanguage",
} as const;

export const MODELER_SETTINGS_CORE_TO_HOST_REQUESTS = [
    {
        method: MODELER_SETTINGS_METHODS.settingsSetLanguage,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: { locale: "de" } satisfies SettingsSetLanguageParams,
    },
] as const satisfies readonly ProtocolEntry[];
