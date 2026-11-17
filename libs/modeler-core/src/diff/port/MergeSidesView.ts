import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergePaneName } from "../domain/mergePaneName";

export type { MergePaneName } from "../domain/mergePaneName";

/** The URI each side of one merge view is served under. */
export type MergePaneUris = Readonly<Record<MergeSide, string>>;

/** One side the host serves: its text and the basename its document carries. */
export interface MergeSideDocument {
    readonly text: string;
    readonly basename: string;
}

/** Where a host shows a conflicted file's two sides, or a side and the built result, side by side, read-only. */
export interface MergeSidesView {
    /**
     * Serves each document beside `fileUri` under a URI no earlier opening, in
     * this or an earlier run of the host, used.
     */
    serve<Name extends MergePaneName>(
        fileUri: string,
        documents: Readonly<Record<Name, MergeSideDocument>>,
    ): Readonly<Record<Name, string>>;
    /** Opens one diff of `leftUri` and `rightUri`; opening the same URIs again focuses their tab. */
    open(leftUri: string, rightUri: string, title: string): Promise<void>;
    /** Stops serving the documents, so a tab of them restored later finds no text. */
    release(uris: Readonly<Partial<Record<MergePaneName, string>>>): void;
}
