import { DiffPaneHandle } from "../diff/port/DiffPaneHandle";

/** One diff pane whose document and webview live in memory; `posted` records what reached the webview. */
export class FakeDiffPaneHandle implements DiffPaneHandle {
    readonly posted: unknown[] = [];
    disposed = false;
    private ready = false;

    constructor(
        readonly uri: string,
        private readonly text = "",
    ) {}

    isReady(): boolean {
        return this.ready;
    }

    setReady(): void {
        this.ready = true;
    }

    getText(): string {
        return this.text;
    }

    async postMessage(message: unknown): Promise<boolean> {
        this.posted.push(message);
        return true;
    }

    dispose(): void {
        this.disposed = true;
    }
}
