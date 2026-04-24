import { TextDocument, Uri, WebviewPanel } from "vscode";

import { DiffOrigin, DiffSide } from "@bpmn-modeler/shared";

export { DiffOrigin };

/**
 * A single webview pane inside a diff session.
 *
 * `ready` flips to `true` once the webview has imported its XML and emitted
 * `DiffReadyCommand`.  The session is armed — and the differ runs — when both
 * panes report ready.
 */
export interface DiffPaneEntry {
    readonly panel: WebviewPanel;
    readonly document: TextDocument;
    ready: boolean;
}

/**
 * A paired BPMN diff view — the domain object the rest of the service
 * revolves around.
 *
 * Promotes what used to be implicit pairing (mutual `partner` pointers on two
 * `DiffPaneEntry` records) into an explicit object that owns both URIs and
 * both pane slots.  A session can exist with zero, one, or two attached panes
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
 * This is the key change versus the previous scheme-based heuristic, which
 * could not discriminate two `file:` URIs.
 */
export class DiffSession {
    /** Wall-clock ms at construction — used by the TTL sweeper in the service. */
    readonly createdAt: number = Date.now();

    private beforePane?: DiffPaneEntry;

    private afterPane?: DiffPaneEntry;

    /**
     * Prefer the origin-specific factories ({@link forCompareFiles},
     * {@link forScm}) over calling this directly — they encapsulate each
     * origin's side-assignment rule.
     *
     * @param origin How this session came to be.  Surfaces in the diff-legend
     *   UI so compare-files panes can show origin-specific affordances (the
     *   filename label, the swap button) that don't apply to SCM diffs.
     * @param beforeUri URI rendered in the left pane.
     * @param afterUri URI rendered in the right pane.
     */
    constructor(
        readonly origin: DiffOrigin,
        readonly beforeUri: Uri,
        readonly afterUri: Uri,
    ) {}

    /**
     * Builds a `compare-files` session with the caller's left/right order
     * fixed as before/after.  Matches the visual order VS Code renders
     * `vscode.diff(a, b)` in — no inference is necessary because the
     * extension itself supplied both URIs.
     */
    static forCompareFiles(leftUri: Uri, rightUri: Uri): DiffSession {
        return new DiffSession("compare-files", leftUri, rightUri);
    }

    /**
     * Builds an `scm` session from the two panes VS Code handed us, applying
     * the SCM side-assignment rule:
     *
     *   - If one URI is `file:` it is the working tree → `after`.
     *   - Otherwise (ref-vs-ref, both `git:`) the first-resolved pane is
     *     `before`, second is `after` — arbitrary but matches the visual
     *     order VS Code's SCM diff chose.
     *
     * The panes are returned alongside the session so the caller can attach
     * them without re-deriving the pairing.
     */
    static forScm(
        first: DiffPaneEntry,
        second: DiffPaneEntry,
    ): { session: DiffSession; before: DiffPaneEntry; after: DiffPaneEntry } {
        const { before, after } = resolveScmSides(first, second);
        const session = new DiffSession(
            "scm",
            before.document.uri,
            after.document.uri,
        );
        return { session, before, after };
    }

    /**
     * Returns the canonical side for the given URI, or `undefined` when the
     * URI belongs to neither slot of this session.
     */
    sideFor(uri: Uri): DiffSide | undefined {
        const needle = uri.toString();
        if (needle === this.beforeUri.toString()) {
            return "before";
        }
        if (needle === this.afterUri.toString()) {
            return "after";
        }
        return undefined;
    }

    /** Returns `true` when a pane has already attached for `uri`'s side. */
    hasPaneFor(uri: Uri): boolean {
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
     * Attaches `entry` to the slot matching its document URI.
     *
     * @returns The assigned side, or `undefined` when the entry's URI does
     *   not belong to this session.  Callers should treat `undefined` as a
     *   programming error — only the owning {@link BpmnDiffService} should
     *   be attaching panes, and it should only do so after a successful
     *   session lookup.
     */
    attachPane(entry: DiffPaneEntry): DiffSide | undefined {
        const side = this.sideFor(entry.document.uri);
        if (side === "before") {
            this.beforePane = entry;
        } else if (side === "after") {
            this.afterPane = entry;
        }
        return side;
    }

    /** Drops `entry` from whichever slot held it (no-op if unknown). */
    detachPane(entry: DiffPaneEntry): void {
        if (this.beforePane === entry) {
            this.beforePane = undefined;
        }
        if (this.afterPane === entry) {
            this.afterPane = undefined;
        }
    }

    /** Returns the opposite pane, or `undefined` when unpaired. */
    partnerOf(entry: DiffPaneEntry): DiffPaneEntry | undefined {
        if (this.beforePane === entry) {
            return this.afterPane;
        }
        if (this.afterPane === entry) {
            return this.beforePane;
        }
        return undefined;
    }

    /** The before-side pane, or `undefined` when not yet attached. */
    before(): DiffPaneEntry | undefined {
        return this.beforePane;
    }

    /** The after-side pane, or `undefined` when not yet attached. */
    after(): DiffPaneEntry | undefined {
        return this.afterPane;
    }

    /** All currently-attached panes (0 to 2). */
    attachedPanes(): DiffPaneEntry[] {
        const panes: DiffPaneEntry[] = [];
        if (this.beforePane) {
            panes.push(this.beforePane);
        }
        if (this.afterPane) {
            panes.push(this.afterPane);
        }
        return panes;
    }

    /** Returns `true` when neither slot holds a pane. */
    isEmpty(): boolean {
        return this.beforePane === undefined && this.afterPane === undefined;
    }

    /** Returns `true` when both panes have attached and reported ready. */
    isArmed(): boolean {
        return (
            this.beforePane !== undefined &&
            this.afterPane !== undefined &&
            this.beforePane.ready &&
            this.afterPane.ready
        );
    }
}

/**
 * Resolves SCM-diff side assignment for two panes that share a path.
 *
 * Invariant: `file:` URIs represent the working tree and must be `after`.
 * For ref-vs-ref diffs (both `git:`) side follows resolution order, which
 * mirrors VS Code's own visual ordering choice.
 */
function resolveScmSides(
    first: DiffPaneEntry,
    second: DiffPaneEntry,
): { before: DiffPaneEntry; after: DiffPaneEntry } {
    if (second.document.uri.scheme === "file") {
        return { before: first, after: second };
    }
    if (first.document.uri.scheme === "file") {
        return { before: second, after: first };
    }
    return { before: first, after: second };
}
