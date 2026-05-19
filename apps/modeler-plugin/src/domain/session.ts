/**
 * Per-editor echo-prevention guard. Breaks infinite sync loops: when the
 * extension writes to the document in response to a webview SyncDocumentCommand,
 * the resulting onDidChangeTextDocument event must not re-send the document
 * back to the webview.
 *
 * A counter (not a boolean) lets overlapping async writes nest safely.
 */
export class ModelerSession {
    readonly id: string;

    private guardCount = 0;

    constructor(id: string) {
        this.id = id;
    }

    acquireGuard(): void {
        this.guardCount++;
    }

    releaseGuard(): void {
        if (this.guardCount > 0) {
            this.guardCount--;
        }
    }

    isGuarded(): boolean {
        return this.guardCount > 0;
    }
}
