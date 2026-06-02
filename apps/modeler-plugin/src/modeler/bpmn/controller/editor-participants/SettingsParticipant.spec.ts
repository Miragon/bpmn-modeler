import { describe, expect, it, vi } from "vitest";

import { BpmnSettingsBroadcaster } from "../../service/BpmnSettingsBroadcaster";
import { EditorSessionContext } from "../../../editor-session/EditorSessionParticipant";
import { SettingsParticipant } from "./SettingsParticipant";

const EDITOR_ID = "file:///diagram.bpmn";

const context: EditorSessionContext = {
    editorId: EDITOR_ID,
    panel: {} as never,
    onDocumentChange: vi.fn(),
    onSettingChange: vi.fn(),
    onDispose: vi.fn(),
    addDisposable: vi.fn(),
};

describe("SettingsParticipant", () => {
    it("subscribes the broadcaster to the session", () => {
        const broadcaster = { subscribe: vi.fn() } as unknown as BpmnSettingsBroadcaster;

        new SettingsParticipant(broadcaster).onResolve(context);

        expect(broadcaster.subscribe).toHaveBeenCalledWith(EDITOR_ID);
    });
});
