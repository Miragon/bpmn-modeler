import type { MergeSide } from "@miragon/bpmn-modeler-types";

import {
    MergePaneName,
    MergePaneUris,
    MergeSideDocument,
    MergeSidesView,
} from "../diff/port/MergeSidesView";

// One count for every view, as a new host run never repeats an earlier run's random id.
let openings = 0;

/** A host's merge panes in memory: records what was served, opened and released. */
export class RecordingMergeSidesView implements MergeSidesView {
    /** Every `serve` call: the working file, the basenames it named and the URIs it returned; both sides each time. */
    readonly served: {
        fileUri: string;
        basenames: Readonly<Record<MergeSide, string>> & { readonly result?: string };
        uris: MergePaneUris & { readonly result?: string };
    }[] = [];
    /** Every `open` call, in order. */
    readonly opened: { left: string; right: string; title: string }[] = [];
    readonly released: Readonly<Partial<Record<MergePaneName, string>>>[] = [];

    private readonly texts = new Map<string, string>();

    serve<Name extends MergePaneName>(
        fileUri: string,
        documents: Readonly<Record<Name, MergeSideDocument>>,
    ): Readonly<Record<Name, string>> {
        openings += 1;
        const folder = fileUri.slice(0, fileUri.lastIndexOf("/"));
        const names = Object.keys(documents) as Name[];
        const uris = {} as Record<Name, string>;
        const basenames: Record<string, string> = {};
        for (const name of names) {
            const { text, basename } = documents[name];
            uris[name] =
                `bpmn-merge:${new URL(folder).pathname}/${encodeURIComponent(basename)}?side=${name}&opening=${openings}`;
            basenames[name] = basename;
            this.texts.set(uris[name], text);
        }
        this.served.push({
            fileUri,
            basenames: basenames as Record<MergeSide, string>,
            uris: uris as Partial<Record<MergePaneName, string>> as MergePaneUris,
        });
        return uris;
    }

    async open(left: string, right: string, title: string): Promise<void> {
        this.opened.push({ left, right, title });
    }

    release(uris: Readonly<Partial<Record<MergePaneName, string>>>): void {
        for (const uri of Object.values(uris)) this.texts.delete(uri);
        this.released.push(uris);
    }

    textOf(uri: string): string | undefined {
        return this.texts.get(uri);
    }
}
