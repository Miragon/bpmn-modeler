import { FakeMergeWorkingFile } from "./FakeMergeWorkingFile";
import { describeMergeWorkingFileContract } from "./mergeWorkingFileContract";

let files = 0;

describeMergeWorkingFileContract("FakeMergeWorkingFile", () => {
    const workingFile = new FakeMergeWorkingFile();
    return {
        workingFile,
        onDisk: async (text) => {
            files += 1;
            const fileUri = `file:///repo/order-${files}.bpmn`;
            workingFile.onDisk(fileUri, text);
            return fileUri;
        },
        editUnsaved: async (fileUri, text) => workingFile.editUnsaved(fileUri, text),
        diskText: async (fileUri) => workingFile.diskText(fileUri) ?? "",
    };
});
