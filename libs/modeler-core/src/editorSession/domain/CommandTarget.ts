/**
 * The editor session a command acts on: the one focused last. Text editors and
 * sidebars are not sessions, so the target stays on a diagram while they have
 * focus, and a session that opens behind the focused one must not take it.
 *
 * Each change returns the editor that became the target, or `undefined` when
 * none did.
 */
export class CommandTarget {
    private target: string | undefined;

    get editorId(): string | undefined {
        return this.target;
    }

    open(editorId: string, focused: boolean): string | undefined {
        if (this.target !== undefined && !focused) return undefined;
        return this.focus(editorId);
    }

    focus(editorId: string): string | undefined {
        if (editorId === this.target) return undefined;
        this.target = editorId;
        return editorId;
    }

    /** Until the host reports the next focused editor, the newest remaining one stands in. */
    close(editorId: string, remainingEditorIds: readonly string[]): string | undefined {
        if (editorId !== this.target) return undefined;
        this.target = remainingEditorIds[remainingEditorIds.length - 1];
        return this.target;
    }
}
