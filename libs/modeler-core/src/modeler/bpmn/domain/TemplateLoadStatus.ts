/** What the element-templates status item shows. */
export type TemplateLoadDisplay =
    | { readonly state: "hidden" }
    | { readonly state: "loading" }
    | { readonly state: "ready"; readonly count: number };

type EndedLoadDisplay = Exclude<TemplateLoadDisplay, { state: "loading" }>;

/**
 * The element-template loads of every editor of a host, which share one status
 * item. It shows the spinner while any load runs; once none does, it shows how
 * the load that ended last ended. Every event returns a new status.
 */
export class TemplateLoadStatus {
    static readonly idle = new TemplateLoadStatus(new Set(), { state: "hidden" });

    private constructor(
        private readonly running: ReadonlySet<symbol>,
        private readonly lastEnded: EndedLoadDisplay,
    ) {}

    get display(): TemplateLoadDisplay {
        return this.running.size > 0 ? { state: "loading" } : this.lastEnded;
    }

    started(token: symbol): TemplateLoadStatus {
        return new TemplateLoadStatus(new Set([...this.running, token]), this.lastEnded);
    }

    finished(token: symbol, count: number): TemplateLoadStatus {
        return this.ended(token, { state: "ready", count });
    }

    /** A failed or superseded load, also one that never started: it leaves no count behind. */
    abandoned(token: symbol): TemplateLoadStatus {
        return this.ended(token, { state: "hidden" });
    }

    private ended(token: symbol, display: EndedLoadDisplay): TemplateLoadStatus {
        const running = new Set(this.running);
        running.delete(token);
        return new TemplateLoadStatus(running, display);
    }
}
