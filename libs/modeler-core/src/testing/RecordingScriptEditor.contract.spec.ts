import { RecordingScriptEditor } from "./RecordingScriptEditor";
import { describeScriptEditorContract } from "./scriptEditorContract";

describeScriptEditorContract("RecordingScriptEditor", async () => ({
    scriptEditor: new RecordingScriptEditor(),
    closeTab: async () => undefined,
}));
