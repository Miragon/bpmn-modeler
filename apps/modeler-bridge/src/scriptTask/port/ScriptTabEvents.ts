/** What the host reports about its script tabs; the script editor keeps the tabs in sync. */
export interface ScriptTabEvents {
    didChange(scriptId: string, content: string): void;
    didClose(scriptId: string): Promise<void> | void;
    adoptExternalOpen(filePath: string): Promise<void> | void;
}
