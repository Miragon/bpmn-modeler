import { _electron as electron, type ElectronApplication, type Page } from "playwright-core";

/** Playwright's text for the inspector's "Promise was collected". */
const COLLECTED_PROMISE = "Resulting promise was garbage collected";
const COLLECTED_PROMISE_ATTEMPTS = 10;
const CLOSE_TIMEOUT_MS = 10_000;

type ElectronLaunchOptions = NonNullable<Parameters<typeof electron.launch>[0]>;

interface BrowserWindowState {
    focused: boolean;
    visible: boolean;
    webContentsFocused: boolean;
}

/**
 * Electron's main process of the VS Code under test. Each evaluate goes
 * through `repeatWhileInspectorCollectsPromise` or leaves its rejection to a
 * caller that catches it.
 */
export class ElectronMainProcess {
    private constructor(private readonly app: ElectronApplication) {}

    static async launch(options: ElectronLaunchOptions): Promise<ElectronMainProcess> {
        return new ElectronMainProcess(await electron.launch(options));
    }

    firstWindow(timeoutMs: number): Promise<Page> {
        return this.app.firstWindow({ timeout: timeoutMs });
    }

    async resizeFirstWindow(size: { width: number; height: number }): Promise<void> {
        await repeatWhileInspectorCollectsPromise(() =>
            this.app.evaluate(({ BrowserWindow }, { width, height }) => {
                BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
            }, size),
        );
    }

    /** Not repeated, so the caller catches a collected promise. */
    windowStates(): Promise<BrowserWindowState[]> {
        return this.app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().map((window) => ({
                focused: window.isFocused(),
                visible: window.isVisible(),
                webContentsFocused: window.webContents.isFocused(),
            })),
        );
    }

    clipboardText(): Promise<string> {
        return repeatWhileInspectorCollectsPromise(() =>
            this.app.evaluate(({ clipboard }) => clipboard.readText()),
        );
    }

    /**
     * A modal dialog left by a failed step blocks a graceful quit. A killed VS Code
     * may not have flushed its global state, so the caller learns which it was.
     */
    async close(): Promise<"quit" | "killed"> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const closed = await Promise.race([
            this.app.close().then(
                () => true,
                () => true,
            ),
            new Promise<false>((done) => (timer = setTimeout(() => done(false), CLOSE_TIMEOUT_MS))),
        ]);
        clearTimeout(timer);
        if (closed) return "quit";
        this.app.process().kill("SIGKILL");
        return "killed";
    }
}

/**
 * V8 before 15.2 holds the promise of an evaluate only weakly: a garbage collection
 * in Electron's main process before it settles rejects a call that already ran.
 * Only for an evaluation that may run twice.
 */
async function repeatWhileInspectorCollectsPromise<T>(evaluate: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await evaluate();
        } catch (error) {
            const collected = error instanceof Error && error.message.includes(COLLECTED_PROMISE);
            if (!collected || attempt === COLLECTED_PROMISE_ATTEMPTS) throw error;
            console.log(`[vscode-smoke] ${COLLECTED_PROMISE}, attempt ${attempt + 1}`);
        }
    }
}
