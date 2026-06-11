import { describe, expect, it, vi } from "vitest";

import { ScriptVariableStore } from "@miragon/bpmn-modeler-core";
import { ScriptTaskService } from "../../../../scriptTask/index";
import { EditorSessionContext } from "../../../editor-session/EditorSessionParticipant";
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
    it("disposes the editor's script tasks and clears its variables only on teardown", () => {
        const scriptTaskSvc = { disposeForEditor: vi.fn() } as unknown as ScriptTaskService;
        const variableStore = { clear: vi.fn() } as unknown as ScriptVariableStore;
        const { context, captured } = createContext();

        new ScriptTaskTeardownParticipant(scriptTaskSvc, variableStore).onResolve(context);
        // Nothing happens until the session closes — this is purely a teardown concern.
        expect(scriptTaskSvc.disposeForEditor).not.toHaveBeenCalled();
        expect(variableStore.clear).not.toHaveBeenCalled();

        captured.dispose?.();
        expect(scriptTaskSvc.disposeForEditor).toHaveBeenCalledWith(EDITOR_ID);
        expect(variableStore.clear).toHaveBeenCalledWith(EDITOR_ID);
    });
});
