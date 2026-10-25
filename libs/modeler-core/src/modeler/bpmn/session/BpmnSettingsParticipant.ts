import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../shared/domain/EditorSessionParticipant";
import { BpmnSettingsBroadcaster } from "../service/BpmnSettingsBroadcaster";

/**
 * Wires the BPMN settings broadcast for a session, so modeler/language settings
 * are pushed to the webview and kept in sync on change.
 */
export class BpmnSettingsParticipant implements EditorSessionParticipant {
    constructor(private readonly settingsBroadcaster: BpmnSettingsBroadcaster) {}

    onResolve(session: EditorSessionContext): void {
        this.settingsBroadcaster.subscribe(session.editorId);
    }
}
