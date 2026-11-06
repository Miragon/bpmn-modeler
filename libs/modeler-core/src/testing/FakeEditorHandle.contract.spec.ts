import { ModelerSettingsSnapshot, settingKeyOf } from "../kernel/domain/modelerSettings";
import { describeEditorHandleContract } from "./editorHandleContract";
import { DocumentChangeStream, FakeEditorHandle } from "./FakeEditorHandle";

describeEditorHandleContract("FakeEditorHandle", ({ fileName, content }) => {
    // Both documents share one change stream, as VS Code's global change event does.
    const documentChanges = new DocumentChangeStream();
    const handle = new FakeEditorHandle(`/work/${fileName}`, { content, documentChanges });
    const otherHandle = new FakeEditorHandle("/work/other.bpmn", { content, documentChanges });
    return {
        handle,
        sendFromWebview: (message) => handle.receive(message),
        receivedByWebview: () => handle.posted,
        focus: () => handle.becomeActive(),
        blur: () => handle.loseFocus(),
        editElsewhere: (edited) => handle.changeDocument(edited),
        editAnotherDocument: (edited) => otherHandle.changeDocument(edited),
        changeSettings: (values) =>
            handle.changeSetting(
                ...Object.keys(values).map((key) =>
                    settingKeyOf(key as keyof ModelerSettingsSnapshot),
                ),
            ),
        refuseWrites: () => {
            handle.refusesWrites = true;
        },
        refuseSaves: () => {
            handle.refusesSaves = true;
        },
        close: () => handle.dispose(),
        hideWebview: () => {
            handle.hidden = true;
        },
    };
});
