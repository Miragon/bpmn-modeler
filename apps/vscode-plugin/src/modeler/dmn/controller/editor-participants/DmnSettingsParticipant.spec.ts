import { describe, expect, it, vi } from "vitest";

import { DmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";
import { EditorSessionContext } from "../../../editor-session/EditorSessionParticipant";
import { DmnSettingsParticipant } from "./DmnSettingsParticipant";

const EDITOR_ID = "file:///decision.dmn";

const context: EditorSessionContext = {
    editorId: EDITOR_ID,
    panel: {} as never,
    isCurrent: () => true,
    onDocumentChange: vi.fn(),
    onSettingChange: vi.fn(),
    onDispose: vi.fn(),
    addDisposable: vi.fn(),
};

describe("DmnSettingsParticipant", () => {
    it("subscribes the broadcaster to the session", () => {
        const broadcaster = { subscribe: vi.fn() } as unknown as DmnSettingsBroadcaster;

        new DmnSettingsParticipant(broadcaster).onResolve(context);

        expect(broadcaster.subscribe).toHaveBeenCalledWith(EDITOR_ID);
    });
});
