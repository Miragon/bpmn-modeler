import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DRIVER_SOURCES = fileURLToPath(new URL("./driver/", import.meta.url));
const ENDPOINT_FILE = "endpoint.json";
const RETRY_INTERVAL_MS = 100;
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

interface Endpoint {
    port: number;
    token: string;
}

interface WindowState {
    windowFocused: boolean;
    activeTab: string | null;
    /** The tabs of each editor group. */
    tabs: { label: string; isDirty: boolean }[][];
}

/** What the driver does in its window; `./driver/extension.cjs` holds the other half. */
interface DriverOperations {
    executeCommand: { payload: { command: string; args: unknown[] }; result: void };
    updateSetting: { payload: { key: string; value: unknown }; result: void };
    closeTabs: { payload: { labels: string[] }; result: void };
    revertAndCloseAllEditors: { payload?: undefined; result: void };
    windowState: { payload?: undefined; result: WindowState };
    unmergedFiles: { payload?: undefined; result: string[] };
}

/** A file's URI as a command argument, which the driver turns into a `vscode.Uri`. */
export function fileUri(path: string): { $fileUri: string } {
    return { $fileUri: path };
}

/** A call the driver ran, or one that never reached a driver and can be sent again. */
type Attempt = { reached: true; result: unknown } | { reached: false; reason: unknown };

function isConnectionRefused(error: unknown): boolean {
    const cause = (error as { cause?: { code?: string; errors?: { code?: string }[] } }).cause;
    return (
        cause?.code === "ECONNREFUSED" ||
        (cause?.errors ?? []).some(({ code }) => code === "ECONNREFUSED")
    );
}

/**
 * Asks the companion extension in `./driver` to act on its window through
 * the VS Code API: run a command by its id, change a setting, close tabs,
 * report the window's state and what Git lists as unmerged.
 */
export class VsCodeDriver {
    private constructor(
        readonly extensionPath: string,
        private readonly timeoutMs: number,
    ) {}

    /** Copies the driver into `sessionRoot`, where the window started on it writes its endpoint. */
    static async install(sessionRoot: string, timeoutMs: number): Promise<VsCodeDriver> {
        const extensionPath = join(sessionRoot, "driver");
        await cp(DRIVER_SOURCES, extensionPath, { recursive: true });
        // The endpoint of an earlier window on this root answers no more.
        await rm(join(extensionPath, ENDPOINT_FILE), { force: true });
        return new VsCodeDriver(extensionPath, timeoutMs);
    }

    /**
     * Waits for the window's extension host, also after a reload, which starts
     * a new one on a new port. A command that awaits a modal dialog never
     * returns, so no test plumbing may run one.
     */
    async call<Name extends keyof DriverOperations>(
        operation: Name,
        payload?: DriverOperations[Name]["payload"],
    ): Promise<DriverOperations[Name]["result"]> {
        const deadline = Date.now() + this.timeoutMs;
        let lastReason: unknown = new Error("no attempt was made");
        while (Date.now() < deadline) {
            const attempt = await this.send(operation, payload, deadline);
            if (attempt.reached) return attempt.result as DriverOperations[Name]["result"];
            lastReason = attempt.reason;
            await delay(RETRY_INTERVAL_MS);
        }
        throw new Error(
            `the smoke driver was not reachable within ${this.timeoutMs} ms: ${String(lastReason)}`,
        );
    }

    /** Throws once a driver has the call: sending it again could run it twice. */
    private async send(operation: string, payload: unknown, deadline: number): Promise<Attempt> {
        const endpoint = await readFile(join(this.extensionPath, ENDPOINT_FILE), "utf8")
            .then((text) => JSON.parse(text) as Endpoint)
            .catch((reason: unknown) => ({ reason }));
        // Not written yet, or the window is halfway through writing it.
        if ("reason" in endpoint) return { reached: false, reason: endpoint.reason };
        let response: Response;
        try {
            response = await fetch(`http://127.0.0.1:${endpoint.port}/`, {
                method: "POST",
                headers: {
                    "authorization": `Bearer ${endpoint.token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ operation, payload }),
                signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
            });
        } catch (error) {
            // Nothing listens there yet, or no more: the endpoint file is about to change.
            if (isConnectionRefused(error)) return { reached: false, reason: error };
            throw new Error(
                `the smoke driver did not answer ${operation} (a modal dialog may be waiting): ${String(error)}`,
                { cause: error },
            );
        }
        // Another process took the port of a window that is gone.
        if (response.status === 401) {
            return { reached: false, reason: new Error("the port has a new owner") };
        }
        const answer = (await response.json()) as { result?: unknown; error?: string };
        if (!response.ok) {
            throw new Error(answer.error ?? `the smoke driver answered ${response.status}`);
        }
        return { reached: true, result: answer.result };
    }
}
