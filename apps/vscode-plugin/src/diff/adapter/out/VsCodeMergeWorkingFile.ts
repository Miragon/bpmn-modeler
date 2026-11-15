import { Range, Uri, workspace, WorkspaceEdit } from "vscode";

/**
 * SPIKE stand-in for #2456's `MergeWorkingFile` port: replaces the whole text of the working
 * file through the open document, so editors that hold it follow, and saves. Never stages.
 */
export class VsCodeMergeWorkingFile {
    async replace(fileUri: Uri, text: string): Promise<void> {
        const document = await workspace.openTextDocument(fileUri);
        const edit = new WorkspaceEdit();
        edit.replace(
            fileUri,
            new Range(document.positionAt(0), document.positionAt(document.getText().length)),
            text,
        );
        if (!(await workspace.applyEdit(edit))) {
            throw new Error(`VS Code refused to edit ${fileUri.toString()}`);
        }
        if (!(await document.save())) {
            throw new Error(`VS Code did not save ${fileUri.toString()}`);
        }
    }
}
