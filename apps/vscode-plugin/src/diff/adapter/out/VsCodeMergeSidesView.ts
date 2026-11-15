import { commands, ExtensionContext, Uri, workspace } from "vscode";

export const MERGE_SIDE_SCHEME = "bpmn-merge";

export interface MergePaneUris {
    readonly current: Uri;
    readonly incoming: Uri;
}

/**
 * Serves the two sides of a conflicted file as read-only `bpmn-merge:` documents and opens them
 * in one diff. Each opening gets its own URIs, so a restored tab of an earlier opening finds no
 * text and the D1 guard can tell it apart.
 */
export class VsCodeMergeSidesView {
    private readonly textsByUri = new Map<string, string>();
    private openings = 0;

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.registerTextDocumentContentProvider(MERGE_SIDE_SCHEME, {
                provideTextDocumentContent: (uri) => this.textsByUri.get(uri.toString()) ?? "",
            }),
        );
    }

    serves(uri: Uri): boolean {
        return this.textsByUri.has(uri.toString());
    }

    serve(fileUri: Uri, sides: { current: string; incoming: string }): MergePaneUris {
        const opening = ++this.openings;
        // The path keeps the file name, so the `*.bpmn` selector of the custom editor matches.
        const uriOf = (side: string) =>
            Uri.from({
                scheme: MERGE_SIDE_SCHEME,
                path: fileUri.path,
                query: `side=${side}&n=${opening}`,
            });
        const uris = { current: uriOf("current"), incoming: uriOf("incoming") };
        this.textsByUri.set(uris.current.toString(), sides.current);
        this.textsByUri.set(uris.incoming.toString(), sides.incoming);
        return uris;
    }

    async open(uris: MergePaneUris, title: string): Promise<void> {
        await commands.executeCommand("vscode.diff", uris.current, uris.incoming, title, {
            preview: false,
        });
    }

    /** Drops the texts of a closed merge view, so a reopened tab of it shows the ended page. */
    releaseUris(uris: readonly string[]): void {
        for (const uri of uris) this.textsByUri.delete(uri);
    }
}
