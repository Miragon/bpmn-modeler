import { BpmnSettingsBroadcaster } from "../../service/BpmnSettingsBroadcaster";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Wires the BPMN settings broadcast for a session, so modeler/language settings
 * are pushed to the webview and kept in sync on change.
 */
export class SettingsParticipant implements EditorSessionParticipant {
    constructor(private readonly settingsBroadcaster: BpmnSettingsBroadcaster) {}

    onResolve(session: EditorSessionContext): void {
        this.settingsBroadcaster.subscribe(session.editorId);
    }
}
