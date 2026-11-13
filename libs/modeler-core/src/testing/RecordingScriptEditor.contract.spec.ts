import { RecordingScriptEditor } from "./RecordingScriptEditor";
import { describeScriptEditorContract } from "./scriptEditorContract";

describeScriptEditorContract("RecordingScriptEditor", async ({ store, scriptFiles, targets }) => {
    const scriptEditor = new RecordingScriptEditor(store, scriptFiles, targets);
    return {
        scriptEditor,
        openFileByUser: (filePath) => scriptEditor.openFileByUser(filePath),
        closeTab: async (filePath) => scriptEditor.closeTab(filePath),
    };
});
