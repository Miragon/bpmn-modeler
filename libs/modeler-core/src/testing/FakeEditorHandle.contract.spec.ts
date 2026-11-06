import { ModelerSettingsSnapshot, settingKeyOf } from "../kernel/domain/modelerSettings";
import { describeEditorHandleContract } from "./editorHandleContract";
import { FakeEditorHandle } from "./FakeEditorHandle";

describeEditorHandleContract("FakeEditorHandle", ({ fileName, content }) => {
    const handle = new FakeEditorHandle(`/work/${fileName}`, { content });
    return {
        handle,
        sendFromWebview: (message) => handle.receive(message),
        receivedByWebview: () => handle.posted,
        focus: () => handle.becomeActive(),
        blur: () => handle.loseFocus(),
        editElsewhere: (edited) => handle.changeDocument(edited),
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
