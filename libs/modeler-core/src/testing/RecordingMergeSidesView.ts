import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { MergePaneUris, MergeSideDocument, MergeSidesView } from "../diff/port/MergeSidesView";

// One count for every view, as a new host run never repeats an earlier run's random id.
let openings = 0;

/** A host's merge panes in memory: records what was served, opened and released. */
export class RecordingMergeSidesView implements MergeSidesView {
    /** Every `serve` call: the working file, the basenames it named and the URIs it returned. */
    readonly served: {
        fileUri: string;
        basenames: Record<MergeSide, string>;
        uris: MergePaneUris;
    }[] = [];
    /** Every `open` call, in order. */
    readonly opened: { left: string; right: string; title: string }[] = [];
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
            uris,
        });
        return uris;
    }

    async open(left: string, right: string, title: string): Promise<void> {
        this.opened.push({ left, right, title });
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
