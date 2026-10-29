/** Shown when a diagram command finds no visible BPMN diagram to act on. */
export const FOCUS_BPMN_DIAGRAM_MESSAGE = "Focus a BPMN diagram tab, then run the command again.";

/**
 * The editor session a command acts on: the one focused last. Text editors and
 * sidebars are not sessions, so the target stays on a diagram while they have
 * focus. Only a session that opens while no session holds the target takes it
 * without focus, so neither a session that opens behind the focused one nor a
 * same-id replacement that opens in the background moves it.
 *
 * Each change returns the editor that became the target, or `undefined` when
 * none did.
 */
export class CommandTarget {
    /** Every open editor that held the target, the current one last. */
    private readonly holders: string[] = [];

    /**
     * Editors that reported focus and have not blurred since, the oldest first.
     * A host focuses one editor at a time, so focusing one drops the others:
     * among them any editor that opened as focused and whose blur never came.
     */
    private readonly reportedFocused = new Set<string>();

    get editorId(): string | undefined {
        return this.holders[this.holders.length - 1];
    }

    open(editorId: string, focused: boolean): string | undefined {
        if (focused) this.reportedFocused.add(editorId);
        else this.reportedFocused.delete(editorId);
        if (this.editorId !== undefined && !focused) return undefined;
        return this.take(editorId);
    }

    focus(editorId: string): string | undefined {
        this.reportedFocused.clear();
        this.reportedFocused.add(editorId);
        return this.take(editorId);
    }

    /**
     * A blurred target goes to the editor that has reported focus longest, if
     * any: a host that reports an editor focused when it opens behind the
     * focused one corrects that only by blurring it. A target the host focused
     * keeps the target, since no other editor reports focus after that.
     */
    blur(editorId: string): string | undefined {
        this.reportedFocused.delete(editorId);
        if (editorId !== this.editorId) return undefined;
        const [focusedLongest] = this.reportedFocused;
        return focusedLongest === undefined ? undefined : this.take(focusedLongest);
    }

    /**
     * A closed target goes back to the open editor that held it before. When none
     * did, the newest remaining one stands in until the host reports the next
     * focused editor.
     */
    close(editorId: string, remainingEditorIds: readonly string[]): string | undefined {
        const closesTarget = editorId === this.editorId;
        this.forget(editorId);
        this.reportedFocused.delete(editorId);
        if (!closesTarget) return undefined;
        if (this.holders.length === 0 && remainingEditorIds.length > 0) {
            this.holders.push(remainingEditorIds[remainingEditorIds.length - 1]);
        }
        return this.editorId;
    }

    private take(editorId: string): string | undefined {
        if (editorId === this.editorId) return undefined;
        this.forget(editorId);
        this.holders.push(editorId);
        return editorId;
    }

    private forget(editorId: string): void {
        const index = this.holders.indexOf(editorId);
        if (index !== -1) this.holders.splice(index, 1);
    }
}
