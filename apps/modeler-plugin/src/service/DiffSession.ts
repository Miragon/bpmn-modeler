import { TextDocument, Uri, WebviewPanel } from "vscode";

import { DiffSide } from "@bpmn-modeler/shared";

/**
 * Where a {@link DiffSession} came from.
 *
 * - `"scm"`: VS Code opened the diff (Source Control panel, `git diff`, PR
 *   review). Session is created lazily when the second pane resolves; URIs
 *   are paired by path equality.
 * - `"compare-files"`: the extension itself opened the diff via the
 *   `bpmn-modeler.compareWithSelected` command. Session is pre-registered
 *   before `vscode.diff` is invoked, so pane resolution is a simple lookup.
 */
export type DiffOrigin = "scm" | "compare-files";

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
     * @param origin How this session came to be — affects nothing in the diff
     *   logic itself but is useful for logging and future per-origin UX.
     * @param beforeUri URI rendered in the left pane.
     * @param afterUri URI rendered in the right pane.
     */
    constructor(
        readonly origin: DiffOrigin,
        readonly beforeUri: Uri,
        readonly afterUri: Uri,
    ) {}

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
