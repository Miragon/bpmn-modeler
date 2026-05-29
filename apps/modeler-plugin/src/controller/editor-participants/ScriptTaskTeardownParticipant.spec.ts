import { describe, expect, it, vi } from "vitest";

import { ScriptTaskService } from "../ScriptTaskService";
import { EditorSessionContext } from "../editor-session/EditorSessionParticipant";
import { ScriptTaskTeardownParticipant } from "./ScriptTaskTeardownParticipant";

const EDITOR_ID = "file:///diagram.bpmn";

function createContext() {
    const captured: { dispose?: () => void } = {};
    const context: EditorSessionContext = {
        editorId: EDITOR_ID,
        panel: {} as never,
        onDocumentChange: vi.fn(),
        onSettingChange: vi.fn(),
        onDispose: (cb) => void (captured.dispose = cb),
        addDisposable: vi.fn(),
    };
    return { context, captured };
}

describe("ScriptTaskTeardownParticipant", () => {
    it("disposes the editor's script tasks only on teardown", () => {
        const scriptTaskSvc = { disposeForEditor: vi.fn() } as unknown as ScriptTaskService;
        const { context, captured } = createContext();

        new ScriptTaskTeardownParticipant(scriptTaskSvc).onResolve(context);
        // Nothing happens until the session closes — this is purely a teardown concern.
        expect(scriptTaskSvc.disposeForEditor).not.toHaveBeenCalled();

        captured.dispose?.();
        expect(scriptTaskSvc.disposeForEditor).toHaveBeenCalledWith(EDITOR_ID);
    });
});
