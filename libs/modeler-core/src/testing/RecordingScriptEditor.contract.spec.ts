import { RecordingScriptEditor } from "./RecordingScriptEditor";
import { describeScriptEditorContract } from "./scriptEditorContract";

describeScriptEditorContract("RecordingScriptEditor", async ({ scriptFiles, picker }) => {
    const scriptEditor = new RecordingScriptEditor(scriptFiles, picker);
    return { scriptEditor, closeTab: async (filePath) => scriptEditor.closeTab(filePath) };
});
