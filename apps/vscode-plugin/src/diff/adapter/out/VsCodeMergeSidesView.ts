import { randomUUID } from "node:crypto";
import { posix } from "node:path";

import { commands, ExtensionContext, Uri, workspace } from "vscode";

import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { MergePaneUris, MergeSideDocument, MergeSidesView } from "@miragon/bpmn-modeler-core";
import { MERGE_SIDE_SCHEME } from "../../domain/documentRevision";

/**
 * Serves a conflicted file's two sides as read-only `bpmn-merge:` documents
 * beside the working file and opens them in one diff, which the BPMN custom
 * editor resolves. Each opening gets a random id in its query: a tab restored
 * after a reload keeps its URIs while the extension host starts afresh, so a
 * counter or a time stamp would let a new opening hit the restored tab.
 */
export class VsCodeMergeSidesView implements MergeSidesView {
    private readonly texts = new Map<string, string>();
    private readonly uris = new Map<string, Uri>();

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.registerTextDocumentContentProvider(MERGE_SIDE_SCHEME, {
                // An unserved side still opens, empty, so its pane can show that its view ended.
                provideTextDocumentContent: (uri) => this.texts.get(uri.toString()) ?? "",
            }),
        );
    }

    serve(fileUri: string, sides: Readonly<Record<MergeSide, MergeSideDocument>>): MergePaneUris {
        const opening = randomUUID();
        const folder = posix.dirname(Uri.parse(fileUri).path);
        const serveSide = (side: MergeSide): string => {
            const uri = Uri.from({
                scheme: MERGE_SIDE_SCHEME,
                path: posix.join(folder, sides[side].basename),
                query: `side=${side}&opening=${opening}`,
            });
            const key = uri.toString();
            this.uris.set(key, uri);
            this.texts.set(key, sides[side].text);
            return key;
        };
        return { current: serveSide("current"), incoming: serveSide("incoming") };
    }

    async open(uris: MergePaneUris, title: string): Promise<void> {
        await commands.executeCommand(
            "vscode.diff",
            this.uriOf(uris.current),
            this.uriOf(uris.incoming),
            title,
            { preview: false },
        );
    }

    release(uris: MergePaneUris): void {
        for (const key of [uris.current, uris.incoming]) {
            this.texts.delete(key);
            this.uris.delete(key);
        }
    }

    private uriOf(key: string): Uri {
        return this.uris.get(key) ?? Uri.parse(key);
    }
}
