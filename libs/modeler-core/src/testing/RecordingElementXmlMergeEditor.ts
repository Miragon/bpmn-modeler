import {
    ElementXmlMergeEditor,
    ElementXmlMergeFinished,
    ElementXmlMergeRequest,
} from "../diff/port/ElementXmlMergeEditor";

interface OpenMerge {
    readonly request: ElementXmlMergeRequest;
    result: string;
    saved?: string;
}

/**
 * A host's element XML merge editors in memory. A spec plays the user with
 * `save` and `closeByUser`; a close reports the merge finished to
 * `onFinished`, as a host does.
 */
export class RecordingElementXmlMergeEditor implements ElementXmlMergeEditor {
    private readonly openByKey = new Map<string, OpenMerge>();
    private focusedKey: string | undefined;
    private readonly opened: ElementXmlMergeRequest[] = [];

    constructor(private readonly onFinished: ElementXmlMergeFinished = () => undefined) {}

    async open(request: ElementXmlMergeRequest): Promise<void> {
        if (this.openByKey.has(request.key)) {
            throw new Error(`The element XML merge ${request.key} is already open.`);
        }
        this.openByKey.set(request.key, { request, result: request.start });
        this.opened.push(request);
        this.focusedKey = request.key;
    }

    async focus(key: string): Promise<void> {
        if (this.openByKey.has(key)) this.focusedKey = key;
    }

    async close(key: string): Promise<void> {
        if (this.end(key)) this.onFinished(key, undefined);
    }

    /** The user saves `text` into the result of the merge `key`. */
    save(key: string, text: string): void {
        const merge = this.openOf(key);
        merge.result = text;
        merge.saved = text;
    }

    /** The user closes the merge `key`, declining to save. */
    closeByUser(key: string): void {
        const merge = this.openOf(key);
        this.end(key);
        this.onFinished(key, merge.saved);
    }

    /** The user saves `text` and closes the merge `key`. */
    saveAndClose(key: string, text: string): void {
        this.save(key, text);
        this.closeByUser(key);
    }

    /** The open merge of `elementId`, if any. */
    openFor(elementId: string): ElementXmlMergeRequest | undefined {
        return [...this.openByKey.values()].find(({ request }) => request.elementId === elementId)
            ?.request;
    }

    /** Every open merge's result, by element. */
    shownResults(): Record<string, string> {
        return Object.fromEntries(
            [...this.openByKey.values()].map(({ request, result }) => [request.elementId, result]),
        );
    }

    /** Every merge ever opened, in order. */
    get openings(): readonly ElementXmlMergeRequest[] {
        return [...this.opened];
    }

    get focused(): ElementXmlMergeRequest | undefined {
        return this.focusedKey === undefined
            ? undefined
            : this.openByKey.get(this.focusedKey)?.request;
    }

    private openOf(key: string): OpenMerge {
        const merge = this.openByKey.get(key);
        if (!merge) throw new Error(`No element XML merge ${key} is open.`);
        return merge;
    }

    private end(key: string): boolean {
        if (this.focusedKey === key) this.focusedKey = undefined;
        return this.openByKey.delete(key);
    }
}
