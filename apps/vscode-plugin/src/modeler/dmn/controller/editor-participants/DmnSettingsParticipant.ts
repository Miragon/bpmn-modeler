import { DmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Wires the DMN color-theme broadcast for a session, so the webview receives the
 * current theme and stays in sync when the `colorTheme` setting changes.
 */
export class DmnSettingsParticipant implements EditorSessionParticipant {
    constructor(private readonly settingsBroadcaster: DmnSettingsBroadcaster) {}

    onResolve(session: EditorSessionContext): void {
        this.settingsBroadcaster.subscribe(session.editorId);
    }
}
