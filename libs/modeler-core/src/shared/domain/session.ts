/**
 * Per-editor echo-prevention guard. It suppresses only a document change whose
 * content matches an in-flight core write; a different host edit must still
 * advance the document revision and render while that write is pending.
 */
export class ModelerSession {
    readonly id: string;

    private readonly guardedContent = new Map<string, number>();

    constructor(id: string) {
        this.id = id;
    }

    acquireGuard(content: string): void {
        const key = normalizeContent(content);
        this.guardedContent.set(key, (this.guardedContent.get(key) ?? 0) + 1);
    }

    releaseGuard(content: string): void {
        const key = normalizeContent(content);
        const count = this.guardedContent.get(key) ?? 0;
        if (count <= 1) this.guardedContent.delete(key);
        else this.guardedContent.set(key, count - 1);
    }

    isGuarded(content: string): boolean {
        return this.guardedContent.has(normalizeContent(content));
    }
}

const normalizeContent = (content: string): string => content.replace(/\r\n?/g, "\n");
