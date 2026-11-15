import { Range, Uri, workspace, WorkspaceEdit } from "vscode";

import { MergeWorkingFile, MergeWorkingFileText } from "@miragon/bpmn-modeler-core";

/**
 * The conflicted file through VS Code's text documents: a read sees an open
 * editor's unsaved edits, a replace goes through the document, so every
 * editor of the file follows, and saves it. Git is never asked to stage.
 */
export class VsCodeMergeWorkingFile implements MergeWorkingFile {
    async read(fileUri: string): Promise<MergeWorkingFileText> {
        const uri = Uri.parse(fileUri);
        const open = workspace.textDocuments.find(
            (document) => document.uri.toString() === uri.toString(),
        );
        if (open) return { text: open.getText(), isDirty: open.isDirty };
        return { text: new TextDecoder().decode(await workspace.fs.readFile(uri)), isDirty: false };
    }

    async replace(fileUri: string, text: string): Promise<void> {
        const document = await workspace.openTextDocument(Uri.parse(fileUri));
        const edit = new WorkspaceEdit();
        edit.replace(
            document.uri,
            new Range(document.positionAt(0), document.positionAt(document.getText().length)),
            text,
        );
        if (!(await workspace.applyEdit(edit))) {
            throw new Error(`VS Code refused the edit of ${fileUri}`);
        }
        if (!(await document.save())) {
            throw new Error(`VS Code did not save ${fileUri}`);
        }
    }
}
