export type { ElementXmlMergeRequest } from "../domain/elementXmlMerge";
import type { ElementXmlMergeRequest } from "../domain/elementXmlMerge";

/**
 * Where a host merges one element's XML by hand, line by line from base and
 * both sides. A merge finishes when the user closes it: the host reports the
 * key and the text the user last saved, or none, to the callback it was built
 * with (see {@link ElementXmlMergeFinished}).
 */
export interface ElementXmlMergeEditor {
    /** Opens the merge with `request.start` as its result, which is no save; rejects for a key that is open. */
    open(request: ElementXmlMergeRequest): Promise<void>;
    /** Brings the open merge `key` to the front; does nothing for a key that is not open. */
    focus(key: string): Promise<void>;
    /** Closes the merge `key` without asking, and reports it finished without a text. */
    close(key: string): Promise<void>;
}

/** Told the key of a finished merge and the text the user last saved, if any. */
export type ElementXmlMergeFinished = (key: string, written: string | undefined) => void;
