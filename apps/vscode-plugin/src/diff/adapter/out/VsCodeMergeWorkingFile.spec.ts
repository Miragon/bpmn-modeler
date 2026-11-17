import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeTextDocumentsFake"));

import {
    documentText,
    failNextSave,
    resetTextDocuments,
    textOnDisk,
    typeUnsaved,
    writeOnDisk,
} from "../../../__fixtures__/vscodeTextDocumentsFake";
import { VsCodeMergeWorkingFile } from "./VsCodeMergeWorkingFile";

const FILE = "file:///repo/order.bpmn";
const MARKED = "<<<<<<< HEAD\n<current/>\n=======\n<incoming/>\n>>>>>>> feature\n";

beforeEach(() => resetTextDocuments());

describe("VsCodeMergeWorkingFile", () => {
    it("puts the text back and throws when the save after the replace fails", async () => {
        writeOnDisk(FILE, MARKED);
        failNextSave(FILE);

        await expect(new VsCodeMergeWorkingFile().replace(FILE, "<definitions/>\n")).rejects.toThrow(
            `VS Code did not save ${FILE}`,
        );

        expect(documentText(FILE)).toBe(MARKED);
        expect(textOnDisk(FILE)).toBe(MARKED);
    });

    it("puts the user's unsaved edits back when the save fails", async () => {
        writeOnDisk(FILE, MARKED);
        typeUnsaved(FILE, "<edited/>\n");
        failNextSave(FILE);

        await expect(new VsCodeMergeWorkingFile().replace(FILE, "<definitions/>\n")).rejects.toThrow();

        expect(documentText(FILE)).toBe("<edited/>\n");
    });
});
