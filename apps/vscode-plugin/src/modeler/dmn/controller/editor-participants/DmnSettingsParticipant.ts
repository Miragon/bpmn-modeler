import { DmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Wires the DMN settings + language broadcast for a session, so the webview
 * receives the current theme and UI language and stays in sync when the
 * `colorTheme` or `language` setting changes.
 */
export class DmnSettingsParticipant implements EditorSessionParticipant {
    constructor(private readonly settingsBroadcaster: DmnSettingsBroadcaster) {}

    onResolve(session: EditorSessionContext): void {
        this.settingsBroadcaster.subscribe(session.editorId);
    }
}
