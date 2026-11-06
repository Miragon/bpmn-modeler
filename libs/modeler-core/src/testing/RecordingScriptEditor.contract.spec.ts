import { RecordingScriptEditor } from "./RecordingScriptEditor";
import { describeScriptEditorContract } from "./scriptEditorContract";

describeScriptEditorContract("RecordingScriptEditor", async ({ store, scriptFiles, picker }) => {
    const scriptEditor = new RecordingScriptEditor(store, scriptFiles, picker);
    return {
        scriptEditor,
        openFileByUser: (filePath) => scriptEditor.openFileByUser(filePath),
        closeTab: async (filePath) => scriptEditor.closeTab(filePath),
    };
});
