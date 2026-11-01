import { Uri, window } from "vscode";

export interface NewFileTargetOptions {
    title: string;
    filterLabel: string;
    extension: string;
    defaultUri: Uri | undefined;
}

/**
 * Single native prompt for name + location; the OS dialog owns overwrite
 * confirmation. Appends the extension when the dialog did not (some Linux
 * dialogs don't enforce the filter), so the file opens where its extension says.
 */
export async function promptNewFileTarget(options: NewFileTargetOptions): Promise<Uri | undefined> {
    const { title, filterLabel, extension, defaultUri } = options;
    const uri = await window.showSaveDialog({
        title,
        defaultUri,
        filters: { [filterLabel]: [extension] },
    });
    if (!uri) {
        return undefined;
    }
    return uri.path.endsWith(`.${extension}`)
        ? uri
        : uri.with({ path: `${uri.path}.${extension}` });
}
