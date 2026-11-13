/** The template folders each open editor loaded. */
export class LoadedTemplateDirs {
    private readonly dirsByEditor = new Map<string, readonly string[]>();
    private readonly listeners = new Set<() => void>();

    record(editorId: string, templateDirs: readonly string[]): void {
        this.announceChange(() => this.dirsByEditor.set(editorId, templateDirs));
    }

    release(editorId: string): void {
        this.announceChange(() => this.dirsByEditor.delete(editorId));
    }

    /** Nested ones included, each once. */
    list(): string[] {
        return [...new Set([...this.dirsByEditor.values()].flat())];
    }

    /** An editor whose document has no template folder counts too. */
    hasEditors(): boolean {
        return this.dirsByEditor.size > 0;
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    private announceChange(change: () => void): void {
        const before = this.list().join("\n");
        change();
        if (this.list().join("\n") !== before) {
            this.listeners.forEach((listener) => listener());
        }
    }
}
