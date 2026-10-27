/**
 * The editor session a command acts on: the one focused last. Text editors and
 * sidebars are not sessions, so the target stays on a diagram while they have
 * focus, and a session that opens behind the focused one must not take it.
 *
 * Each change returns the editor that became the target, or `undefined` when
 * none did.
 */
export class CommandTarget {
    get editorId(): string | undefined {
        return undefined;
    }

    open(_editorId: string, _focused: boolean): string | undefined {
        return undefined;
    }

    focus(_editorId: string): string | undefined {
        return undefined;
    }

    close(_editorId: string, _remainingEditorIds: readonly string[]): string | undefined {
        return undefined;
    }
}
