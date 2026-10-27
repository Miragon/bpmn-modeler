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

    get editorId(): string | undefined {
        return this.holders[this.holders.length - 1];
    }

    open(editorId: string, focused: boolean): string | undefined {
        if (this.editorId !== undefined && !focused) return undefined;
        return this.focus(editorId);
    }

    focus(editorId: string): string | undefined {
        if (editorId === this.editorId) return undefined;
        this.forget(editorId);
        this.holders.push(editorId);
        return editorId;
    }

    /**
     * A closed target goes back to the open editor that held it before. When none
     * did, the newest remaining one stands in until the host reports the next
     * focused editor.
     */
    close(editorId: string, remainingEditorIds: readonly string[]): string | undefined {
        const closesTarget = editorId === this.editorId;
        this.forget(editorId);
        if (!closesTarget) return undefined;
        if (this.holders.length === 0 && remainingEditorIds.length > 0) {
            this.holders.push(remainingEditorIds[remainingEditorIds.length - 1]);
        }
        return this.editorId;
    }

    private forget(editorId: string): void {
        const index = this.holders.indexOf(editorId);
        if (index !== -1) this.holders.splice(index, 1);
    }
}
