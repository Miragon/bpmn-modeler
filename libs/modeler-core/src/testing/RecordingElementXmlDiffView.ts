import { ElementXmlDiff, ElementXmlDiffView } from "../diff/port/ElementXmlDiffView";

/**
 * A host's element XML diffs in memory: holds the one each diagram diff shows
 * and how often one was opened. A spec plays the user with `closeByUser`,
 * which the view reports to `onClosedByUser` as a host does.
 */
export class RecordingElementXmlDiffView implements ElementXmlDiffView {
    private readonly openDiffs = new Map<string, ElementXmlDiff>();
    private openings = 0;

    constructor(private readonly onClosedByUser: (diffKey: string) => void = () => undefined) {}

    async show(diff: ElementXmlDiff): Promise<void> {
        if (!this.openDiffs.has(diff.diffKey)) this.openings += 1;
        this.openDiffs.set(diff.diffKey, diff);
    }

    async refresh(diff: ElementXmlDiff): Promise<void> {
        if (this.openDiffs.has(diff.diffKey)) this.openDiffs.set(diff.diffKey, diff);
    }

    async close(diffKey: string): Promise<void> {
        this.openDiffs.delete(diffKey);
    }

    /** What the XML diff of the diagram diff `diffKey` shows, or `undefined` when none is open. */
    shown(diffKey: string): ElementXmlDiff | undefined {
        return this.openDiffs.get(diffKey);
    }

    /** Every XML diff that is open. */
    allShown(): ElementXmlDiff[] {
        return [...this.openDiffs.values()];
    }

    /** How many XML diffs were opened, replacements not counted. */
    get openedCount(): number {
        return this.openings;
    }

    closeByUser(diffKey: string): void {
        if (this.openDiffs.delete(diffKey)) this.onClosedByUser(diffKey);
    }
}
