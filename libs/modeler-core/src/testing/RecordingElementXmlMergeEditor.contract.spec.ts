import { describeElementXmlMergeEditorContract } from "./elementXmlMergeEditorContract";
import { RecordingElementXmlMergeEditor } from "./RecordingElementXmlMergeEditor";

describeElementXmlMergeEditorContract("RecordingElementXmlMergeEditor", (onFinished) => {
    const editor = new RecordingElementXmlMergeEditor(onFinished);
    const keyOf = (elementId: string) => {
        const request = editor.openFor(elementId);
        if (!request) throw new Error(`No merge of ${elementId} is open.`);
        return request.key;
    };
    return {
        editor,
        shown: () => editor.shownResults(),
        focused: () => editor.focused?.elementId,
        save: (elementId, text) => editor.save(keyOf(elementId), text),
        closeByUser: (elementId) => editor.closeByUser(keyOf(elementId)),
    };
});
