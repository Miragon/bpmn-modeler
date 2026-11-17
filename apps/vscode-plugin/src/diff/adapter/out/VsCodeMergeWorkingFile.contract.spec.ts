import { beforeEach, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeTextDocumentsFake"));

import { describeMergeWorkingFileContract } from "@miragon/bpmn-modeler-core/testing";

import {
    resetTextDocuments,
    textOnDisk,
    typeUnsaved,
    writeOnDisk,
} from "../../../__fixtures__/vscodeTextDocumentsFake";
import { VsCodeMergeWorkingFile } from "./VsCodeMergeWorkingFile";

beforeEach(() => resetTextDocuments());

let files = 0;

describeMergeWorkingFileContract("VsCodeMergeWorkingFile", () => ({
    workingFile: new VsCodeMergeWorkingFile(),
    onDisk: async (text) => {
        files += 1;
        const fileUri = `file:///repo/order-${files}.bpmn`;
        writeOnDisk(fileUri, text);
        return fileUri;
    },
    editUnsaved: async (fileUri, text) => typeUnsaved(fileUri, text),
    diskText: async (fileUri) => textOnDisk(fileUri) ?? "",
}));
