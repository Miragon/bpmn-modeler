export type ElementXmlRequestOutcome = "show" | "refresh" | "superseded";

/**
 * The element XML requests of one diagram diff. Only the latest request may
 * render, so a slow element cannot overwrite the one selected after it, and a
 * request to show that a selection overtook leaves the show to that selection.
 * A selection does nothing until a show is pending or has settled, and again
 * once the user closed the XML diff.
 */
export class ElementXmlRequests {
    private latestRequest = 0;
    private latestElementId = "";
    private showPending = false;
    private showSettled = false;
    private closed = false;

    /**
     * Starts a request and returns its number, or `undefined` when there is
     * nothing to do: no element, a selection before any show, or a selection
     * of the element requested last.
     */
    begin(elementId: string, opens: boolean): number | undefined {
        if (elementId === "") return undefined;
        if (!opens && (!this.follows() || elementId === this.latestElementId)) return undefined;
        this.latestElementId = elementId;
        this.showPending ||= opens;
        this.latestRequest += 1;
        return this.latestRequest;
    }

    /** What to do with the texts of `request` once they arrive. */
    settle(request: number): ElementXmlRequestOutcome {
        if (this.closed || request !== this.latestRequest) return "superseded";
        if (!this.showPending) return "refresh";
        this.showPending = false;
        this.showSettled = true;
        return "show";
    }

    /** The diagram diff closed, so no request renders any more. */
    close(): void {
        this.closed = true;
    }

    /** The user closed the XML diff: selections compute nothing until the next show. */
    closedByUser(): void {
        this.showSettled = false;
        if (!this.showPending) this.latestRequest += 1;
    }

    /** Gives up on a request whose texts could not be computed, so selecting its element again retries. */
    abandon(request: number): void {
        if (request !== this.latestRequest) return;
        this.showPending = false;
        this.latestElementId = "";
    }

    private follows(): boolean {
        return this.showPending || this.showSettled;
    }
}
