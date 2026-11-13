import { RecordingScriptEditor } from "./RecordingScriptEditor";
import { describeScriptEditorContract } from "./scriptEditorContract";

describeScriptEditorContract("RecordingScriptEditor", async ({ scriptFiles }) => {
    const scriptEditor = new RecordingScriptEditor(scriptFiles);
    return {
        scriptEditor,
        openFileByUser: (filePath) => scriptEditor.openFileByUser(filePath),
        closeTabByUser: (filePath) => scriptEditor.closeTabByUser(filePath),
    };
});
