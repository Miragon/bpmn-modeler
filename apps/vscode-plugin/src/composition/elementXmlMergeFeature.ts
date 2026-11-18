import { ExtensionContext, workspace } from "vscode";

import {
    ElementXmlMergeRequest,
    MERGE_RESULT_SCHEME,
    MERGE_XML_SCHEME,
    VsCodeElementXmlMergeEditor,
} from "../diff/adapter/out/VsCodeElementXmlMergeEditor";
import { InMemoryFileSystemProvider } from "../shared/adapter/in/InMemoryFileSystemProvider";

export interface ElementXmlMergeProbe {
    /** Opens the merge editor; `finished` resolves with the last text it wrote once its tab closed. */
    open(request: ElementXmlMergeRequest): {
        opened: Promise<void>;
        finished: Promise<string | undefined>;
    };
    close(key: string): Promise<void>;
}

/**
 * The element XML merge editor's files and tabs. No service drives it yet:
 * the e2e opens it through the test API to pin how VS Code's merge editor
 * behaves on the oldest and newest supported version.
 */
export function register(context: ExtensionContext): ElementXmlMergeProbe {
    const inputs = new InMemoryFileSystemProvider({ readOnly: true });
    const results = new InMemoryFileSystemProvider({ editorMayCreateFiles: false });
    const finishes = new Map<
        string,
        { finished: Promise<string | undefined>; finish: (written: string | undefined) => void }
    >();
    const editor = new VsCodeElementXmlMergeEditor(inputs, results, (key, written) => {
        finishes.get(key)?.finish(written);
        finishes.delete(key);
    });
    editor.register(context);
    context.subscriptions.push(
        inputs,
        results,
        workspace.registerFileSystemProvider(MERGE_XML_SCHEME, inputs, {
            isCaseSensitive: true,
            isReadonly: true,
        }),
        workspace.registerFileSystemProvider(MERGE_RESULT_SCHEME, results, {
            isCaseSensitive: true,
        }),
    );
    return {
        open(request) {
            // A second open of one key is refused, and its `finished` is the open merge's.
            const open = finishes.get(request.key);
            if (open) return { opened: editor.open(request), finished: open.finished };
            let finish: (written: string | undefined) => void = () => undefined;
            const finished = new Promise<string | undefined>((done) => (finish = done));
            finishes.set(request.key, { finished, finish });
            return { opened: editor.open(request), finished };
        },
        close: (key) => editor.close(key),
    };
}
