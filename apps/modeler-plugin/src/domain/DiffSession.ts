import { DiffOrigin, DiffSide } from "@miragon/bpmn-modeler-shared";

export { DiffOrigin };

/**
 * Domain handle for a single diff pane.
 *
 * Wraps whatever the host gave us (in production: a `WebviewPanel` +
 * `TextDocument` pair — see `WebviewPaneHandle`). The session sees only this
 * handle, which lets `DiffSession` stay free of `vscode` imports and lets
 * tests substitute a plain object.
 *
 * `uri` is the canonical identity used by the session's lookups — it must
 * be the stringified URI of the underlying document (i.e.
 * `document.uri.toString()`).
 */
export interface DiffPaneHandle {
    readonly uri: string;
    /**
     * `true` once the webview has imported its XML and emitted
     * `DiffReadyCommand`. The session is armed — and the differ runs —
     * when both panes report ready.
     */
    isReady(): boolean;
    setReady(): void;
    getText(): string;
    postMessage(msg: unknown): Promise<boolean>;
    dispose(): void;
}

/**
 * Extracts the human-visible basename from a stringified URI.
 *
 * Trims query/fragment so e.g. `file:///foo.bpmn?ref=HEAD` still resolves to
 * `foo.bpmn`. `Uri.toString()` keeps `?` / `#` for any host that uses them;
 * the bare path is what users see in the tab and in the diff legend label.
 */
export function basenameOfUriString(uri: string): string {
    const noFragment = uri.split("#")[0];
    const noQuery = noFragment.split("?")[0];
    const parts = noQuery.split("/");
    return decodeURIComponent(parts[parts.length - 1] ?? "");
}

/**
 * A paired BPMN diff view — the domain object the diff service revolves
 * around.
 *
 * Promotes what used to be implicit pairing (mutual `partner` pointers on
 * two pane records) into an explicit object that owns both URIs and both
 * pane slots. A session can exist with zero, one, or two attached panes
 * — this matters because:
 *
 * - `compare-files` sessions are created up front with both URIs known but
 *   no panes attached yet; the panes attach as VS Code resolves the two
 *   sides of the diff tab.
 * - A fully-attached session becomes half-attached again when the user
 *   closes one pane (e.g. drags a tab out), and empty when both are gone.
 *
 * Side assignment is fixed at construction time — `before` and `after` are
 * inherent to the session, not inferred from the pane that attaches first.
 */
export class DiffSession {
    // Wall-clock ms at construction — used by the TTL sweeper in the store.
    readonly createdAt: number = Date.now();

    private beforePane?: DiffPaneHandle;

    private afterPane?: DiffPaneHandle;

    /**
     * Prefer the origin-specific factories ({@link forCompareFiles},
     * {@link forScm}) over calling this directly — they encapsulate each
     * origin's side-assignment rule.
     *
     * @param origin How this session came to be. Surfaces in the diff-legend
     *   UI so compare-files panes can show origin-specific affordances (the
     *   filename label, the swap button) that don't apply to SCM diffs.
     * @param beforeUri Stringified URI rendered in the left pane.
     * @param afterUri Stringified URI rendered in the right pane.
     */
    constructor(
        readonly origin: DiffOrigin,
        readonly beforeUri: string,
        readonly afterUri: string,
    ) {}

    /**
     * Builds a `compare-files` session with the caller's left/right order
     * fixed as before/after. Matches the visual order VS Code renders
     * `vscode.diff(a, b)` in — no inference is necessary because the
     * extension itself supplied both URIs.
     */
    static forCompareFiles(leftUri: string, rightUri: string): DiffSession {
        return new DiffSession("compare-files", leftUri, rightUri);
    }

    /**
     * Builds an `scm` session from the two panes the caller has already
     * sorted into before/after roles. The SCM side-assignment rule (working
     * tree `file:` → `after`; ref-vs-ref → resolution order) lives in the
     * caller because it needs the URI scheme, which a string-typed handle
     * exposes only by parsing — cleaner to do it once where vscode `Uri` is
     * still in scope.
     */
    static forScm(before: DiffPaneHandle, after: DiffPaneHandle): DiffSession {
        return new DiffSession("scm", before.uri, after.uri);
    }

    /**
     * Returns the canonical side for the given URI, or `undefined` when the
     * URI belongs to neither slot of this session.
     */
    sideFor(uri: string): DiffSide | undefined {
        if (uri === this.beforeUri) {
            return "before";
        }
        if (uri === this.afterUri) {
            return "after";
        }
        return undefined;
    }

    /**
     * Returns `true` when a pane has already attached for `uri`'s side.
     */
    hasPaneFor(uri: string): boolean {
        const side = this.sideFor(uri);
        if (side === "before") {
            return this.beforePane !== undefined;
        }
        if (side === "after") {
            return this.afterPane !== undefined;
        }
        return false;
    }

    /**
     * Attaches `handle` to the slot matching its URI.
     *
     * @returns The assigned side, or `undefined` when the handle's URI does
     *   not belong to this session. Callers should treat `undefined` as a
     *   programming error — only the owning diff machinery should be
     *   attaching panes, and it should only do so after a successful
     *   session lookup.
     */
    attachPane(handle: DiffPaneHandle): DiffSide | undefined {
        const side = this.sideFor(handle.uri);
        if (side === "before") {
            this.beforePane = handle;
        } else if (side === "after") {
            this.afterPane = handle;
        }
        return side;
    }

    /**
     * Drops `handle` from whichever slot held it (no-op if unknown).
     */
    detachPane(handle: DiffPaneHandle): void {
        if (this.beforePane === handle) {
            this.beforePane = undefined;
        }
        if (this.afterPane === handle) {
            this.afterPane = undefined;
        }
    }

    /**
     * Returns the opposite pane, or `undefined` when unpaired.
     */
    partnerOf(handle: DiffPaneHandle): DiffPaneHandle | undefined {
        if (this.beforePane === handle) {
            return this.afterPane;
        }
        if (this.afterPane === handle) {
            return this.beforePane;
        }
        return undefined;
    }

    /**
     * The before-side pane, or `undefined` when not yet attached.
     */
    before(): DiffPaneHandle | undefined {
        return this.beforePane;
    }

    /**
     * The after-side pane, or `undefined` when not yet attached.
     */
    after(): DiffPaneHandle | undefined {
        return this.afterPane;
    }

    /**
     * All currently-attached panes (0 to 2).
     */
    attachedPanes(): DiffPaneHandle[] {
        const panes: DiffPaneHandle[] = [];
        if (this.beforePane) {
            panes.push(this.beforePane);
        }
        if (this.afterPane) {
            panes.push(this.afterPane);
        }
        return panes;
    }

    /**
     * Returns `true` when neither slot holds a pane.
     */
    isEmpty(): boolean {
        return this.beforePane === undefined && this.afterPane === undefined;
    }

    /**
     * Returns `true` when both panes have attached and reported ready.
     */
    isArmed(): boolean {
        return (
            this.beforePane !== undefined &&
            this.afterPane !== undefined &&
            this.beforePane.isReady() &&
            this.afterPane.isReady()
        );
    }
}
