import {
    asProtocolMessage,
    type Command,
    type DmnModelerSettingQuery,
    type HostThemeAdapter,
    type PropertiesPanelStateQuery,
    type Query,
    takeFocus,
} from "@miragon/bpmn-modeler-shared";

import type { DmnDocumentSession } from "./documentSession";

type DmnMessageSession = Pick<
    DmnDocumentSession,
    "receiveHostFile" | "respondToFlush" | "applyLanguage" | "focusCanvas"
>;

export interface DmnHostReplies {
    panelState: { done(query: PropertiesPanelStateQuery): void };
    settings: { done(query: DmnModelerSettingQuery): void };
    theme: Pick<HostThemeAdapter, "setMode">;
}

export async function routeDmnHostMessage(
    message: Query | Command,
    session: DmnMessageSession,
    replies: DmnHostReplies,
): Promise<void> {
    const inbound = asProtocolMessage(message);
    switch (inbound.type) {
        case "DmnFileQuery":
            await session.receiveHostFile(inbound);
            break;
        case "PropertiesPanelStateQuery":
            replies.panelState.done(inbound);
            break;
        case "DmnModelerSettingQuery": {
            // Applied live so a VS Code theme change in `"automatic"` mode
            // re-themes an already-open editor, not just on first load.
            const settingQuery = inbound;
            replies.theme.setMode(settingQuery.setting.colorTheme);
            replies.settings.done(settingQuery);
            break;
        }
        case "LanguageQuery":
            await session.applyLanguage(inbound.locale);
            break;
        case "TakeFocusQuery":
            takeFocus(() => session.focusCanvas());
            break;
        case "FlushDocumentQuery":
        case "ReleaseDocumentFlushQuery":
            await session.respondToFlush(inbound);
            break;
    }
}
