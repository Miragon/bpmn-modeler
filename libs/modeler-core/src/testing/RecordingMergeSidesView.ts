import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { MergePaneUris, MergeSideDocument, MergeSidesView } from "../diff/port/MergeSidesView";

// One count for every view, as a new host run never repeats an earlier run's random id.
let openings = 0;

/** A host's merge panes in memory: records what was served, opened and released. */
export class RecordingMergeSidesView implements MergeSidesView {
    /** Every `serve` call: the working file and the basenames it named. */
    readonly served: { fileUri: string; basenames: Record<MergeSide, string> }[] = [];
    /** Every `open` call, in order. */
    readonly opened: { uris: MergePaneUris; title: string }[] = [];
    readonly released: MergePaneUris[] = [];

    private readonly texts = new Map<string, string>();

    serve(fileUri: string, sides: Readonly<Record<MergeSide, MergeSideDocument>>): MergePaneUris {
        openings += 1;
        const folder = fileUri.slice(0, fileUri.lastIndexOf("/"));
        const uriOf = (side: MergeSide) =>
            `bpmn-merge:${new URL(folder).pathname}/${encodeURIComponent(sides[side].basename)}?side=${side}&opening=${openings}`;
        const uris = { current: uriOf("current"), incoming: uriOf("incoming") };
        this.texts.set(uris.current, sides.current.text);
        this.texts.set(uris.incoming, sides.incoming.text);
        this.served.push({
            fileUri,
            basenames: { current: sides.current.basename, incoming: sides.incoming.basename },
        });
        return uris;
    }

    async open(uris: MergePaneUris, title: string): Promise<void> {
        this.opened.push({ uris, title });
    }

    release(uris: MergePaneUris): void {
        this.texts.delete(uris.current);
        this.texts.delete(uris.incoming);
        this.released.push(uris);
    }

    textOf(uri: string): string | undefined {
        return this.texts.get(uri);
    }
}
