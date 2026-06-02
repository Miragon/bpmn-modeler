import { Disposable } from "vscode";

import { DiffPaneHandle, DiffSession } from "../domain/DiffSession";

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
 * owns this URI?", holds SCM panes waiting for their partner, and arms the
 * TTL sweeper that drops orphaned `compare-files` sessions. Deciding *when*
 * to pair, broadcast, or open a diff lives in the controller and service.
 *
 * Implements {@link Disposable} so the extension host can clear any armed TTL
 * timers on deactivate.
 */
export class DiffPaneStore implements Disposable {
    // Every live session, keyed by `${beforeUri}|${afterUri}`.
    private readonly sessions = new Map<string, DiffSession>();

    /**
     * Lookup index: URI string → session it belongs to.  Populated as soon as
     * a session is created, whether pre-registered (`compare-files`) or
     * lazily formed (`scm`).
     */
    private readonly sessionByUri = new Map<string, DiffSession>();

    /**
     * SCM panes awaiting their partner, keyed by pairing key (the shared
     * `uri.path`). The Git-provided URI (`git:` in VS Code, `gitfs:` in
     * Theia) and the working-tree `file:` URI meet here before the controller
     * promotes them into a session.
     */
    private readonly pendingScm = new Map<string, DiffPaneHandle>();

    /**
     * TTL sweepers for pre-registered `compare-files` sessions.  Cleared
     * once the first pane attaches.
     */
    private readonly ttlTimers = new Map<DiffSession, ReturnType<typeof setTimeout>>();

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

    /**
     * Adds `session` to the `sessions` map and the per-URI lookup index.
     *
     * Both session-creation paths (eager `compare-files` and lazy `scm`)
     * funnel through here so the two maps never drift out of sync.
     */
    index(session: DiffSession): void {
        this.sessions.set(this.sessionIdOf(session), session);
        this.sessionByUri.set(session.beforeUri, session);
        this.sessionByUri.set(session.afterUri, session);
    }

    /**
     * Returns the session this URI belongs to, or `undefined` when none
     * exists yet.  Covers both pre-registered `compare-files` sessions and
     * `scm` sessions that have already been promoted from a pending pane.
     */
    findByUri(uri: string): DiffSession | undefined {
        return this.sessionByUri.get(uri);
    }

    /**
     * Removes `session` from both indexes and disarms its TTL timer.
     */
    remove(session: DiffSession): void {
        this.sessions.delete(this.sessionIdOf(session));
        this.sessionByUri.delete(session.beforeUri);
        this.sessionByUri.delete(session.afterUri);
        this.cancelTtl(session);
    }

    /**
     * Returns `true` when any pane — attached to a session or still pending
     * SCM pairing — currently renders `uri`.
     */
    hasPaneForUri(uri: string): boolean {
        const session = this.sessionByUri.get(uri);
        if (session?.hasPaneFor(uri)) {
            return true;
        }
        for (const handle of this.pendingScm.values()) {
            if (handle.uri === uri) {
                return true;
            }
        }
        return false;
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

    getPendingScm(key: string): DiffPaneHandle | undefined {
        return this.pendingScm.get(key);
    }

    addPendingScm(key: string, handle: DiffPaneHandle): void {
        this.pendingScm.set(key, handle);
    }

    deletePendingScm(key: string): void {
        this.pendingScm.delete(key);
    }

    /**
     * Drops a pending SCM pane by identity (used when a pane that never
     * paired is disposed).
     *
     * @returns `true` when a pending entry was found and removed.
     */
    removePendingByHandle(handle: DiffPaneHandle): boolean {
        for (const [key, pending] of this.pendingScm) {
            if (pending === handle) {
                this.pendingScm.delete(key);
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

    private sessionIdOf(session: DiffSession): string {
        return `${session.beforeUri}|${session.afterUri}`;
    }

    /**
     * TTL expiry: retire the session only if it never gained a pane. A
     * session that attached a pane (and thus cancelled its timer) should
     * never reach here, but the emptiness guard keeps the sweep safe against
     * races.
     */
    private sweepOrphan(session: DiffSession): void {
        this.ttlTimers.delete(session);
        if (!session.isEmpty()) {
            return;
        }
        this.sessions.delete(this.sessionIdOf(session));
        this.sessionByUri.delete(session.beforeUri);
        this.sessionByUri.delete(session.afterUri);
    }
}
