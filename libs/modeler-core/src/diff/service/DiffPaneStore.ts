import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { DiffSession } from "./DiffSession";

/**
 * Milliseconds a pre-registered `compare-files` session stays alive with no
 * panes attached before it is swept.  Covers the "user triggered the command
 * but the diff tab never opened" edge case.  Longer than any realistic
 * `vscode.diff` → `resolveCustomTextEditor` latency; short enough that
 * registering the same pair again after a cancel works without collisions.
 */
const COMPARE_FILES_TTL_MS = 30_000;

/**
 * Registry for every live BPMN diff session and the panes attached to them.
 *
 * Pure in-memory state with no diff orchestration: it answers "which session
 * holds this pane?", holds SCM panes waiting for their partner, and arms the
 * TTL sweeper that drops orphaned `compare-files` sessions. Deciding *when*
 * to pair, broadcast, or open a diff lives in the controller and service.
 *
 * Implements {@link EditorSubscription} (the host-agnostic `{ dispose(): void }`
 * shape, structurally compatible with `vscode.Disposable`) so the extension
 * host can clear any armed TTL timers on deactivate.
 */
export class DiffPaneStore implements EditorSubscription {
    // Every live session. One file can sit in several, one per open diff tab of it.
    private readonly sessions = new Set<DiffSession>();

    /**
     * SCM panes awaiting their partner, keyed by pairing key (the shared
     * `uri.path`). The Git-provided URI (`git:` in VS Code, `gitfs:` in
     * Theia) and the working-tree `file:` URI meet here before the controller
     * promotes them into a session.
     */
    private readonly pendingScm = new Map<string, DiffPaneHandle[]>();

    /**
     * TTL sweepers for pre-registered `compare-files` sessions.  Cleared
     * once the first pane attaches.
     */
    private readonly ttlTimers = new Map<DiffSession, ReturnType<typeof setTimeout>>();

    private readonly sessionClosedListeners = new Set<(session: DiffSession) => void>();

    /**
     * Pre-registers a `compare-files` session before `vscode.diff` runs.
     *
     * Side assignment is fixed: `beforeUri` is the left pane, `afterUri` the
     * right — matching the visual order VS Code renders `vscode.diff(a, b)`
     * in. A TTL sweeper drops the session if no pane attaches within
     * {@link COMPARE_FILES_TTL_MS}; {@link cancelTtl} disarms it as soon as
     * the first pane arrives.
     */
    registerCompareFiles(beforeUri: string, afterUri: string): DiffSession {
        const session = DiffSession.forCompareFiles(beforeUri, afterUri);
        this.index(session);
        this.ttlTimers.set(
            session,
            setTimeout(() => this.sweepOrphan(session), COMPARE_FILES_TTL_MS),
        );
        return session;
    }

    /** Adds `session`; both the eager `compare-files` and the lazy `scm` path funnel through here. */
    index(session: DiffSession): void {
        this.sessions.add(session);
    }

    /**
     * Returns a session this URI belongs to, one with panes first, or
     * `undefined` when none exists yet.
     */
    findByUri(uri: string): DiffSession | undefined {
        const sessions = [...this.sessions].filter((session) => session.sideFor(uri) !== undefined);
        return sessions.find((session) => !session.isEmpty()) ?? sessions[0];
    }

    /** The session `handle` is attached to, among several sessions of the same file. */
    sessionOf(handle: DiffPaneHandle): DiffSession | undefined {
        return [...this.sessions].find((session) => session.attachedPanes().includes(handle));
    }

    /**
     * The newest session that still waits for a pane on `uri`'s side: a
     * pre-registered `compare-files` session, or one whose pane on that side
     * closed. The newest, because an older one may belong to a compare that
     * VS Code answered by focusing an existing tab.
     */
    awaitingPaneFor(uri: string): DiffSession | undefined {
        return [...this.sessions]
            .reverse()
            .find((session) => session.sideFor(uri) !== undefined && !session.hasPaneFor(uri));
    }

    /**
     * Detaches a pane its host disposed: drops it from the pending SCM panes,
     * or from its session, and closes the session once no pane is left.
     */
    detach(pane: DiffPaneHandle): void {
        if (this.removePendingByHandle(pane)) {
            return;
        }
        const session = this.sessionOf(pane);
        if (!session) {
            return;
        }
        session.detachPane(pane);
        if (session.isEmpty()) {
            this.close(session);
        }
    }

    /** Calls `listener` with every session that closes, once its last pane was detached. */
    onSessionClosed(listener: (session: DiffSession) => void): EditorSubscription {
        this.sessionClosedListeners.add(listener);
        return { dispose: () => this.sessionClosedListeners.delete(listener) };
    }

    /**
     * How many diff panes, attached to a session or still pending SCM pairing,
     * currently render `uri`.
     */
    paneCountFor(uri: string): number {
        const attached = [...this.sessions].filter((session) => session.hasPaneFor(uri)).length;
        const pending = [...this.pendingScm.values()]
            .flat()
            .filter((handle) => handle.uri === uri).length;
        return attached + pending;
    }

    /**
     * Disarms the TTL sweeper for `session`, if one is armed.
     */
    cancelTtl(session: DiffSession): void {
        const timer = this.ttlTimers.get(session);
        if (timer) {
            clearTimeout(timer);
            this.ttlTimers.delete(session);
        }
    }

    /**
     * Takes the pending SCM pane that pairs with `handle`: same key, other
     * URI. Two diffs of one file opening interleaved then pair each Git side
     * with a working-tree side, never two of a kind.
     */
    takePendingPartner(key: string, handle: DiffPaneHandle): DiffPaneHandle | undefined {
        const pending = this.pendingScm.get(key) ?? [];
        const partner = pending.find((candidate) => candidate.uri !== handle.uri);
        if (partner) {
            this.setPending(
                key,
                pending.filter((candidate) => candidate !== partner),
            );
        }
        return partner;
    }

    addPendingScm(key: string, handle: DiffPaneHandle): void {
        this.setPending(key, [...(this.pendingScm.get(key) ?? []), handle]);
    }

    /** Drops a pending SCM pane by identity; `true` when it was pending. */
    private removePendingByHandle(handle: DiffPaneHandle): boolean {
        for (const [key, pending] of this.pendingScm) {
            if (pending.includes(handle)) {
                this.setPending(
                    key,
                    pending.filter((candidate) => candidate !== handle),
                );
                return true;
            }
        }
        return false;
    }

    /**
     * All currently-registered sessions — used to fan a language re-broadcast
     * out to every open diff pane.
     */
    allSessions(): Iterable<DiffSession> {
        return this.sessions.values();
    }

    dispose(): void {
        for (const timer of this.ttlTimers.values()) {
            clearTimeout(timer);
        }
        this.ttlTimers.clear();
    }

    private setPending(key: string, handles: DiffPaneHandle[]): void {
        if (handles.length > 0) {
            this.pendingScm.set(key, handles);
        } else {
            this.pendingScm.delete(key);
        }
    }

    /**
     * TTL expiry: retire the session only if it never gained a pane. A
     * session that attached a pane (and thus cancelled its timer) should
     * never reach here, but the emptiness guard keeps the sweep safe against
     * races.
     */
    private sweepOrphan(session: DiffSession): void {
        this.ttlTimers.delete(session);
        if (session.isEmpty()) {
            this.close(session);
        }
    }

    private close(session: DiffSession): void {
        this.sessions.delete(session);
        this.cancelTtl(session);
        this.sessionClosedListeners.forEach((listener) => listener(session));
    }
}
